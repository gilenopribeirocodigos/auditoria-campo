import { supabase } from './supabase.js'
import { normalizarNumeroAS, obterNumeroAS, numeroASDaPauta } from './numeroAS.js'

function separarDataHoraFortaleza(valor = new Date().toISOString()) {
  const data = new Date(valor)
  if (!Number.isNaN(data.getTime())) {
    const partes = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Fortaleza',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(data)
    const valorParte = tipo => partes.find(p => p.type === tipo)?.value || ''
    return {
      data: `${valorParte('year')}-${valorParte('month')}-${valorParte('day')}`,
      hora: `${valorParte('hour')}:${valorParte('minute')}:${valorParte('second')}`,
    }
  }
  return { data: '', hora: '' }
}

function prioridadePauta(p) {
  const numero = Number(p?.prioridade_execucao)
  return Number.isFinite(numero) && numero > 0 ? numero : null
}

function ordenarPautasExecucao(a, b) {
  const pa = prioridadePauta(a)
  const pb = prioridadePauta(b)
  if (pa !== null || pb !== null) return (pa ?? 999999) - (pb ?? 999999)
  return String(a.data_prevista || '').localeCompare(String(b.data_prevista || '')) ||
    String(a.prefixo || '').localeCompare(String(b.prefixo || ''))
}

export async function listarPautas(filtros = {}) {
  let q = supabase.from('pautas').select('*').order('data_prevista')
  if (filtros.status)       q = q.eq('status', filtros.status)
  if (filtros.fiscal_login) q = q.eq('fiscal_login', filtros.fiscal_login)
  if (filtros.data)         q = q.eq('data_prevista', filtros.data)
  const { data, error } = await q
  if (error) throw error
  return (data || []).map(p => ({ ...p, numero_as: numeroASDaPauta(p) }))
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
  return (data || [])
    .map(p => ({ ...p, numero_as: numeroASDaPauta(p) }))
    .sort(ordenarPautasExecucao)
}

export async function pautasFuturasFiscal(fiscal_login) {
  const hoje = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('pautas')
    .select('*')
    .eq('fiscal_login', fiscal_login)
    .eq('status', 'PENDENTE')
    .gt('data_prevista', hoje)
    .order('data_prevista')
  if (error) throw error
  return (data || [])
    .map(p => ({ ...p, numero_as: numeroASDaPauta(p) }))
    .sort((a, b) => String(a.data_prevista).localeCompare(String(b.data_prevista)) || String(a.prefixo || '').localeCompare(String(b.prefixo || '')))
}

export async function criarPauta(payload) {
  const { id, ...dados } = payload  // remove id null se vier no payload
  const payloadFinal = { ...dados, numero_as: obterNumeroAS(dados.numero_as) }
  const { data, error } = await supabase
    .from('pautas').insert(payloadFinal).select().single()
  if (error) throw error
  return data
}

export async function atualizarPauta(id, payload) {
  const { id: _, ...dados } = payload  // remove id do payload antes de atualizar
  const payloadFinal = {
    ...dados,
    numero_as: obterNumeroAS(dados.numero_as),
  }
  const { data, error } = await supabase
    .from('pautas').update(payloadFinal).eq('id', id).select().single()
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
  if (Object.prototype.hasOwnProperty.call(dadosConclusao, 'qtde_cabos_os')) {
    update.qtde_cabos_os = dadosConclusao.qtde_cabos_os ?? null
  }
  if (Object.prototype.hasOwnProperty.call(dadosConclusao, 'qtde_cabos_em_campo')) {
    update.qtde_cabos_em_campo = dadosConclusao.qtde_cabos_em_campo ?? null
  }
  if (Object.prototype.hasOwnProperty.call(dadosConclusao, 'data_execucao')) {
    update.data_execucao = dadosConclusao.data_execucao || null
  }
  if (Object.prototype.hasOwnProperty.call(dadosConclusao, 'hora_execucao')) {
    update.hora_execucao = dadosConclusao.hora_execucao || null
  }
  if (Object.prototype.hasOwnProperty.call(dadosConclusao, 'numero_as')) {
    update.numero_as = normalizarNumeroAS(dadosConclusao.numero_as) || null
  }
  if (Object.prototype.hasOwnProperty.call(dadosConclusao, 'nc_status')) {
    update.nc_status = dadosConclusao.nc_status ?? null
  }

  const { error } = await supabase
    .from('pautas')
    .update(update)
    .eq('id', id)
  if (error) throw error
}

// Uma pauta recorrente (Diária/Semanal) pode ter uma condição de parada
// definida na pauta ORIGINAL da cadeia (recorrencia_max_execucoes e/ou
// recorrencia_fim_data) e/ou ter sido interrompida manualmente
// (recorrencia_ativa=false, via "Parar Recorrência"). Essas condições vivem
// só na raiz da cadeia (recorrencia_origem_id NULL) — toda pauta gerada
// automaticamente aponta pra essa raiz, nunca pra pauta anterior, pra achar a
// condição de parada em 1 SELECT só, independente de quantas execuções já
// passaram.
export async function criarProximaRecorrencia(pauta) {
  if (pauta.recorrencia === 'UNICA') return

  const origemId = pauta.recorrencia_origem_id || pauta.id
  const { data: origem, error: errOrigem } = await supabase
    .from('pautas')
    .select('recorrencia_ativa, recorrencia_max_execucoes, recorrencia_fim_data, recorrencia_execucoes_geradas')
    .eq('id', origemId)
    .single()
  if (errOrigem) throw errOrigem
  if (!origem || origem.recorrencia_ativa === false) return

  const executadas = origem.recorrencia_execucoes_geradas || 1
  if (origem.recorrencia_max_execucoes && executadas >= origem.recorrencia_max_execucoes) return

  const dataAtual = new Date(pauta.data_prevista)
  const proxData  = new Date(dataAtual)
  if (pauta.recorrencia === 'DIARIA')  proxData.setDate(dataAtual.getDate() + 1)
  if (pauta.recorrencia === 'SEMANAL') proxData.setDate(dataAtual.getDate() + 7)

  if (origem.recorrencia_fim_data && proxData > new Date(origem.recorrencia_fim_data)) return

  const createdAt = new Date().toISOString()
  const geracao = separarDataHoraFortaleza(createdAt)
  await criarPauta({
    prefixo:                pauta.prefixo,
    fiscal_login:           pauta.fiscal_login,
    data_prevista:          proxData.toISOString().split('T')[0],
    tipo_servico:           pauta.tipo_servico,
    tipo_auditoria:         pauta.tipo_auditoria,
    recorrencia:            pauta.recorrencia,
    recorrencia_origem_id:  origemId,
    observacao:             pauta.observacao,
    motivo_auditoria:       pauta.motivo_auditoria,
    qtde_cabos_os:          pauta.qtde_cabos_os ?? null,
    latitude:               pauta.latitude ?? null,
    longitude:              pauta.longitude ?? null,
    cidade:                 pauta.cidade || null,
    bairro:                 pauta.bairro || null,
    endereco_referencia:    pauta.endereco_referencia || null,
    data_os:                pauta.data_os || null,
    prioridade_execucao:    pauta.prioridade_execucao ?? null,
    qtde_cabos_em_campo:    null,
    avaliacao_motivo_auditoria: null,
    matricula_eletricista1: pauta.matricula_eletricista1,
    matricula_eletricista2: pauta.matricula_eletricista2,
    nome_eletricista:       pauta.nome_eletricista,
    nome_eletricista2:      pauta.nome_eletricista2,
    status:                 'PENDENTE',
    usuario_criacao:        pauta.usuario_criacao || null,
    data_geracao:           geracao.data,
    hora_geracao:           geracao.hora,
    created_at:             createdAt,
  })

  await supabase.from('pautas')
    .update({ recorrencia_execucoes_geradas: executadas + 1 })
    .eq('id', origemId)
}

// Kill-switch manual da recorrência ("🛑 Parar Recorrência") — só impede
// futuras gerações a partir de agora; não apaga nem cancela pautas já
// criadas (pendentes ou concluídas). Funciona a partir de qualquer pauta da
// cadeia (a raiz ou uma já gerada), sempre resolvendo pra raiz.
export async function pararRecorrenciaPauta(pauta) {
  const origemId = pauta.recorrencia_origem_id || pauta.id
  const { error } = await supabase.from('pautas').update({ recorrencia_ativa: false }).eq('id', origemId)
  if (error) throw error
}

// Complementar ao pararRecorrenciaPauta: cancela (status CANCELADA) as
// pautas PENDENTES já geradas por essa cadeia — usado quando o usuário quer
// interromper tudo de uma vez, não só as futuras gerações.
export async function cancelarPendentesDaRecorrencia(pauta) {
  const origemId = pauta.recorrencia_origem_id || pauta.id
  const { error } = await supabase
    .from('pautas')
    .update({ status: 'CANCELADA' })
    .or(`id.eq.${origemId},recorrencia_origem_id.eq.${origemId}`)
    .eq('status', 'PENDENTE')
  if (error) throw error
}
