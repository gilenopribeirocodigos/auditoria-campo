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
// Conformidades" na Home — soma AS (auditorias) com NC pendente + ocorrências
// pendentes (mesmo total que a tela mostra somando as duas abas).
//
// IMPORTANTE: não conta linha de auditorias_nao_conformes (cada NC é um
// item), conta AS distintas (auditoria_id, ou numero_as pra NCs antigas sem
// esse vínculo) — uma AS pode ter 2+ NCs, mas o fiscal trata todas de uma vez
// só (ver GrupoNC/handleTratar em TratamentoNaoConformidades.jsx), então o
// que conta como "1 pendência" pro fiscal é a AS, não a NC individual. Contar
// por item inflava o badge (ex.: 64 quando só havia 38 AS realmente
// pendentes). Mesmo critério do resumo "por fiscal" da tela de tratamento.
//
// `podeVerTodas` vem de temPermissao(usuarioLogado, 'ver_todas_pendencias_nc')
// no chamador (App.jsx) — não importa lib/auth.js aqui pra evitar import
// circular (auth.js já importa supabase.js). Mesma regra de
// TratamentoNaoConformidades.jsx: ADMIN sempre tem essa permissão
// automaticamente (ver temPermissao); os demais só contam o que é deles
// (por matrícula), pra o badge bater com o que a pessoa realmente vai ver
// ao entrar na tela.
export async function contarPendenciasTratamentoNC(usuarioLogado, podeVerTodas) {
  if (!supabase) return 0

  const ncRows = await buscarTodasLinhas((from, to) => {
    let q = supabase.from('auditorias_nao_conformes').select('auditoria_id, numero_as').eq('status_tratamento', 'PENDENTE').range(from, to)
    if (!podeVerTodas) q = q.eq('matricula', usuarioLogado?.matricula)
    return q
  })
  const gruposPendentes = new Set(ncRows.map(n => n.auditoria_id || n.numero_as)).size

  let ocQ = supabase.from('ocorrencias').select('*', { count: 'exact', head: true }).eq('status', 'PENDENTE')
  if (!podeVerTodas) ocQ = ocQ.eq('matricula_fiscal_destino', usuarioLogado?.matricula)
  const { count } = await ocQ

  return gruposPendentes + (count || 0)
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
