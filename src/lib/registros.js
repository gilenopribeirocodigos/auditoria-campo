import { supabase, uploadBase64 } from './supabase.js'
import { temPermissao } from './auth.js'

// Mesmo padrão de gerarNumeroAcaoSesmt()/gerarNumeroOcorrencia() — número
// único de rastreabilidade do Registro Operacional (padronização com
// numero_acao do SESMT, pra aparecer igual na view vw_historico_acoes_sesmt).
export function gerarNumeroRegistro() {
  const agora = new Date()
  const partes = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Fortaleza',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(agora)
  const valor = tipo => partes.find(p => p.type === tipo)?.value || '00'
  const data = `${valor('year')}${valor('month')}${valor('day')}`
  const hora = `${valor('hour')}${valor('minute')}${valor('second')}`
  const sufixo = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X')
  return `REG-${data}-${hora}-${sufixo}`
}

// Mesma lógica de calcularRegionalPredominanteSesmt() em lib/sesmt.js, só
// que casando pela matrícula do participante contra estrutura_equipes (os
// participantes de Registro Operacional não têm pessoa_id/vínculo com
// sesmt_pessoas) — participante sem matrícula, ou matrícula sem match na
// Estrutura, simplesmente não entra na contagem. Sem nenhum participante
// identificável, devolve null (registro fica sem regional, igual uma ação
// SESMT sem nenhum pessoa_id reconhecido).
export async function calcularRegionalPredominanteRegistro(participantes) {
  if (!supabase) return null
  const matriculas = [...new Set((participantes || []).map(p => p.matricula?.trim()).filter(Boolean))]
  if (matriculas.length === 0) return null
  const TAMANHO_LOTE = 200
  const contagem = {}
  for (let i = 0; i < matriculas.length; i += TAMANHO_LOTE) {
    const lote = matriculas.slice(i, i + TAMANHO_LOTE)
    const { data, error } = await supabase.from('estrutura_equipes').select('matricula, regional').in('matricula', lote)
    if (!error && data) data.forEach(p => { if (p.regional) contagem[p.regional] = (contagem[p.regional] || 0) + 1 })
  }
  const entradas = Object.entries(contagem)
  if (entradas.length === 0) return null
  entradas.sort((a, b) => b[1] - a[1])
  return entradas[0][0]
}

// ─── Salva registro no banco ──────────────────────────────────────────────────
export async function salvarRegistroBD(payload) {
  if (!supabase) throw new Error('Supabase não configurado.')
  let { data, error } = await supabase
    .from('registros_operacionais')
    .insert(payload)
    .select()
    .single()

  // Mantem o salvamento funcionando caso o deploy do app chegue antes da
  // migracao SQL que adiciona a coluna "motivo" ou numero_registro/status/
  // regional (padronização com sesmt_acoes — ver vw_historico_acoes_sesmt).
  if (error && /column .* does not exist/i.test(error.message || '')) {
    const { motivo, numero_registro, status, regional, ...payloadCompat } = payload
    ;({ data, error } = await supabase
      .from('registros_operacionais')
      .insert(payloadCompat)
      .select()
      .single())
  }

  if (error) throw error
  return data
}

// ─── Lista registros com filtros ──────────────────────────────────────────────
export async function listarRegistros(filtros = {}, usuarioLogado) {
  if (!supabase) return []
  let q = supabase
    .from('registros_operacionais')
    .select('*')
    .order('data_registro', { ascending: false })
    .order('hora_registro', { ascending: false })
  // ADMIN sempre pode (temPermissao já libera); os demais só se tiverem a
  // permissão marcada em Gestão de Usuários — senão, só os próprios registros.
  const podeVerTodos = temPermissao(usuarioLogado, 'ver_todos_registros_operacionais')
  if (!podeVerTodos) {
    q = q.eq('matricula_fiscal', usuarioLogado?.matricula)
  }
  if (filtros.dataIni) q = q.gte('data_registro', filtros.dataIni)
  if (filtros.dataFim) q = q.lte('data_registro', filtros.dataFim)
  // filtros.tipo aceita string única (RelatorioEvidencias.jsx, single-select)
  // ou array (RegistrosOperacionais.jsx, multi-select) — compatível com os dois.
  if (filtros.tipo) {
    if (Array.isArray(filtros.tipo)) {
      if (filtros.tipo.length > 0) q = q.in('tipo', filtros.tipo)
    } else {
      q = q.eq('tipo', filtros.tipo)
    }
  }
  if (filtros.fiscais && filtros.fiscais.length > 0) {
    // Múltiplos fiscais selecionados
    q = q.in('fiscal', filtros.fiscais)
  } else if (filtros.fiscal) {
    q = q.ilike('fiscal', `%${filtros.fiscal}%`)
  }
  // 2026-09-19: evita espera indefinida nas telas de registros e SESMT.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const { data, error } = await q.abortSignal(controller.signal)
    if (error) throw error
    return data || []
  } catch (error) {
    if (controller.signal.aborted) throw new Error('A busca demorou mais de 30 segundos. Tente novamente com um periodo menor.')
    throw error
  } finally { clearTimeout(timeout) }
}

// ─── Faz upload de todas as mídias e retorna payload completo ─────────────────
export async function prepararPayload(form) {
  const registroId = `${Date.now()}_${form.tipo}_${form.fiscal}`.replace(/\s+/g, '_')

  // Upload fotos de evidência
  const fotosUrls = []
  for (let i = 0; i < form.fotos.length; i++) {
    const url = await uploadBase64(
      form.fotos[i].url,
      `registros/${registroId}/foto_${i + 1}.jpg`,
      'fotos-auditoria'
    )
    fotosUrls.push(url)
  }

  // Upload assinaturas dos participantes
  const participantesComUrl = []
  for (let i = 0; i < form.participantes.length; i++) {
    const p = form.participantes[i]
    let assinaturaUrl = null
    if (p.assinatura) {
      assinaturaUrl = await uploadBase64(
        p.assinatura,
        `registros/${registroId}/assinatura_part_${i + 1}.png`,
        'fotos-auditoria'
      )
    }
    participantesComUrl.push({
      nome:                p.nome,
      matricula:           p.matricula,
      assinatura_url:      assinaturaUrl,
      assinado_em:         p.assinado_em,
      modo:                p.modo || null,
      lat:                 p.lat || null,
      lng:                 p.lng || null,
      endereco_assinatura: p.endereco_assinatura || null,
    })
  }

  // Upload lista impressa (se houver)
  let listaImpressaUrl = null
  if (form.lista_impressa) {
    listaImpressaUrl = await uploadBase64(
      form.lista_impressa,
      `registros/${registroId}/lista_impressa.jpg`,
      'fotos-auditoria'
    )
  }

  const regional = await calcularRegionalPredominanteRegistro(form.participantes)

  return {
    numero_registro:    form.numero_registro || gerarNumeroRegistro(),
    status:             'CONCLUIDA',
    regional,
    tipo:               form.tipo,
    modalidade:         form.modalidade,
    tipo_medida:        form.tipo_medida || null,
    fiscal:             form.fiscal,
    matricula_fiscal:   form.matricula_fiscal,
    data_registro:      form.data,
    hora_registro:      form.hora,
    endereco:           form.endereco,
    lat:                form.lat,
    lng:                form.lng,
    pauta:              form.pauta,
    motivo:             form.motivo || null,
    tema:               form.tema || null,
    carga_horaria:      form.carga_horaria || null,
    participantes:      participantesComUrl,
    fotos_urls:         fotosUrls,
    lista_impressa_url: listaImpressaUrl,
    observacoes:        form.observacoes || null,
  }
}
