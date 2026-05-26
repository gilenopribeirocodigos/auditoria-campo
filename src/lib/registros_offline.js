// ── lib/registros_offline.js ─────────────────────────────────────────────────
// Suporte offline para Registros Operacionais via IndexedDB
// Mesmo padrão de lib/offline.js (auditorias)
// ─────────────────────────────────────────────────────────────────────────────

import { salvarRegistroBD, prepararPayload } from './registros.js'

const DB_NAME  = 'auditoria-dpl'   // mesmo banco do offline.js
const DB_VER   = 2                 // incrementa versão para criar novo store
const STORE    = 'fila_registros'  // store separado das auditorias

// ── Abre o banco IndexedDB ────────────────────────────────────────────────────
function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER)

    req.onupgradeneeded = e => {
      const db = e.target.result
      // Store de auditorias (já existe na versão 1)
      if (!db.objectStoreNames.contains('fila_offline')) {
        const s = db.createObjectStore('fila_offline', { keyPath: 'id', autoIncrement: true })
        s.createIndex('sincronizado', 'sincronizado', { unique: false })
      }
      // Store de registros operacionais (novo na versão 2)
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
        s.createIndex('sincronizado', 'sincronizado', { unique: false })
      }
    }

    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = e => reject(e.target.error)
  })
}

// ── Salva registro offline ────────────────────────────────────────────────────
// form contém: tipo, modalidade, fiscal, fotos (base64), participantes (com assinatura base64), etc.
export async function salvarRegistroOffline(form) {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const item  = {
      form:         form,               // todo o form com base64
      sincronizado: 0,
      criadoEm:     new Date().toISOString(),
    }
    const req     = store.add(item)
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

// ── Busca registros pendentes de sincronização ────────────────────────────────
export async function buscarPendentesRegistros() {
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
export async function contarPendentesRegistros() {
  const pendentes = await buscarPendentesRegistros()
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

// ── Sincroniza todos os pendentes ao reconectar ───────────────────────────────
export async function sincronizarPendentesRegistros(onProgresso) {
  const pendentes = await buscarPendentesRegistros()
  if (pendentes.length === 0) return 0

  let sincronizados = 0

  for (const item of pendentes) {
    try {
      // prepararPayload faz upload das fotos e assinaturas para o Supabase Storage
      const payload = await prepararPayload(item.form)
      await salvarRegistroBD(payload)
      await marcarSincronizado(item.id)
      sincronizados++
      if (onProgresso) onProgresso(sincronizados, pendentes.length)
    } catch (e) {
      console.error('Erro ao sincronizar registro offline:', e)
    }
  }

  return sincronizados
}
