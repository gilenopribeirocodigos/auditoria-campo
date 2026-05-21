import { supabase, uploadBase64 } from './supabase.js'

// ─── Salva registro no banco ──────────────────────────────────────────────────
export async function salvarRegistroBD(payload) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase
    .from('registros_operacionais')
    .insert(payload)
    .select()
    .single()
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

  const podeVerTodos = ['ADMIN', 'SUPERV. OPERAÇÃO', 'SUPERV. CAMPO']
    .includes(usuarioLogado?.perfil)

  if (!podeVerTodos) {
    q = q.eq('matricula_fiscal', usuarioLogado?.matricula)
  }

  if (filtros.dataIni) q = q.gte('data_registro', filtros.dataIni)
  if (filtros.dataFim) q = q.lte('data_registro', filtros.dataFim)
  if (filtros.tipo)    q = q.eq('tipo', filtros.tipo)
  if (filtros.fiscal)  q = q.ilike('fiscal', `%${filtros.fiscal}%`)

  const { data, error } = await q
  if (error) throw error
  return data || []
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
      nome:          p.nome,
      matricula:     p.matricula,
      assinatura_url: assinaturaUrl,
      assinado_em:   p.assinado_em,
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
    tipo:             form.tipo,
    modalidade:       form.modalidade,
    tipo_medida:      form.tipo_medida || null,
    fiscal:           form.fiscal,
    matricula_fiscal: form.matricula_fiscal,
    data_registro:    form.data,
    hora_registro:    form.hora,
    endereco:         form.endereco,
    lat:              form.lat,
    lng:              form.lng,
    pauta:            form.pauta,
    tema:             form.tema || null,
    carga_horaria:    form.carga_horaria || null,
    participantes:    participantesComUrl,
    fotos_urls:       fotosUrls,
    lista_impressa_url: listaImpressaUrl,
    observacoes:      form.observacoes || null,
  }
}
