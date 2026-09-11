// ── lib/ocorrencias_offline.js ───────────────────────────────────────────────
// Suporte offline para o módulo Ocorrências via IndexedDB.
// Mesmo padrão de lib/registros_offline.js — store próprio, mesmo banco.
// ─────────────────────────────────────────────────────────────────────────────

import { salvarOcorrenciaBD, prepararPayloadOcorrencia } from './ocorrencias.js'

const DB_NAME  = 'auditoria-dpl'     // mesmo banco dos outros módulos
const DB_VER   = 3                   // incrementa versão para criar novo store
const STORE    = 'fila_ocorrencias'  // store separado de auditorias/registros

// ── Abre o banco IndexedDB ────────────────────────────────────────────────────
function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER)

    req.onupgradeneeded = e => {
      const db = e.target.result
      // Stores das versões anteriores (auditorias e registros operacionais)
      if (!db.objectStoreNames.contains('fila_offline')) {
        const s = db.createObjectStore('fila_offline', { keyPath: 'id', autoIncrement: true })
        s.createIndex('sincronizado', 'sincronizado', { unique: false })
      }
      if (!db.objectStoreNames.contains('fila_registros')) {
        const s = db.createObjectStore('fila_registros', { keyPath: 'id', autoIncrement: true })
        s.createIndex('sincronizado', 'sincronizado', { unique: false })
      }
      // Store de ocorrências (novo na versão 3)
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
        s.createIndex('sincronizado', 'sincronizado', { unique: false })
      }
    }

    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = e => reject(e.target.error)
  })
}

// ── Salva ocorrência offline ──────────────────────────────────────────────────
export async function salvarOcorrenciaOffline(form) {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const item  = {
      form:         form,               // todo o form (com foto base64, se houver)
      sincronizado: 0,
      criadoEm:     new Date().toISOString(),
    }
    const req     = store.add(item)
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

// ── Busca ocorrências pendentes de sincronização ──────────────────────────────
export async function buscarPendentesOcorrencias() {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const index = store.index('sincronizado')
    const req   = index.getAll(0)
    req.onsuccess = () => resolve(req.result || [])
    req.onerror   = () => reject(req.error)
  })
}

// ── Conta pendentes ───────────────────────────────────────────────────────────
export async function contarPendentesOcorrencias() {
  const pendentes = await buscarPendentesOcorrencias()
  return pendentes.length
}

// ── Marca como sincronizado ───────────────────────────────────────────────────
async function marcarSincronizado(id) {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const req   = store.get(id)
    req.onsuccess = () => {
      const item = req.result
      if (item) { item.sincronizado = 1; store.put(item) }
      resolve()
    }
    req.onerror = () => reject(req.error)
  })
}

// ── Sincroniza todas as pendentes ao reconectar ───────────────────────────────
export async function sincronizarPendentesOcorrencias(onProgresso) {
  const pendentes = await buscarPendentesOcorrencias()
  if (pendentes.length === 0) return 0

  let sincronizadas = 0

  for (const item of pendentes) {
    try {
      const payload = await prepararPayloadOcorrencia(item.form)
      await salvarOcorrenciaBD(payload)
      await marcarSincronizado(item.id)
      sincronizadas++
      if (onProgresso) onProgresso(sincronizadas, pendentes.length)
    } catch (e) {
      console.error('Erro ao sincronizar ocorrência offline:', e)
    }
  }

  return sincronizadas
}
