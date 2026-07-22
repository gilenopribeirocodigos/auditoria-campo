// CRUD do módulo Prestação de Contas — isolado dos demais módulos.
// Reaproveita só o client genérico (supabase) e o upload genérico de fotos
// (uploadBase64) de src/lib/supabase.js, sem tocar nesse arquivo.
import { supabase, uploadBase64 } from '../../../lib/supabase.js'
import { gerarNumeroPC } from './numeroPC.js'

const BUCKET_FOTOS = 'comprovantes-prestacao'

function assertSupabase() {
  if (!supabase) throw new Error('Supabase não configurado — verifique as variáveis de ambiente.')
}

// ── Padrões (Classificação / Tipo de Comprovante) ───────────────────────────
// Cadastro editável (tela "⚙️ Padrões") em vez de lista fixa no código —
// permite adicionar/remover sem precisar de deploy novo.
export async function listarClassificacoes() {
  assertSupabase()
  const { data, error } = await supabase
    .from('pc_classificacoes').select('id, nome').eq('ativo', true).order('nome')
  if (error) throw error
  return data || []
}

export async function criarClassificacao(nome) {
  assertSupabase()
  const { data, error } = await supabase
    .from('pc_classificacoes').insert({ nome: nome.trim().toUpperCase() }).select().single()
  if (error) throw error
  return data
}

export async function removerClassificacao(id) {
  assertSupabase()
  const { error } = await supabase.from('pc_classificacoes').delete().eq('id', id)
  if (error) throw error
}

export async function listarTiposComprovanteCadastrados() {
  assertSupabase()
  const { data, error } = await supabase
    .from('pc_tipos_comprovante').select('id, nome').eq('ativo', true).order('nome')
  if (error) throw error
  return data || []
}

export async function criarTipoComprovante(nome) {
  assertSupabase()
  const { data, error } = await supabase
    .from('pc_tipos_comprovante').insert({ nome: nome.trim() }).select().single()
  if (error) throw error
  return data
}

export async function removerTipoComprovante(id) {
  assertSupabase()
  const { error } = await supabase.from('pc_tipos_comprovante').delete().eq('id', id)
  if (error) throw error
}

// ── Destinatários disponíveis (usuários habilitados a receber) ─────────────
export async function listarDestinatariosDisponiveis() {
  assertSupabase()
  const { data: perms, error: errPerms } = await supabase
    .from('perfis_permissoes')
    .select('perfil')
    .eq('permissao', 'prestacao_contas_receber')
  if (errPerms) throw errPerms
  const perfisHabilitados = new Set((perms || []).map(p => p.perfil))

  const { data: usuarios, error: errUsers } = await supabase
    .from('usuarios')
    .select('id, nome, perfil')
    .eq('status', 'ATIVO')
    .order('nome')
  if (errUsers) throw errUsers

  return (usuarios || []).filter(u => u.perfil === 'ADMIN' || perfisHabilitados.has(u.perfil))
}

// ── Minhas prestações (enviadas por mim) ────────────────────────────────────
export async function listarMinhasPrestacoes(remetenteId) {
  assertSupabase()
  const { data, error } = await supabase
    .from('pc_prestacoes')
    .select('*, pc_itens(valor)')
    .eq('remetente_id', remetenteId)
    .order('criado_em', { ascending: false })
  if (error) throw error
  return (data || []).map(p => ({
    ...p,
    total_itens: p.pc_itens?.length || 0,
    valor_total: (p.pc_itens || []).reduce((soma, i) => soma + Number(i.valor || 0), 0),
  }))
}

// ── Uma prestação com itens e fotos ──────────────────────────────────────────
export async function obterPrestacao(prestacaoId) {
  assertSupabase()
  const { data, error } = await supabase
    .from('pc_prestacoes')
    .select('*, pc_itens(*, pc_fotos(*))')
    .eq('id', prestacaoId)
    .single()
  if (error) throw error
  data.pc_itens = (data.pc_itens || []).sort((a, b) => a.ordem - b.ordem)
  return data
}

// ── Rascunho ─────────────────────────────────────────────────────────────────
export async function criarRascunho(remetenteId) {
  assertSupabase()
  const { data, error } = await supabase
    .from('pc_prestacoes')
    .insert({ numero_pc: gerarNumeroPC(), remetente_id: remetenteId, destinatario_id: remetenteId, status: 'RASCUNHO' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function definirDestinatario(prestacaoId, destinatarioId) {
  assertSupabase()
  const { error } = await supabase
    .from('pc_prestacoes')
    .update({ destinatario_id: destinatarioId, atualizado_em: new Date().toISOString() })
    .eq('id', prestacaoId)
  if (error) throw error
}

export async function excluirRascunho(prestacaoId) {
  assertSupabase()
  const { error } = await supabase.from('pc_prestacoes').delete().eq('id', prestacaoId).eq('status', 'RASCUNHO')
  if (error) throw error
}

// ── Itens ────────────────────────────────────────────────────────────────────
export async function adicionarItem(prestacaoId, item, ordem) {
  assertSupabase()
  const { data, error } = await supabase
    .from('pc_itens')
    .insert({
      prestacao_id: prestacaoId,
      ordem,
      classificacao: item.classificacao,
      descricao: item.descricao,
      fornecedor: item.fornecedor || null,
      forma_pagamento: item.forma_pagamento || null,
      tipo_comprovante: item.tipo_comprovante || null,
      data_emissao: item.data_emissao || null,
      valor: item.valor || 0,
      valor_pago: item.valor_pago ?? item.valor ?? 0,
      observacao: item.observacao || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function atualizarItem(itemId, item) {
  assertSupabase()
  const { error } = await supabase
    .from('pc_itens')
    .update({
      classificacao: item.classificacao,
      descricao: item.descricao,
      fornecedor: item.fornecedor || null,
      forma_pagamento: item.forma_pagamento || null,
      tipo_comprovante: item.tipo_comprovante || null,
      data_emissao: item.data_emissao || null,
      valor: item.valor || 0,
      valor_pago: item.valor_pago ?? item.valor ?? 0,
      observacao: item.observacao || null,
    })
    .eq('id', itemId)
  if (error) throw error
}

export async function removerItem(itemId) {
  assertSupabase()
  const { error } = await supabase.from('pc_itens').delete().eq('id', itemId)
  if (error) throw error
}

// ── Fotos ────────────────────────────────────────────────────────────────────
export async function anexarFoto(itemId, prestacaoId, base64) {
  assertSupabase()
  const caminho = `${prestacaoId}/${itemId}/${Date.now()}.jpg`
  const url = await uploadBase64(base64, caminho, BUCKET_FOTOS)
  const { data, error } = await supabase
    .from('pc_fotos')
    .insert({ item_id: itemId, foto_url: url })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function removerFoto(fotoId) {
  assertSupabase()
  const { error } = await supabase.from('pc_fotos').delete().eq('id', fotoId)
  if (error) throw error
}

export async function obterNomeUsuario(usuarioId) {
  assertSupabase()
  const { data, error } = await supabase.from('usuarios').select('nome').eq('id', usuarioId).single()
  if (error) throw error
  return data?.nome
}

// ── Recebidas (destinatário analisa) ────────────────────────────────────────
export async function listarRecebidas(destinatarioId) {
  assertSupabase()
  const { data, error } = await supabase
    .from('pc_prestacoes')
    .select('*, pc_itens(valor)')
    .eq('destinatario_id', destinatarioId)
    .neq('status', 'RASCUNHO')
    .order('criado_em', { ascending: false })
  if (error) throw error
  return (data || []).map(p => ({
    ...p,
    total_itens: p.pc_itens?.length || 0,
    valor_total: (p.pc_itens || []).reduce((soma, i) => soma + Number(i.valor || 0), 0),
  }))
}

// ── Histórico (linha do tempo imutável de envio/aprovação/rejeição) ─────────
// pc_prestacoes.motivo_rejeicao/analisado_em/analisado_por guardam só o
// estado ATUAL (útil pras listagens); pc_historico guarda TODAS as rodadas,
// pra não perder o motivo de rejeições anteriores quando o usuário corrige
// e reenvia mais de uma vez.
async function registrarHistorico(prestacaoId, tipo, usuarioId, motivo, rodada) {
  const { error } = await supabase
    .from('pc_historico')
    .insert({ prestacao_id: prestacaoId, tipo, usuario_id: usuarioId, motivo: motivo || null, rodada })
  if (error) throw error
}

export async function listarHistorico(prestacaoId) {
  assertSupabase()
  const { data, error } = await supabase
    .from('pc_historico')
    .select('*')
    .eq('prestacao_id', prestacaoId)
    .order('criado_em', { ascending: true })
  if (error) throw error
  return data || []
}

export async function aprovarPrestacao(prestacaoId, aprovadorId) {
  assertSupabase()
  const { data: atual, error: errAtual } = await supabase
    .from('pc_prestacoes').select('rodada').eq('id', prestacaoId).single()
  if (errAtual) throw errAtual
  const { error } = await supabase
    .from('pc_prestacoes')
    .update({
      status: 'APROVADO',
      analisado_em: new Date().toISOString(),
      analisado_por: aprovadorId,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', prestacaoId)
  if (error) throw error
  await registrarHistorico(prestacaoId, 'APROVACAO', aprovadorId, null, atual?.rodada || 1)
}

export async function rejeitarPrestacao(prestacaoId, aprovadorId, motivo) {
  assertSupabase()
  const { data: atual, error: errAtual } = await supabase
    .from('pc_prestacoes').select('rodada').eq('id', prestacaoId).single()
  if (errAtual) throw errAtual
  const { error } = await supabase
    .from('pc_prestacoes')
    .update({
      status: 'REJEITADO',
      motivo_rejeicao: motivo,
      analisado_em: new Date().toISOString(),
      analisado_por: aprovadorId,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', prestacaoId)
  if (error) throw error
  await registrarHistorico(prestacaoId, 'REJEICAO', aprovadorId, motivo, atual?.rodada || 1)
}

// ── Envio ────────────────────────────────────────────────────────────────────
export async function enviarPrestacao(prestacaoId, remetenteId, { reenvio = false, motivo = '' } = {}) {
  assertSupabase()
  const payload = {
    status: 'ENVIADO',
    enviado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  }
  let rodadaAtual = 1
  if (reenvio) {
    const { data: atual, error: errAtual } = await supabase
      .from('pc_prestacoes').select('rodada').eq('id', prestacaoId).single()
    if (errAtual) throw errAtual
    rodadaAtual = (atual?.rodada || 1) + 1
    payload.rodada = rodadaAtual
  }
  const { error } = await supabase.from('pc_prestacoes').update(payload).eq('id', prestacaoId)
  if (error) throw error
  await registrarHistorico(prestacaoId, 'ENVIO', remetenteId, motivo || null, rodadaAtual)
}
