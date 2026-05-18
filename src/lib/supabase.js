import { createClient } from '@supabase/supabase-js'

const url    = import.meta.env.VITE_SUPABASE_URL
const key    = import.meta.env.VITE_SUPABASE_ANON_KEY

// ✅ DEV — schema isolado para desenvolvimento
//const schema = import.meta.env.VITE_SUPABASE_SCHEMA || 'dev'
// 🚫 PRODUÇÃO — descomente e comente a linha acima quando for para produção
const schema = import.meta.env.VITE_SUPABASE_SCHEMA || 'public'

export const supabase = (url && key)
  ? createClient(url, key, { db: { schema } })
  : null

// Upload de imagem base64 para o Storage
export async function uploadBase64(base64, path, bucket = 'fotos-auditoria') {
  if (!supabase) throw new Error('Supabase não configurado — verifique as variáveis de ambiente.')
  const res  = await fetch(base64)
  const blob = await res.blob()
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { contentType: blob.type, upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

// Salva nova auditoria
export async function salvarAuditoriaBD(payload) {
  if (!supabase) throw new Error('Supabase não configurado — verifique as variáveis de ambiente.')
  const { data, error } = await supabase
    .from('auditorias')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

// Atualiza auditoria existente (após reaberta)
export async function atualizarAuditoriaBD(id, payload) {
  if (!supabase) throw new Error('Supabase não configurado — verifique as variáveis de ambiente.')
  const { data, error } = await supabase
    .from('auditorias')
    .update({ ...payload, reaberta: false, reaberta_para: null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Reabrir auditoria (apenas ADMIN)
export async function reabrirAuditoria(id, fiscal_login, admin_nome) {
  if (!supabase) throw new Error('Supabase não configurado — verifique as variáveis de ambiente.')
  const { error } = await supabase
    .from('auditorias')
    .update({
      reaberta:      true,
      reaberta_para: fiscal_login,
      reaberta_por:  admin_nome,
      reaberta_em:   new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

// Busca auditorias reabertas para um fiscal
export async function buscarAuditoriasReabertas(fiscal_login) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('auditorias')
    .select('*')
    .eq('reaberta', true)
    .eq('reaberta_para', fiscal_login)
  if (error) return []
  return data || []
}
