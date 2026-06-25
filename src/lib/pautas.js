import { supabase } from './supabase.js'

export async function listarPautas(filtros = {}) {
  let q = supabase.from('pautas').select('*').order('data_prevista')
  if (filtros.status)       q = q.eq('status', filtros.status)
  if (filtros.fiscal_login) q = q.eq('fiscal_login', filtros.fiscal_login)
  if (filtros.data)         q = q.eq('data_prevista', filtros.data)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function pautasHojeFiscal(fiscal_login) {
  const hoje = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('pautas')
    .select('*')
    .eq('fiscal_login', fiscal_login)
    .eq('status', 'PENDENTE')
    .lte('data_prevista', hoje)
    .order('data_prevista')
  if (error) throw error
  return data || []
}

export async function criarPauta(payload) {
  const { id, ...dados } = payload  // remove id null se vier no payload
  const { data, error } = await supabase
    .from('pautas').insert(dados).select().single()
  if (error) throw error
  return data
}

export async function atualizarPauta(id, payload) {
  const { id: _, ...dados } = payload  // remove id do payload antes de atualizar
  const { data, error } = await supabase
    .from('pautas').update(dados).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deletarPauta(id) {
  const { error } = await supabase.from('pautas').delete().eq('id', id)
  if (error) throw error
}

export async function concluirPauta(id, auditoria_id, dadosConclusao = {}) {
  const update = { status: 'CONCLUIDA', auditoria_id }
  if (Object.prototype.hasOwnProperty.call(dadosConclusao, 'motivo_auditoria')) {
    update.motivo_auditoria = dadosConclusao.motivo_auditoria || null
  }
  if (Object.prototype.hasOwnProperty.call(dadosConclusao, 'avaliacao_motivo_auditoria')) {
    update.avaliacao_motivo_auditoria = dadosConclusao.avaliacao_motivo_auditoria || null
  }

  const { error } = await supabase
    .from('pautas')
    .update(update)
    .eq('id', id)
  if (error) throw error
}

export async function criarProximaRecorrencia(pauta) {
  if (pauta.recorrencia === 'UNICA') return
  const dataAtual = new Date(pauta.data_prevista)
  const proxData  = new Date(dataAtual)
  if (pauta.recorrencia === 'DIARIA')  proxData.setDate(dataAtual.getDate() + 1)
  if (pauta.recorrencia === 'SEMANAL') proxData.setDate(dataAtual.getDate() + 7)
  await criarPauta({
    prefixo:                pauta.prefixo,
    fiscal_login:           pauta.fiscal_login,
    data_prevista:          proxData.toISOString().split('T')[0],
    tipo_servico:           pauta.tipo_servico,
    tipo_auditoria:         pauta.tipo_auditoria,
    recorrencia:            pauta.recorrencia,
    observacao:             pauta.observacao,
    motivo_auditoria:       pauta.motivo_auditoria,
    avaliacao_motivo_auditoria: null,
    matricula_eletricista1: pauta.matricula_eletricista1,
    matricula_eletricista2: pauta.matricula_eletricista2,
    nome_eletricista:       pauta.nome_eletricista,
    nome_eletricista2:      pauta.nome_eletricista2,
    status:                 'PENDENTE',
  })
}
