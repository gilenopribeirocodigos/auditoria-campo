import { supabase } from './supabase.js'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { App } from '@capacitor/app'

// ════════════════════════════════════════════════════════════════════════════
// RASTREIO v3 — motor resiliente de localização
// ────────────────────────────────────────────────────────────────────────────
// Dois modos, escolhidos automaticamente por Capacitor.isNativePlatform():
//
// • NAVEGADOR / PWA (web): captura via navigator.geolocation a cada 8s, só
//   enquanto a aba está aberta e em primeiro plano. Mesmo comportamento de
//   sempre — ver seções 1-5 abaixo.
//
// • APP ANDROID NATIVO (Capacitor): usa o plugin
//   @capacitor-community/background-geolocation, que roda um foreground
//   service e continua entregando posições mesmo com o app minimizado ou a
//   tela apagada (com a notificação fixa que o Android exige). A cadência
//   real de captura do plugin é mais rápida que o necessário (o serviço
//   nativo amostra a cada ~1s); aplicamos nosso próprio filtro de tempo no
//   callback pra manter ~8s em primeiro plano e ~20s em segundo plano —
//   evita gravar/gastar bateria mais do que o combinado.
//
// Em ambos os modos:
// 1. FILA OFFLINE (IndexedDB): se o envio ao Supabase falhar (sem rede, timeout),
//    a posição NÃO é perdida — vai pra uma fila local e é reenviada depois.
// 2. REENVIO AUTOMÁTICO: a cada ciclo e sempre que a conexão/aba volta, o que
//    está preso na fila é drenado para o banco.
// 3. HEARTBEAT DE PRESENÇA: grava também na tabela `fiscais_presenca` (upsert)
//    o "último visto" — o mapa sempre sabe onde o fiscal esteve por último.
//
// ⚠️ No modo web (PWA comum, sem instalar o app Android), o limite de sempre
//    continua valendo: NÃO rastreia com tela apagada por horas.
// ════════════════════════════════════════════════════════════════════════════

const INTERVALO_FOREGROUND_MS = 8000    // ciclo de captura com o app em primeiro plano
const INTERVALO_BACKGROUND_MS = 20000   // ciclo de captura com o app em segundo plano (só no app nativo)
const GEO_OPTS = { enableHighAccuracy: true, timeout: 7000, maximumAge: 3000 }
const DB_NAME  = 'rastreio_fila'
const STORE    = 'posicoes'

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation')

let intervalId          = null
let usuarioAtual        = null
let wakeLock             = null
let rodando              = false
let watcherNativoId      = null
let removerListenerApp   = null
let emPrimeiroPlano      = true
let ultimaCapturaNativaMs = 0

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
async function processarPosicao(usuario, pos) {
  const registro = {
    fiscal_login: usuario.login,
    fiscal_nome:  usuario.nome,
    lat:          pos.coords.latitude,
    lng:          pos.coords.longitude,
    precisao:     pos.coords.accuracy,
    created_at:   new Date().toISOString(),  // timestamp local — preserva ordem
  }

  // Heartbeat em paralelo
  atualizarPresenca(usuario, pos.coords)

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
    pos => processarPosicao(usuarioAtual, pos),
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
  emPrimeiroPlano = true
  ultimaCapturaNativaMs = 0
  try {
    const { isActive } = await App.getState()
    emPrimeiroPlano = isActive
  } catch { /* segue com o padrão (primeiro plano) */ }

  try {
    const { remove } = await App.addListener('appStateChange', ({ isActive }) => {
      emPrimeiroPlano = isActive
    })
    removerListenerApp = remove
  } catch (e) {
    console.warn('[rastreio] appStateChange indisponível:', e?.message)
  }

  try {
    watcherNativoId = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: 'Auditoria de Campo',
        backgroundMessage: 'Rastreando localização em segundo plano.',
        requestPermissions: true,
        stale: false,
        distanceFilter: 0,
      },
      (location, error) => {
        if (error) { console.warn('[rastreio] nativo erro:', error?.message); return }
        if (!location || !usuarioAtual) return
        const agora = Date.now()
        const cadencia = emPrimeiroPlano ? INTERVALO_FOREGROUND_MS : INTERVALO_BACKGROUND_MS
        if (agora - ultimaCapturaNativaMs < cadencia) return
        ultimaCapturaNativaMs = agora
        processarPosicao(usuarioAtual, {
          coords: { latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy },
        })
      },
    )
  } catch (e) {
    console.warn('[rastreio] falha ao iniciar watcher nativo:', e?.message)
  }
}

async function pararRastreioNativo() {
  if (watcherNativoId) {
    try { await BackgroundGeolocation.removeWatcher({ id: watcherNativoId }) }
    catch (e) { console.warn('[rastreio] falha ao remover watcher nativo:', e?.message) }
    watcherNativoId = null
  }
  if (removerListenerApp) {
    try { removerListenerApp() } catch { /* ignore */ }
    removerListenerApp = null
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
