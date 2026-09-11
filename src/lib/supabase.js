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

// O PostgREST do Supabase limita cada resposta a um número máximo de linhas
// por padrão (hoje 1000) — sem paginar explicitamente, uma tabela com mais
// linhas que isso trunca DE FORMA SILENCIOSA (sem erro nenhum). Usar sempre
// que uma tela precisa buscar uma tabela INTEIRA (não uma busca com limite
// intencional, tipo autocomplete). `montarQuery(ini, fim)` recebe os limites
// de `.range()` e deve devolver a query já pronta (com `.select()`, filtros
// etc, só sem `.range()`).
const TAMANHO_PAGINA_PADRAO = 1000
export async function buscarTodasLinhas(montarQuery, tamanhoPagina = TAMANHO_PAGINA_PADRAO) {
  const todas = []
  let offset = 0
  while (true) {
    const { data, error } = await montarQuery(offset, offset + tamanhoPagina - 1)
    if (error) throw error
    todas.push(...(data || []))
    if (!data || data.length < tamanhoPagina) break
    offset += tamanhoPagina
  }
  return todas
}

// Conta pendências de tratamento pro badge do botão "Tratamento de Não
// Conformidades" na Home — soma auditorias_nao_conformes pendentes +
// ocorrências pendentes (mesmo total que a tela mostra somando as duas
// abas). Usa count:'exact', head:true pra não trazer as linhas, só o total.
export async function contarPendenciasTratamentoNC() {
  if (!supabase) return 0
  const [nc, oc] = await Promise.all([
    supabase.from('auditorias_nao_conformes').select('*', { count: 'exact', head: true }).eq('status_tratamento', 'PENDENTE'),
    supabase.from('ocorrencias').select('*', { count: 'exact', head: true }).eq('status', 'PENDENTE'),
  ])
  return (nc.count || 0) + (oc.count || 0)
}

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

// Detecta "duplicate key" no numero_as — acontece quando o INSERT já teve
// sucesso no servidor numa tentativa anterior mas a resposta não chegou ao
// cliente (rede instável em campo), e o app tenta salvar de novo com o
// mesmo numero_as. Não é um erro de fato: a auditoria já existe.
export function isDuplicidadeNumeroAS(err) {
  return err?.code === '23505' && /numero_as/i.test(err?.message || err?.details || '')
}

// Recupera a auditoria já salva por numero_as, usado junto com
// isDuplicidadeNumeroAS() para retomar o fluxo de sucesso em vez de
// falhar de novo num retry que nunca vai conseguir inserir.
export async function buscarAuditoriaPorNumeroAS(numeroAS) {
  if (!supabase) throw new Error('Supabase não configurado — verifique as variáveis de ambiente.')
  const { data, error } = await supabase
    .from('auditorias')
    .select()
    .eq('numero_as', numeroAS)
    .maybeSingle()
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
