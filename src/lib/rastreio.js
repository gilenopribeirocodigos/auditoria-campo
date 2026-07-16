import { supabase } from './supabase.js'
import { Capacitor } from '@capacitor/core'
import BackgroundGeolocation from '@transistorsoft/capacitor-background-geolocation'

// ════════════════════════════════════════════════════════════════════════════
// RASTREIO v5 — motor resiliente de localização
// ────────────────────────────────────────────────────────────────────────────
// Dois modos, escolhidos automaticamente por Capacitor.isNativePlatform():
//
// • NAVEGADOR / PWA (web): captura via navigator.geolocation a cada 8s, só
//   enquanto a aba está aberta e em primeiro plano — grava direto por aqui
//   (processarPosicao), com fila offline em IndexedDB. Mesmo comportamento
//   de sempre, sem mudanças — é o único caminho possível sem app nativo.
//
// • APP ANDROID NATIVO (Capacitor): a partir da v5, usa o SDK PAGO da
//   Transistor Software (@transistorsoft/capacitor-background-geolocation),
//   em teste em modo DEBUG (sem licença — funciona sem restrição em builds
//   debug, só exige a chave paga em builds de release). Trocado depois que
//   o plugin gratuito anterior (@capacitor-community/background-geolocation)
//   se mostrou incapaz de sobreviver ao gerenciador de processos da
//   Xiaomi/HyperOS: mesmo com foreground service, notificação visível e
//   toda a engenharia de reforço (alarmes, heartbeat, fila offline nativa),
//   o processo do app era morto em segundo plano e só voltava quando o
//   fiscal abria o app manualmente. O SDK da Transistor faz TUDO isso
//   nativamente (persistência SQLite própria + envio HTTP direto, sem
//   depender do JS/WebView) e tem anos de engenharia específica pra
//   sobreviver aos gerenciadores de bateria proprietários dos fabricantes —
//   é exatamente isso que estamos pagando pra validar.
//
//   O envio vai direto pra uma função RPC no Supabase
//   (`registrar_localizacao_fiscal`, ver sql/2026-07-15_rpc_...sql) que grava
//   a trilha (localizacoes) e o heartbeat de presença (fiscais_presenca) num
//   único POST — sem precisar de nenhum código nativo escrito por nós.
//
// ⚠️ No modo web (PWA comum, sem instalar o app Android), o limite de sempre
//    continua valendo: NÃO rastreia com tela apagada por horas.
// ════════════════════════════════════════════════════════════════════════════

const INTERVALO_FOREGROUND_MS = 8000    // ciclo de captura do modo web/PWA
const GEO_OPTS = { enableHighAccuracy: true, timeout: 7000, maximumAge: 3000 }
const DB_NAME  = 'rastreio_fila'
const STORE    = 'posicoes'

let intervalId        = null
let usuarioAtual      = null
let wakeLock           = null
let rodando            = false
let watchId            = null
let capturaEmAndamento = false
let nativoIniciado     = false

// Evita chamadas concorrentes de ready()/start() no SDK nativo — o SDK
// rejeita com "Waiting for previous start action to complete" se uma
// segunda chamada chegar antes da primeira terminar (ex: App.jsx re-
// renderizando e dando useEffect de novo antes do primeiro início acabar).
let iniciandoNativoPromise = null

// Preenchido pelo listener onHttp() do SDK nativo — usado só pra tela de
// diagnóstico (src/pages/DiagnosticoRastreio.jsx), não afeta o envio em si.
let ultimoHttpSucessoMs = null
let ultimoHttpErro      = null
let listenerHttpRegistrado = false

// Captura qualquer falha em ready()/start() pra aparecer na tela de
// diagnóstico — sem isso, uma falha na inicialização nativa só aparecia
// num console.warn que ninguém consegue ver num celular real em campo.
let erroInicializacaoNativa = null

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
  if (capturaEmAndamento) return

  capturaEmAndamento = true
  navigator.geolocation.getCurrentPosition(
    pos => {
      capturaEmAndamento = false
      processarPosicao(usuarioAtual, pos.coords)
    },
    err => {
      capturaEmAndamento = false
      console.warn('[rastreio] GPS:', err?.message)
    },
    GEO_OPTS,
  )
}

function iniciarWatch() {
  if (!usuarioAtual || !navigator.geolocation || watchId !== null) return

  try {
    watchId = navigator.geolocation.watchPosition(
      pos => processarPosicao(usuarioAtual, pos.coords),
      err => console.warn('[rastreio] watch GPS:', err?.message),
      GEO_OPTS,
    )
  } catch (e) {
    console.warn('[rastreio] watch indisponível:', e?.message)
    watchId = null
  }
}

function pararWatch() {
  if (watchId !== null && navigator.geolocation) {
    try { navigator.geolocation.clearWatch(watchId) } catch { /* ignore */ }
  }
  watchId = null
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
function reativarRastreio() {
  if (!rodando) return
  iniciarWatch()
  capturarAgora()
  pedirWakeLock()
  drenarFila()
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    if (!Capacitor.isNativePlatform()) reativarRastreio()
    drenarFila()
  }
}

function onOnline() {
  drenarFila()
  if (!Capacitor.isNativePlatform()) reativarRastreio()
}

// ─── Modo nativo Android: SDK da Transistor Software (segundo plano real) ───
// iniciarRastreioNativo() pode ser chamada mais de uma vez em sequência rápida
// (ex: App.jsx re-renderizando e disparando o useEffect de novo antes do
// ready()/start() anterior terminar) — o SDK rejeita chamadas concorrentes
// com "Waiting for previous start action to complete". Por isso a função
// pública guarda a promise em andamento e devolve ela pra quem chamar de
// novo, em vez de invocar ready()/start() uma segunda vez.
async function iniciarRastreioNativo(usuario) {
  if (iniciandoNativoPromise) return iniciandoNativoPromise
  iniciandoNativoPromise = executarInicioNativo(usuario)
  try {
    await iniciandoNativoPromise
  } finally {
    iniciandoNativoPromise = null
  }
}

async function executarInicioNativo(usuario) {
  const url    = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/registrar_localizacao_fiscal`
  const schema = import.meta.env.VITE_SUPABASE_SCHEMA || 'dev'
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  // Só registra o listener de diagnóstico uma vez (sobrevive a login/logout).
  if (!listenerHttpRegistrado) {
    listenerHttpRegistrado = true
    BackgroundGeolocation.onHttp(resposta => {
      if (resposta.success) {
        ultimoHttpSucessoMs = Date.now()
        ultimoHttpErro = null
      } else {
        // responseText traz a mensagem real do PostgREST (ex: nome de
        // coluna errado, tipo inválido) — sem isso só dava pra ver o
        // código HTTP, não o motivo.
        const corpo = (resposta.responseText || '').slice(0, 300)
        ultimoHttpErro = `HTTP ${resposta.status}${corpo ? ' — ' + corpo : ''}`
      }
    })
  }

  erroInicializacaoNativa = null
  let state
  try {
    // ready() aplica (e persiste nativamente) toda a config — chamado a
    // cada login pra garantir que fiscal_login/fiscal_nome em `extras`
    // estejam sempre os do usuário atual. Config aninhada por seção
    // (geolocation/app/http/persistence) — formato da v9 do SDK.
    //
    // reset: true é ESSENCIAL — sem isso, o SDK só aplica a config passada
    // aqui na primeiríssima vez que ready() roda no aparelho; depois disso
    // ele ignora tudo que mandamos e reusa pra sempre o que já tinha
    // persistido nativamente da primeira vez. Foi por causa disso que o
    // fix anterior (desligar detecção de parada) não fez efeito nenhum no
    // aparelho do Nailton: o `ready()` dele já tinha rodado antes, com a
    // config antiga, e sem reset:true continuou preso nela.
    state = await BackgroundGeolocation.ready({
      reset: true,
      geolocation: {
        // [DPL] Usa as constantes "chatas" (DESIRED_ACCURACY_HIGH), não o
        // namespace (DesiredAccuracy.High) — nessa versão do SDK só ALGUNS
        // enums ganharam o namespace novo; NotificationPriority (abaixo)
        // não tem, e dava "Cannot read properties of undefined" em
        // runtime. As constantes chatas existem pra todos, confirmado
        // direto no bundle compilado do pacote.
        desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
        distanceFilter: 0,
        locationUpdateInterval: 8000,
        fastestLocationUpdateInterval: 8000,
        // Por padrão o SDK só liga o GPS quando classifica o aparelho como
        // "em movimento" (via detecção de atividade do Android) — parado
        // (ex: celular no bolso/mesa) ele nunca manda ponto nenhum, mesmo
        // com "Serviço nativo rodando: Sim". Como o objetivo aqui é saber
        // onde o fiscal está o tempo todo (parado ou andando), desligamos
        // essa detecção de parada e forçamos rastreio contínuo.
        stopTimeout: 0,
        stopOnStationary: false,
        disableStopDetection: true,
      },
      activity: {
        // Idem: ignora a API de reconhecimento de atividade do Android
        // (acelerômetro) pra decidir se o aparelho está "em movimento" —
        // sem isso, o SDK pode nunca sair do estado "parado" se o celular
        // não vibrar o suficiente, e não captura localização nenhuma.
        disableMotionActivityUpdates: true,
      },
      app: {
        // Continua rodando mesmo se o usuário "matar" o app nos recentes, e
        // volta sozinho depois que o celular reinicia — sem precisar de um
        // BroadcastReceiver próprio como na tentativa anterior.
        stopOnTerminate: false,
        startOnBoot: true,
        notification: {
          title: 'VérticeGP',
          text: 'Rastreando localização em segundo plano.',
          priority: BackgroundGeolocation.NOTIFICATION_PRIORITY_LOW,
          channelName: 'Rastreamento em segundo plano',
        },
      },
      // Envio nativo direto pro Supabase (função RPC que grava trilha +
      // presença num único POST) — o próprio SDK persiste em SQLite
      // interno e reenvia sozinho quando falha, sem fila nossa.
      http: {
        url,
        method: 'POST',
        rootProperty: '.',
        autoSync: true,
        batchSync: false,
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          'Content-Profile': schema,
          Prefer: 'return=minimal',
        },
      },
      persistence: {
        maxDaysToPersist: 3,
        // `extras` é mesclado automaticamente em cada posição enviada.
        // Nomes com prefixo "p_" pra bater com os parâmetros da função RPC
        // registrar_localizacao_fiscal (ver sql/2026-07-15_rpc_...sql) —
        // sem o prefixo, o nome do parâmetro batia com o nome da coluna da
        // tabela e o Postgres rejeitava com "column reference is ambiguous".
        extras: {
          p_fiscal_login: usuario.login,
          p_fiscal_nome: usuario.nome,
        },
        locationTemplate: '{"p_lat":<%= latitude %>,"p_lng":<%= longitude %>,"p_precisao":<%= accuracy %>,"p_created_at":"<%= timestamp %>"}',
      },
    })
  } catch (e) {
    erroInicializacaoNativa = `ready(): ${e?.message || e?.error || JSON.stringify(e)}`
    console.warn('[rastreio] falha em ready() do SDK nativo:', e?.message)
    return
  }

  // Como stopOnTerminate:false, o serviço nativo sobrevive ao app ser
  // fechado/reaberto — ready() já devolve o estado atual (state.enabled).
  // Chamar start() de novo quando já está enabled é redundante e foi o que
  // causava "Waiting for previous start action to complete": o próprio
  // ready() com reset:true já reinicia o serviço internamente pra aplicar
  // a config nova, e um start() explícito logo em seguida colidia com essa
  // reinicialização ainda em andamento.
  if (state?.enabled) {
    nativoIniciado = true
    return
  }

  try {
    // start() já pede as permissões de localização/notificação necessárias.
    await BackgroundGeolocation.start()
    nativoIniciado = true
  } catch (e) {
    erroInicializacaoNativa = `start(): ${e?.message || e?.error || JSON.stringify(e)}`
    console.warn('[rastreio] falha em start() do SDK nativo:', e?.message)
  }
}

async function pararRastreioNativo() {
  if (!nativoIniciado) return
  try { await BackgroundGeolocation.stop() }
  catch (e) { console.warn('[rastreio] falha ao parar SDK nativo:', e?.message) }
  nativoIniciado = false
}

// ─── Diagnóstico (tela de diagnóstico do app) ───────────────────────────────
export async function obterDiagnosticoRastreio() {
  if (!Capacitor.isNativePlatform()) return null
  try {
    const [state, pendentes, statusPermissao] = await Promise.all([
      BackgroundGeolocation.getState(),
      BackgroundGeolocation.getCount(),
      BackgroundGeolocation.requestPermission().catch(e => `erro: ${e?.message || e}`),
    ])
    return {
      servicoRodando: !!state.enabled,
      trackingMode: state.trackingMode,
      odometroKm: typeof state.odometer === 'number' ? state.odometer / 1000 : null,
      voltouDeReiniciar: !!state.didDeviceReboot,
      pontosPendentes: pendentes,
      ultimoEnvioSucessoEm: ultimoHttpSucessoMs,
      ultimoErro: ultimoHttpErro,
      erroInicializacao: erroInicializacaoNativa,
      statusPermissao,
    }
  } catch (e) {
    console.warn('[rastreio] falha ao obter diagnóstico:', e?.message)
    return { erroInicializacao: erroInicializacaoNativa, erroDiagnostico: e?.message }
  }
}

export async function sincronizarRastreioAgora() {
  if (!Capacitor.isNativePlatform()) return
  try {
    await BackgroundGeolocation.sync()
  } catch (e) {
    console.warn('[rastreio] falha ao sincronizar agora:', e?.message)
  }
}

// [DPL] Descarta pontos presos na fila SQLite nativa — útil quando os
// registros presos foram capturados com uma config antiga (ex: nomes de
// campo de antes de uma correção) e ficariam tentando reenviar pra sempre
// no formato errado, mascarando se a config atual já está funcionando.
export async function limparFilaRastreio() {
  if (!Capacitor.isNativePlatform()) return
  try {
    await BackgroundGeolocation.destroyLocations()
  } catch (e) {
    console.warn('[rastreio] falha ao limpar fila:', e?.message)
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
  iniciarWatch()       // 2. recebe eventos contínuos quando o navegador permite
  pedirWakeLock()      // 3. mantém tela viva enquanto app aberto

  // 4. ciclo periódico
  intervalId = setInterval(() => {
    capturarAgora()
    drenarFila()
  }, INTERVALO_FOREGROUND_MS)

  window.addEventListener('focus', reativarRastreio)
  window.addEventListener('pageshow', reativarRastreio)
  document.addEventListener('resume', reativarRastreio)

  console.log('[rastreio] iniciado (navegador/PWA) para', usuario.login)
}

export function pararRastreio() {
  if (intervalId) { clearInterval(intervalId); intervalId = null }
  pararWatch()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('focus', reativarRastreio)
  window.removeEventListener('pageshow', reativarRastreio)
  document.removeEventListener('resume', reativarRastreio)
  window.removeEventListener('online', onOnline)
  liberarWakeLock()
  pararRastreioNativo()
  drenarFila()  // última tentativa de esvaziar antes de parar
  usuarioAtual = null
  rodando = false
  capturaEmAndamento = false
  console.log('[rastreio] parado')
}

export { drenarFila }
