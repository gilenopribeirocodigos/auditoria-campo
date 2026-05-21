import { uploadBase64, salvarAuditoriaBD } from './supabase.js'

const DB_NAME    = 'auditoria-dpl'
const DB_VERSION = 2              // ← CORRIGIDO: era 1 (conflitava com registros_offline.js)
const STORE      = 'fila_offline'

function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = e.target.result
      // Store de auditorias (existia na versão 1)
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
        store.createIndex('sincronizado', 'sincronizado', { unique: false })
      }
      // Store de registros operacionais — ADICIONADO na versão 2
      // Necessário para evitar conflito com registros_offline.js
      if (!db.objectStoreNames.contains('fila_registros')) {
        const s = db.createObjectStore('fila_registros', { keyPath: 'id', autoIncrement: true })
        s.createIndex('sincronizado', 'sincronizado', { unique: false })
      }
    }
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = e => reject(e.target.error)
  })
}

export async function salvarAuditoriaOffline(payload, fotosBase64, assinaturaBase64, assinatura2Base64) {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const item  = {
      payload,
      fotosBase64:       fotosBase64       || [],
      assinaturaBase64:  assinaturaBase64  || null,
      assinatura2Base64: assinatura2Base64 || null,
      sincronizado: 0,  // FIX: era false, IndexedDB não aceita boolean como chave
      criadoEm: new Date().toISOString(),
    }
    const req = store.add(item)
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

export async function buscarPendentes() {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const index = store.index('sincronizado')
    const req   = index.getAll(0)  // FIX: era false
    req.onsuccess = () => resolve(req.result || [])
    req.onerror   = () => reject(req.error)
  })
}

export async function contarPendentes() {
  const pendentes = await buscarPendentes()
  return pendentes.length
}

async function marcarSincronizado(id) {
  const db = await abrirDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const req   = store.get(id)
    req.onsuccess = () => {
      const item = req.result
      if (item) {
        item.sincronizado = 1  // FIX: era true
        store.put(item)
      }
      resolve()
    }
    req.onerror = () => reject(req.error)
  })
}

export async function sincronizarPendentes(onProgresso) {
  const pendentes = await buscarPendentes()
  if (pendentes.length === 0) return 0
  let sincronizados = 0
  for (const item of pendentes) {
    try {
      const auditId = `${Date.now()}_OS${item.payload.os}_${item.payload.prefixo}`.replace(/\s+/g, '_')
      const fotosUrls = []
      for (let i = 0; i < item.fotosBase64.length; i++) {
        const url = await uploadBase64(item.fotosBase64[i], `${auditId}/foto_${Date.now()}_${i + 1}.jpg`)
        fotosUrls.push(url)
      }
      let assinaturaUrl  = null
      let assinatura2Url = null
      if (item.assinaturaBase64) {
        assinaturaUrl = await uploadBase64(item.assinaturaBase64, `${auditId}/assinatura_1.png`)
      }
      if (item.assinatura2Base64) {
        assinatura2Url = await uploadBase64(item.assinatura2Base64, `${auditId}/assinatura_2.png`)
      }
      const payload = {
        ...item.payload,
        fotos_urls: fotosUrls,
        ...(assinaturaUrl  && { assinatura_url:  assinaturaUrl  }),
        ...(assinatura2Url && { assinatura2_url: assinatura2Url }),
      }
      await salvarAuditoriaBD(payload)
      await marcarSincronizado(item.id)
      sincronizados++
      if (onProgresso) onProgresso(sincronizados, pendentes.length)
    } catch (e) {
      console.error('Erro ao sincronizar auditoria offline:', e)
    }
  }
  return sincronizados
}
