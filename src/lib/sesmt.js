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

// regionais: array opcional (ex.: ['NORTE']) — restringe a busca a quem tem
// esse valor na coluna `regional`. Vazio/omitido = busca em todo mundo.
export async function buscarPessoasSesmtPorNome(termo, regionais) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const t = (termo || '').trim()
  if (!t) return []
  let q = supabase
    .from('sesmt_pessoas')
    .select('*')
    .eq('ativo', true)
    .ilike('nome', `%${t}%`)
  if (regionais && regionais.length > 0) q = q.in('regional', regionais)
  const { data, error } = await q.order('nome').limit(20)
  if (error) throw error
  return data || []
}

export async function buscarPessoasSesmtPorChapa(termo, regionais) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const t = (termo || '').trim()
  if (!t) return []
  let q = supabase
    .from('sesmt_pessoas')
    .select('*')
    .eq('ativo', true)
    .ilike('chapa', `%${t}%`)
  if (regionais && regionais.length > 0) q = q.in('regional', regionais)
  const { data, error } = await q.order('chapa').limit(20)
  if (error) throw error
  return data || []
}

// Lista TODAS as pessoas ativas de uma (ou mais) regional — sem limite de 20
// como as buscas por texto acima, porque aqui o objetivo é trazer todo mundo
// pra importar em lote. regionais vazio/omitido = lista total.
export async function listarPessoasSesmtPorRegional(regionais) {
  if (!supabase) throw new Error('Supabase não configurado.')
  let q = supabase.from('sesmt_pessoas').select('*').eq('ativo', true)
  if (regionais && regionais.length > 0) q = q.in('regional', regionais)
  const { data, error } = await q.order('nome')
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

// Histórico — só ações concluídas (rascunhos abandonados de QR de
// autoatendimento não aparecem aqui).
export async function listarAcoesSesmt(filtros = {}) {
  if (!supabase) throw new Error('Supabase não configurado.')
  let q = supabase
    .from('sesmt_acoes')
    .select('*')
    .eq('status', 'CONCLUIDA')
    .order('data_registro', { ascending: false })
    .order('hora_registro', { ascending: false })

  if (filtros.tipo)     q = q.eq('tipo', filtros.tipo)
  if (filtros.dataIni)  q = q.gte('data_registro', filtros.dataIni)
  if (filtros.dataFim)  q = q.lte('data_registro', filtros.dataFim)
  if (filtros.fiscal)   q = q.ilike('fiscal', `%${filtros.fiscal}%`)

  const { data, error } = await q
  if (error) throw error
  return data || []
}

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
    // assinatura_url já pronta (ex.: importada de assinatura coletada via QR
    // de autoatendimento) — não re-envia; só faz upload se vier base64 novo.
    let assinaturaUrl = p.assinatura_url || null
    if (!assinaturaUrl && p.assinatura) {
      assinaturaUrl = await uploadBase64(
        p.assinatura,
        `sesmt/${acaoRefId}/assinatura_part_${i + 1}.png`,
        'fotos-auditoria'
      )
    }
    participantesComUrl.push({
      nome: p.nome,
      chapa: p.chapa || '',
      pessoa_id: p.pessoa_id || null,
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
    lat: form.lat || null,
    lng: form.lng || null,
    endereco: form.endereco || null,
    participantes: participantesComUrl,
    fotos_urls: fotosUrls,
  }
}

// Atualiza só a lista de participantes de uma ação já salva — usado quando
// novas assinaturas chegam via QR de autoatendimento depois que a ação já
// foi concluída (o link/QR continua valendo até expirar).
export async function atualizarParticipantesAcaoSesmt(id, participantes) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase
    .from('sesmt_acoes')
    .update({ participantes })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
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

// ── Rascunho de ação — usado quando o fiscal gera o QR de autoatendimento
// ANTES de terminar o wizard: precisa existir uma ação salva (com id) pra
// poder apontar o token pra ela. Fica com status 'RASCUNHO' até o SS4
// finalizar (atualizarAcaoSesmt, status 'CONCLUIDA').
export async function criarAcaoRascunhoSesmt(payload) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase
    .from('sesmt_acoes')
    .insert({ ...payload, status: 'RASCUNHO' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function atualizarAcaoSesmt(id, payload) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase
    .from('sesmt_acoes')
    .update({ ...payload, status: 'CONCLUIDA' })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Marca o rascunho como concluído sem tocar nos demais campos — chamado no
// momento em que o fiscal gera o QR de autoatendimento: a partir daí a ação
// já é considerada salva/oficial (aparece no Histórico), mesmo que o fiscal
// nunca volte pra tela de Resultado pra clicar em "Salvar Ação".
export async function concluirRascunhoAcaoSesmt(id) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase
    .from('sesmt_acoes')
    .update({ status: 'CONCLUIDA' })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Mescla assinaturas coletadas (via QR de autoatendimento OU via link
// online) na lista de participantes já conhecida:
// 1. Quem já estava na lista mas ainda não tinha assinado (ex.: participante
//    online pré-adicionado pelo fiscal) recebe a assinatura assim que ela
//    aparece em sesmt_assinaturas_coletadas — casando por pessoa_id ou,
//    na falta dele, pelo nome.
// 2. Quem assinou sem estar na lista (autoatendimento) entra como novo
//    participante, sem duplicar.
// Retorna a mesma referência quando não há nada novo.
export function mesclarAssinaturasColetadas(participantesAtuais, coletadas) {
  const lista = participantesAtuais || []
  let mudou = false

  const atualizados = lista.map(p => {
    if (p.assinatura_url) return p
    const nomeP = p.nome?.trim().toLowerCase()
    const match = (coletadas || []).find(a =>
      p.pessoa_id ? a.pessoa_id === p.pessoa_id : a.nome?.trim().toLowerCase() === nomeP
    )
    if (!match) return p
    mudou = true
    return {
      ...p,
      pessoa_id: p.pessoa_id || match.pessoa_id || null,
      assinatura_url: match.assinatura_url,
      assinado_em: match.assinado_em,
      lat: match.latitude, lng: match.longitude, endereco_assinatura: match.endereco_assinatura,
    }
  })

  const idsConhecidos = new Set(atualizados.filter(p => p.pessoa_id).map(p => p.pessoa_id))
  const nomesConhecidos = new Set(atualizados.map(p => p.nome?.trim().toLowerCase()))
  const novos = (coletadas || [])
    .filter(a => {
      if (a.pessoa_id && idsConhecidos.has(a.pessoa_id)) return false
      return !nomesConhecidos.has(a.nome?.trim().toLowerCase())
    })
    .map(a => ({
      nome: a.nome, chapa: a.matricula || '', pessoa_id: a.pessoa_id || null,
      assinatura: null, assinatura_url: a.assinatura_url,
      assinado_em: a.assinado_em, modo: 'presencial',
      lat: a.latitude, lng: a.longitude, endereco_assinatura: a.endereco_assinatura,
    }))
  if (novos.length > 0) mudou = true

  return mudou ? [...atualizados, ...novos] : participantesAtuais
}

// Distância em metros entre duas coordenadas (haversine) — usada pra
// comparar o local onde a ação foi registrada com o local de onde cada
// participante assinou, e sinalizar quando alguém assinou longe demais
// (indício de que o link foi repassado pra alguém fora do local, seja
// presencial ou online — os dois guardam lat/lng no momento da assinatura).
export function distanciaMetrosSesmt(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null
  const R = 6371000
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Diz se um token (linha de sesmt_assinaturas_pendentes) já expirou ou foi
// encerrado — usado pra decidir se é hora de limpar quem não assinou.
export function tokenExpiradoOuEncerrado(token) {
  if (!token) return false
  if (token.status === 'ENCERRADO') return true
  return new Date(token.expires_at) < new Date()
}

// Remove da lista quem nunca assinou via link online — só faz sentido
// chamar depois que o token confirmadamente expirou/foi encerrado (ver
// tokenExpiradoOuEncerrado). Presencial nunca entra aqui: só é adicionado
// à lista já com a assinatura feita, então "não assinou" só existe pra
// modo 'online' (adicionado manualmente ou importado em lote). Não existe
// processo de fundo no projeto — isso roda na próxima sincronização
// (polling, botão Atualizar, ou reabrir o link/Histórico) depois da
// expiração, não no instante exato em que o tempo zera.
export function removerParticipantesOnlineNaoAssinados(participantes) {
  const lista = participantes || []
  const filtrados = lista.filter(p => !(p.modo === 'online' && !p.assinatura_url && !p.assinatura))
  return filtrados.length !== lista.length ? filtrados : participantes
}

// ── Assinatura remota via link/QR (espelha src/lib/assinaturas.js) ────────────
// modo: 'ONLINE' (assinatura remota, restrita à lista de participantes que o
// fiscal já adicionou) ou 'AUTOATENDIMENTO' (QR pra imprimir/fixar no local
// — qualquer pessoa da lista geral pode assinar sozinha).
export async function criarTokenAssinaturaSesmt(acao_id, expiresMinutes = 60, modo = 'ONLINE') {
  if (!supabase) throw new Error('Supabase não configurado.')
  const expires_at = new Date(Date.now() + expiresMinutes * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('sesmt_assinaturas_pendentes')
    .insert({ acao_id, status: 'ABERTO', expires_at, modo })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function buscarTokenSesmtPorUUID(token_uuid) {
  if (!supabase) throw new Error('Supabase não configurado.')
  // Duas consultas separadas em vez de embed do PostgREST — não há foreign
  // key entre sesmt_assinaturas_pendentes e sesmt_acoes (mesmo padrão de
  // "sem FK" adotado nas outras tabelas do módulo), e o embed (select
  // "*, sesmt_acoes(...)") depende de uma FK existir pra funcionar.
  const { data, error } = await supabase
    .from('sesmt_assinaturas_pendentes')
    .select('*')
    .eq('token', token_uuid)
    .single()
  if (error) throw error

  const { data: acao, error: errAcao } = await supabase
    .from('sesmt_acoes')
    .select('tipo, tema, motivo, fiscal, data_registro, hora_registro, participantes')
    .eq('id', data.acao_id)
    .single()
  if (errAcao) throw errAcao
  data.sesmt_acoes = acao
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

// Todas as assinaturas coletadas de uma ação, independente de qual token/QR
// foi usado — usado pelo Histórico pra manter o card sincronizado enquanto
// o link de autoatendimento ainda estiver ativo.
export async function listarAssinaturasSesmtColetadasPorAcao(acao_id) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase
    .from('sesmt_assinaturas_coletadas')
    .select('*')
    .eq('acao_id', acao_id)
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

// pessoa_id: id exato de sesmt_pessoas escolhido no autocomplete — garante
// vínculo confiável entre quem assinou e a lista carregada (pra saber
// quantos/quais, do total, já assinaram uma ação).
export async function salvarAssinaturaSesmtColetada(
  token_id, acao_id, nome, chapa, pessoa_id, assinaturaBase64,
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
      pessoa_id: pessoa_id || null,
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

// Token mais recente gerado pra uma ação (ONLINE ou AUTOATENDIMENTO) —
// usado pelo Histórico pra mostrar se ainda há um link ativo coletando
// assinaturas e permitir encerrá-lo por lá também, sem precisar voltar
// pro wizard.
export async function buscarTokenMaisRecenteSesmtPorAcao(acao_id) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase
    .from('sesmt_assinaturas_pendentes')
    .select('*')
    .eq('acao_id', acao_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data || null
}

export async function encerrarTokenSesmt(token_id) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { error } = await supabase
    .from('sesmt_assinaturas_pendentes')
    .update({ status: 'ENCERRADO' })
    .eq('id', token_id)
  if (error) throw error
}
