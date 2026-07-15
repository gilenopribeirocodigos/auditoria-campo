import { supabase } from './supabase.js'
import { Capacitor, registerPlugin } from '@capacitor/core'

// ════════════════════════════════════════════════════════════════════════════
// RASTREIO v4 — motor resiliente de localização
// ────────────────────────────────────────────────────────────────────────────
// Dois modos, escolhidos automaticamente por Capacitor.isNativePlatform():
//
// • NAVEGADOR / PWA (web): captura via navigator.geolocation a cada 8s, só
//   enquanto a aba está aberta e em primeiro plano — grava direto por aqui
//   (processarPosicao), com fila offline em IndexedDB. Mesmo comportamento
//   de sempre, sem mudanças — é o único caminho possível sem app nativo.
//
// • APP ANDROID NATIVO (Capacitor): usa o plugin
//   @capacitor-community/background-geolocation, que roda um foreground
//   service e continua entregando posições mesmo com o app minimizado ou a
//   tela apagada. A partir da v4, o CÓDIGO NATIVO (Java) é quem grava a
//   localização direto no Supabase — com seu próprio debounce (8s) e fila
//   offline (arquivo local, mesma ideia do IndexedDB) — sem depender da
//   ponte JS/WebView continuar rodando em segundo plano, que era o ponto
//   de falha confirmado em campo (a notificação ficava viva, mas a
//   gravação via JS nunca acontecia). O JS aqui só CONFIGURA o nativo
//   (configurarSupabase) e liga o watcher; o callback já não grava nada,
//   pra não duplicar o que o Java já fez.
//
//   ⚠️ O app Android não se atualiza sozinho (diferente do site, que já sobe
//   o bundle novo automaticamente) — se o APK instalado for de ANTES dessa
//   mudança, o método configurarSupabase nem existe no nativo. Por isso
//   `nativoConfigurado` detecta essa falha e o próprio JS assume a gravação
//   a cada posição do watcher nativo (fallback), reaproveitando a mesma fila
//   offline em IndexedDB — sem isso, um fiscal com APK desatualizado ficaria
//   sem nenhuma gravação (nem nativa, nem via JS).
//
// ⚠️ No modo web (PWA comum, sem instalar o app Android), o limite de sempre
//    continua valendo: NÃO rastreia com tela apagada por horas.
// ════════════════════════════════════════════════════════════════════════════

const INTERVALO_FOREGROUND_MS = 8000    // ciclo de captura do modo web/PWA
const GEO_OPTS = { enableHighAccuracy: true, timeout: 7000, maximumAge: 3000 }
const DB_NAME  = 'rastreio_fila'
const STORE    = 'posicoes'

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation')

let intervalId        = null
let usuarioAtual      = null
let wakeLock           = null
let rodando            = false
let watcherNativoId    = null
let nativoConfigurado  = false  // true só quando o APK instalado já tem o método configurarSupabase

// ─── IndexedDB: fila local de posições não enviadas ─────────────────────────
function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

async function enfileirar(registro) {
  try {
    const db = await abrirDB()
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).add(registro)
      tx.oncomplete = res
      tx.onerror    = () => rej(tx.error)
    })
  } catch (e) {
    console.warn('[rastreio] falha ao enfileirar:', e?.message)
  }
}

async function lerFila() {
  try {
    const db = await abrirDB()
    return await new Promise((res, rej) => {
      const tx  = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).getAll()
      req.onsuccess = () => res(req.result || [])
      req.onerror   = () => rej(req.error)
    })
  } catch { return [] }
}

async function removerDaFila(ids) {
  if (!ids.length) return
  try {
    const db = await abrirDB()
    await new Promise((res, rej) => {
      const tx    = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      ids.forEach(id => store.delete(id))
      tx.oncomplete = res
      tx.onerror    = () => rej(tx.error)
    })
  } catch (e) {
    console.warn('[rastreio] falha ao limpar fila:', e?.message)
  }
}

// ─── Drena a fila: tenta enviar tudo que está preso ─────────────────────────
async function drenarFila() {
  if (!navigator.onLine) return
  const fila = await lerFila()
  if (fila.length === 0) return

  const payload = fila.map(({ id, ...resto }) => resto)
  try {
    const { error } = await supabase.from('localizacoes').insert(payload)
    if (!error) {
      await removerDaFila(fila.map(f => f.id))
      console.log(`[rastreio] ${payload.length} posição(ões) da fila enviadas`)
    }
  } catch (e) {
    console.warn('[rastreio] drenar falhou, mantém na fila:', e?.message)
  }
}

// ─── Heartbeat: upsert da última posição por fiscal ─────────────────────────
async function atualizarPresenca(usuario, coords) {
  try {
    await supabase.from('fiscais_presenca').upsert({
      fiscal_login: usuario.login,
      fiscal_nome:  usuario.nome,
      lat:          coords.latitude,
      lng:          coords.longitude,
      precisao:     coords.accuracy,
      ultimo_visto: new Date().toISOString(),
    }, { onConflict: 'fiscal_login' })
  } catch (e) {
    console.warn('[rastreio] presença falhou:', e?.message)
  }
}

// ─── Envia uma posição: tenta direto, se falhar enfileira ───────────────────
// `coords` é sempre {latitude,longitude,accuracy} — tanto o navegador quanto
// o plugin nativo entregam nesse formato achatado, então um único caminho
// atende os dois (web normal e o fallback nativo abaixo).
async function processarPosicao(usuario, coords) {
  const registro = {
    fiscal_login: usuario.login,
    fiscal_nome:  usuario.nome,
    lat:          coords.latitude,
    lng:          coords.longitude,
    precisao:     coords.accuracy,
    created_at:   new Date().toISOString(),  // timestamp local — preserva ordem
  }

  // Heartbeat em paralelo
  atualizarPresenca(usuario, coords)

  if (navigator.onLine) {
    try {
      const { error } = await supabase.from('localizacoes').insert(registro)
      if (error) { await enfileirar(registro); return }
      drenarFila()  // aproveita pra esvaziar o que estava preso
      return
    } catch {
      await enfileirar(registro)
      return
    }
  }
  await enfileirar(registro)  // offline → direto pra fila
}

// ─── Captura uma posição agora (modo web) ───────────────────────────────────
function capturarAgora() {
  if (!usuarioAtual || !navigator.geolocation) return
  navigator.geolocation.getCurrentPosition(
    pos => processarPosicao(usuarioAtual, pos.coords),
    err => console.warn('[rastreio] GPS:', err?.message),
    GEO_OPTS,
  )
}

// ─── Wake Lock: tenta manter a tela ligada (só com aba visível, modo web) ───
async function pedirWakeLock() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen')
      wakeLock.addEventListener?.('release', () => { wakeLock = null })
    }
  } catch (e) {
    console.warn('[rastreio] wakeLock indisponível:', e?.message)
  }
}

function liberarWakeLock() {
  try { wakeLock?.release?.() } catch { /* ignore */ }
  wakeLock = null
}

// ─── Handlers (comuns aos dois modos) ────────────────────────────────────────
function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    if (!Capacitor.isNativePlatform()) {
      capturarAgora()   // voltou ao app (web): captura na hora
      pedirWakeLock()   // re-pede wake lock (é liberado ao sair)
    }
    drenarFila()
  }
}

function onOnline() {
  drenarFila()
  if (!Capacitor.isNativePlatform()) capturarAgora()
}

// ─── Modo nativo Android: liga o watcher em segundo plano de verdade ────────
async function iniciarRastreioNativo(usuario) {
  // Passa a config pro lado nativo ANTES de ligar o watcher — é o código
  // Java quem grava a localização direto no Supabase a partir daqui (com
  // fila offline própria), sem depender do JS/WebView estar rodando.
  // Se essa chamada falhar, é sinal de que o APK instalado é ANTERIOR à
  // versão que criou esse método nativo (configurarSupabase não existe
  // nesse build) — nesse caso `nativoConfigurado` fica false e o próprio
  // JS assume a gravação a cada posição recebida do watcher, como fallback.
  nativoConfigurado = false
  try {
    await BackgroundGeolocation.configurarSupabase({
      url:         import.meta.env.VITE_SUPABASE_URL,
      anonKey:     import.meta.env.VITE_SUPABASE_ANON_KEY,
      schema:      import.meta.env.VITE_SUPABASE_SCHEMA || 'dev',
      fiscalLogin: usuario.login,
      fiscalNome:  usuario.nome,
    })
    nativoConfigurado = true
  } catch (e) {
    console.warn('[rastreio] configurarSupabase indisponível (APK desatualizado?) — usando fallback via JS:', e?.message)
  }

  try {
    watcherNativoId = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: 'VérticeGP',
        backgroundMessage: 'Rastreando localização em segundo plano.',
        requestPermissions: true,
        stale: false,
        distanceFilter: 0,
      },
      (location, error) => {
        if (error) { console.warn('[rastreio] nativo erro:', error?.message); return }
        // Caminho normal (APK atualizado): o código nativo (Java) já grava
        // a posição direto no Supabase — não faz nada aqui, pra não duplicar.
        // Fallback (APK antigo, sem configurarSupabase): grava por aqui
        // mesmo, reaproveitando a fila offline em IndexedDB já existente.
        if (!nativoConfigurado && location && usuarioAtual) {
          processarPosicao(usuarioAtual, {
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
          })
        }
      },
    )
  } catch (e) {
    console.warn('[rastreio] falha ao iniciar watcher nativo:', e?.message)
  }

  // Pede, num único toque, pra ignorar a otimização de bateria PADRÃO do
  // Android (Doze) — não bloqueia nada se falhar/for negado. Isso NÃO cobre
  // gerenciadores de bateria proprietários de fabricante (ex: "Economia de
  // bateria"/"Início automático" da MIUI/HyperOS) — esses continuam exigindo
  // ajuste manual do usuário nas configurações do aparelho.
  try {
    await BackgroundGeolocation.requestIgnoreBatteryOptimizations()
  } catch (e) {
    console.warn('[rastreio] pedido de isenção de bateria falhou:', e?.message)
  }
}

async function pararRastreioNativo() {
  if (watcherNativoId) {
    try { await BackgroundGeolocation.removeWatcher({ id: watcherNativoId }) }
    catch (e) { console.warn('[rastreio] falha ao remover watcher nativo:', e?.message) }
    watcherNativoId = null
  }
  // Limpa a config salva no nativo (SharedPreferences) — sem isso, o
  // RastreioBootReceiver poderia religar o rastreio deste fiscal, já
  // deslogado, no próximo boot do aparelho.
  try { await BackgroundGeolocation.limparConfiguracaoNativa() }
  catch (e) { console.warn('[rastreio] falha ao limpar config nativa:', e?.message) }
  nativoConfigurado = false
}

// ─── Diagnóstico (tela de diagnóstico do app) ───────────────────────────────
export async function obterDiagnosticoRastreio() {
  if (!Capacitor.isNativePlatform()) return null
  try {
    return await BackgroundGeolocation.obterDiagnostico()
  } catch (e) {
    console.warn('[rastreio] falha ao obter diagnóstico:', e?.message)
    return null
  }
}

export async function sincronizarRastreioAgora() {
  if (!Capacitor.isNativePlatform()) return
  try {
    await BackgroundGeolocation.sincronizarAgora()
  } catch (e) {
    console.warn('[rastreio] falha ao sincronizar agora:', e?.message)
  }
}

// ─── API pública ────────────────────────────────────────────────────────────
export function iniciarRastreio(usuario) {
  if (!usuario) return
  if (rodando) pararRastreio()  // evita timers/watchers duplicados

  usuarioAtual = usuario
  rodando = true

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('online', onOnline)

  if (Capacitor.isNativePlatform()) {
    iniciarRastreioNativo(usuario)
    console.log('[rastreio] iniciado (app Android, segundo plano real) para', usuario.login)
    return
  }

  if (!navigator.geolocation) return

  capturarAgora()      // 1. captura imediata
  pedirWakeLock()      // 2. mantém tela viva enquanto app aberto

  // 3. ciclo periódico
  intervalId = setInterval(() => {
    capturarAgora()
    drenarFila()
  }, INTERVALO_FOREGROUND_MS)

  console.log('[rastreio] iniciado (navegador/PWA) para', usuario.login)
}

export function pararRastreio() {
  if (intervalId) { clearInterval(intervalId); intervalId = null }
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('online', onOnline)
  liberarWakeLock()
  pararRastreioNativo()
  drenarFila()  // última tentativa de esvaziar antes de parar
  usuarioAtual = null
  rodando = false
  console.log('[rastreio] parado')
}

export { drenarFila }
