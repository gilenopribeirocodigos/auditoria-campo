import { supabase, uploadBase64 } from './supabase.js'
import { temPermissao } from './auth.js'

// ─── Salva registro no banco ──────────────────────────────────────────────────
export async function salvarRegistroBD(payload) {
  if (!supabase) throw new Error('Supabase não configurado.')
  let { data, error } = await supabase
    .from('registros_operacionais')
    .insert(payload)
    .select()
    .single()

  // Mantem o salvamento funcionando caso o deploy do app chegue antes da
  // migracao SQL que adiciona a coluna "motivo".
  if (error && /column .* does not exist/i.test(error.message || '')) {
    const { motivo, ...payloadCompat } = payload
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
  if (filtros.tipo)    q = q.eq('tipo', filtros.tipo)
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

  return {
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
