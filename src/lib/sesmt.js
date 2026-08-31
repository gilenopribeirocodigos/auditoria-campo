import { supabase, uploadBase64 } from './supabase.js'

// ── Módulo AÇÕES SESMT — independente de Auditoria/Registros/Estrutura ────────
// Pessoas carregadas só para este módulo (chapa + nome), sem relação com
// estrutura_equipes/eletricistas_cadastro.

export async function listarPessoasSesmt() {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase
    .from('sesmt_pessoas')
    .select('*')
    .order('nome')
  if (error) throw error
  return data || []
}

export async function buscarPessoasSesmtPorNome(termo) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const t = (termo || '').trim()
  if (!t) return []
  const { data, error } = await supabase
    .from('sesmt_pessoas')
    .select('*')
    .eq('ativo', true)
    .ilike('nome', `%${t}%`)
    .order('nome')
    .limit(20)
  if (error) throw error
  return data || []
}

export async function buscarPessoasSesmtPorChapa(termo) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const t = (termo || '').trim()
  if (!t) return []
  const { data, error } = await supabase
    .from('sesmt_pessoas')
    .select('*')
    .eq('ativo', true)
    .ilike('chapa', `%${t}%`)
    .order('chapa')
    .limit(20)
  if (error) throw error
  return data || []
}

// linhas: [{ chapa, nome, codsituacao, codsecao, regional, data_admissao,
// dt_transferencia, data_demissao, pispasep, cpf }]. Upsert por chapa — quem
// já está na lista mantém o id; quem não veio mais na carga é marcado
// inativo (nunca removido, pra não perder histórico de quem já assinou
// alguma ação).
export async function importarPessoasSesmt(linhas, usuarioLogin) {
  if (!supabase) throw new Error('Supabase não configurado.')

  const validas = (linhas || [])
    .map(l => ({
      chapa: String(l.chapa || '').trim(),
      nome: String(l.nome || '').trim().toUpperCase(),
      codsituacao: String(l.codsituacao || '').trim().toUpperCase() || null,
      codsecao: String(l.codsecao || '').trim() || null,
      regional: String(l.regional || '').trim().toUpperCase() || null,
      data_admissao: l.data_admissao || null,
      dt_transferencia: l.dt_transferencia || null,
      data_demissao: l.data_demissao || null,
      pispasep: String(l.pispasep || '').trim() || null,
      cpf: String(l.cpf || '').trim() || null,
    }))
    .filter(l => l.chapa && l.nome)

  if (validas.length === 0) {
    throw new Error('Nenhuma linha válida (é preciso CHAPA e NOME preenchidos).')
  }

  const chapasCount = {}
  validas.forEach(l => { chapasCount[l.chapa] = (chapasCount[l.chapa] || 0) + 1 })
  const duplicadas = Object.entries(chapasCount).filter(([, c]) => c > 1).map(([chapa]) => chapa)
  if (duplicadas.length > 0) {
    throw new Error(`Chapa(s) duplicada(s) no arquivo: ${duplicadas.join(', ')}. Corrija antes de importar.`)
  }

  const agora = new Date().toISOString()
  const payload = validas.map(l => ({
    chapa: l.chapa,
    nome: l.nome,
    codsituacao: l.codsituacao,
    codsecao: l.codsecao,
    regional: l.regional,
    data_admissao: l.data_admissao,
    dt_transferencia: l.dt_transferencia,
    data_demissao: l.data_demissao,
    pispasep: l.pispasep,
    cpf: l.cpf,
    ativo: true,
    carregado_por: usuarioLogin || null,
    carregado_em: agora,
  }))

  for (let i = 0; i < payload.length; i += 100) {
    const { error } = await supabase.from('sesmt_pessoas').upsert(payload.slice(i, i + 100), { onConflict: 'chapa' })
    if (error) throw error
  }

  const chapasCarregadas = new Set(validas.map(l => l.chapa))
  const { data: atuais, error: errAtuais } = await supabase.from('sesmt_pessoas').select('id, chapa, ativo')
  if (errAtuais) throw errAtuais

  const ficamInativos = (atuais || []).filter(p => p.ativo && !chapasCarregadas.has(p.chapa))
  if (ficamInativos.length > 0) {
    const ids = ficamInativos.map(p => p.id)
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await supabase.from('sesmt_pessoas').update({ ativo: false }).in('id', ids.slice(i, i + 100))
      if (error) throw error
    }
  }

  return { importadas: payload.length, inativadas: ficamInativos.length }
}

// ── Motivos padrão por tipo de ação ────────────────────────────────────────────

export async function listarMotivosSesmt(tipo) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase
    .from('sesmt_motivos')
    .select('*')
    .eq('tipo', tipo)
    .eq('ativo', true)
    .order('motivo')
  if (error) throw error
  return data || []
}

// ── Cadastro de motivos (tela de configuração — mesmo padrão de
// src/lib/motivosRegistros.js) ─────────────────────────────────────────────

export async function listarTodosMotivosSesmt() {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase
    .from('sesmt_motivos')
    .select('id, tipo, motivo, ativo')
    .eq('ativo', true)
    .order('tipo')
    .order('motivo')
  if (error) throw error
  return data || []
}

export async function criarMotivoSesmt(tipo, motivo) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase
    .from('sesmt_motivos')
    .insert({ tipo, motivo: motivo.trim().toUpperCase() })
    .select().single()
  if (error) throw error
  return data
}

export async function atualizarMotivoSesmt(id, tipo, motivo) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { error } = await supabase
    .from('sesmt_motivos')
    .update({ tipo, motivo: motivo.trim().toUpperCase() })
    .eq('id', id)
  if (error) throw error
}

export async function removerMotivoSesmt(id) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { error } = await supabase.from('sesmt_motivos').delete().eq('id', id)
  if (error) throw error
}

// ── Ação SESMT (Diálogo de Segurança / Treinamento / Reciclagem) ──────────────

// Faz upload das fotos e assinaturas presenciais, devolve o payload pronto
// pra inserir em sesmt_acoes.
export async function prepararPayloadSesmt(form) {
  const acaoRefId = `${Date.now()}_${form.tipo}`.replace(/\s+/g, '_')

  const fotosUrls = []
  for (let i = 0; i < form.fotos.length; i++) {
    const url = await uploadBase64(
      form.fotos[i].url,
      `sesmt/${acaoRefId}/foto_${i + 1}.jpg`,
      'fotos-auditoria'
    )
    fotosUrls.push(url)
  }

  const participantesComUrl = []
  for (let i = 0; i < form.participantes.length; i++) {
    const p = form.participantes[i]
    let assinaturaUrl = null
    if (p.assinatura) {
      assinaturaUrl = await uploadBase64(
        p.assinatura,
        `sesmt/${acaoRefId}/assinatura_part_${i + 1}.png`,
        'fotos-auditoria'
      )
    }
    participantesComUrl.push({
      nome: p.nome,
      chapa: p.chapa || '',
      assinatura_url: assinaturaUrl,
      assinado_em: p.assinado_em || null,
      modo: p.modo || null,
      lat: p.lat || null,
      lng: p.lng || null,
      endereco_assinatura: p.endereco_assinatura || null,
    })
  }

  return {
    tipo: form.tipo,
    tema: form.tema || null,
    motivo: form.motivo || null,
    observacao: form.observacao || null,
    fiscal: form.fiscal,
    matricula_fiscal: form.matricula_fiscal,
    data_registro: form.data,
    hora_registro: form.hora,
    participantes: participantesComUrl,
    fotos_urls: fotosUrls,
  }
}

export async function salvarAcaoSesmt(payload) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase
    .from('sesmt_acoes')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Assinatura remota via link/QR (espelha src/lib/assinaturas.js) ────────────

export async function criarTokenAssinaturaSesmt(acao_id, expiresMinutes = 60) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const expires_at = new Date(Date.now() + expiresMinutes * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('sesmt_assinaturas_pendentes')
    .insert({ acao_id, status: 'ABERTO', expires_at })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function buscarTokenSesmtPorUUID(token_uuid) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase
    .from('sesmt_assinaturas_pendentes')
    .select(`*, sesmt_acoes ( tipo, tema, motivo, fiscal, data_registro, hora_registro, participantes )`)
    .eq('token', token_uuid)
    .single()
  if (error) throw error
  return data
}

export async function listarAssinaturasSesmtColetadas(token_id) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase
    .from('sesmt_assinaturas_coletadas')
    .select('*')
    .eq('token_id', token_id)
    .order('assinado_em')
  if (error) throw error
  return data || []
}

export async function verificarJaAssinouSesmt(token_id, nome) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data } = await supabase
    .from('sesmt_assinaturas_coletadas')
    .select('id, nome, assinado_em')
    .eq('token_id', token_id)
    .ilike('nome', nome.trim())
    .maybeSingle()
  return data
}

export async function salvarAssinaturaSesmtColetada(
  token_id, acao_id, nome, chapa, assinaturaBase64,
  latitude = null, longitude = null, endereco_assinatura = null
) {
  if (!supabase) throw new Error('Supabase não configurado.')

  let assinatura_url = null
  if (assinaturaBase64) {
    const path = `sesmt/assinaturas_remotas/${token_id}/${Date.now()}_${nome.replace(/\s+/g, '_')}.png`
    assinatura_url = await uploadBase64(assinaturaBase64, path, 'fotos-auditoria')
  }

  const { data, error } = await supabase
    .from('sesmt_assinaturas_coletadas')
    .insert({
      token_id, acao_id, nome,
      matricula: chapa || null,
      assinatura_url,
      latitude: latitude || null,
      longitude: longitude || null,
      endereco_assinatura: endereco_assinatura || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function encerrarTokenSesmt(token_id) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { error } = await supabase
    .from('sesmt_assinaturas_pendentes')
    .update({ status: 'ENCERRADO' })
    .eq('id', token_id)
  if (error) throw error
}
