import { supabase } from './supabase.js'

// ════════════════════════════════════════════════════════════════════════════
// RASTREIO v2 — motor resiliente de localização
// ────────────────────────────────────────────────────────────────────────────
// Diferenças sobre a versão anterior:
//
// 1. FILA OFFLINE (IndexedDB): se o envio ao Supabase falhar (sem rede, timeout),
//    a posição NÃO é perdida — vai pra uma fila local e é reenviada depois.
//
// 2. REENVIO AUTOMÁTICO: a cada ciclo e sempre que a conexão/aba volta, o que
//    está preso na fila é drenado para o banco.
//
// 3. WAKE LOCK: enquanto o app está aberto e visível, tenta impedir a tela de
//    apagar — mantém o setInterval vivo por mais tempo.
//
// 4. VISIBILITYCHANGE: quando o fiscal reabre a aba ou desbloqueia o celular,
//    dispara captura imediata (não espera o próximo ciclo).
//
// 5. HEARTBEAT DE PRESENÇA: grava também na tabela `fiscais_presenca` (upsert)
//    o "último visto" — o mapa sempre sabe onde o fiscal esteve por último.
//
// ⚠️ LIMITE HONESTO: isto NÃO rastreia com tela apagada + celular no bolso por
//    horas. Isso só com app nativo (Capacitor). Aqui resolvemos perda de dados,
//    captura na volta, e "última posição conhecida".
// ════════════════════════════════════════════════════════════════════════════

const INTERVALO_MS = 8000   // ciclo de captura (8s)
const GEO_OPTS     = { enableHighAccuracy: true, timeout: 7000, maximumAge: 3000 }
const DB_NAME      = 'rastreio_fila'
const STORE        = 'posicoes'

let intervalId   = null
let usuarioAtual = null
let wakeLock     = null
let rodando      = false

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

// ─── Captura uma posição agora ──────────────────────────────────────────────
function capturarAgora() {
  if (!usuarioAtual || !navigator.geolocation) return
  navigator.geolocation.getCurrentPosition(
    pos => processarPosicao(usuarioAtual, pos),
    err => console.warn('[rastreio] GPS:', err?.message),
    GEO_OPTS,
  )
}

// ─── Wake Lock: tenta manter a tela ligada (só com aba visível) ─────────────
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

// ─── Handlers ───────────────────────────────────────────────────────────────
function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    capturarAgora()    // voltou ao app: captura na hora
    pedirWakeLock()    // re-pede wake lock (é liberado ao sair)
    drenarFila()
  }
}

function onOnline() {
  drenarFila()
  capturarAgora()
}

// ─── API pública ────────────────────────────────────────────────────────────
export function iniciarRastreio(usuario) {
  if (!usuario || !navigator.geolocation) return
  if (rodando) pararRastreio()  // evita timers duplicados

  usuarioAtual = usuario
  rodando = true

  capturarAgora()      // 1. captura imediata
  pedirWakeLock()      // 2. mantém tela viva enquanto app aberto

  // 3. ciclo periódico
  intervalId = setInterval(() => {
    capturarAgora()
    drenarFila()
  }, INTERVALO_MS)

  // 4. captura ao voltar pro app / desbloquear
  document.addEventListener('visibilitychange', onVisibilityChange)

  // 5. drena fila quando a conexão volta
  window.addEventListener('online', onOnline)

  console.log('[rastreio] iniciado para', usuario.login)
}

export function pararRastreio() {
  if (intervalId) { clearInterval(intervalId); intervalId = null }
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('online', onOnline)
  liberarWakeLock()
  drenarFila()  // última tentativa de esvaziar antes de parar
  usuarioAtual = null
  rodando = false
  console.log('[rastreio] parado')
}

export { drenarFila }
