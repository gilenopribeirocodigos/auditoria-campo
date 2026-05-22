import { supabase, uploadBase64 } from './supabase.js'

// ── Cria token de assinatura para um registro ─────────────────────────────────
export async function criarTokenAssinatura(registro_id) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase
    .from('assinaturas_pendentes')
    .insert({ registro_id, status: 'ABERTO' })
    .select()
    .single()
  if (error) throw error
  return data // { id, token, registro_id, status, expires_at }
}

// ── Busca token pelo UUID do token ────────────────────────────────────────────
export async function buscarTokenPorUUID(token_uuid) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase
    .from('assinaturas_pendentes')
    .select(`
      *,
      registros_operacionais (
        tipo, modalidade, tipo_medida,
        fiscal, matricula_fiscal,
        data_registro, hora_registro,
        endereco, pauta, tema, carga_horaria,
        participantes
      )
    `)
    .eq('token', token_uuid)
    .single()
  if (error) throw error
  return data
}

// ── Lista assinaturas coletadas de um token ───────────────────────────────────
export async function listarAssinaturasColetadas(token_id) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase
    .from('assinaturas_coletadas')
    .select('*')
    .eq('token_id', token_id)
    .order('assinado_em')
  if (error) throw error
  return data || []
}

// ── Salva assinatura coletada via link ────────────────────────────────────────
export async function salvarAssinaturaColetada(token_id, registro_id, nome, matricula, assinaturaBase64) {
  if (!supabase) throw new Error('Supabase não configurado.')

  // Upload da assinatura para o Storage
  let assinatura_url = null
  if (assinaturaBase64) {
    const path = `assinaturas_remotas/${token_id}/${Date.now()}_${nome.replace(/\s+/g, '_')}.png`
    assinatura_url = await uploadBase64(assinaturaBase64, path, 'fotos-auditoria')
  }

  const { data, error } = await supabase
    .from('assinaturas_coletadas')
    .insert({
      token_id,
      registro_id,
      nome,
      matricula: matricula || null,
      assinatura_url,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Verifica se o nome já assinou neste token ─────────────────────────────────
export async function verificarJaAssinou(token_id, nome) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data } = await supabase
    .from('assinaturas_coletadas')
    .select('id, nome, assinado_em')
    .eq('token_id', token_id)
    .ilike('nome', nome.trim())
    .maybeSingle()
  return data // null = não assinou ainda
}

// ── Encerra o token (fiscal fecha o link) ─────────────────────────────────────
export async function encerrarToken(token_id) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { error } = await supabase
    .from('assinaturas_pendentes')
    .update({ status: 'ENCERRADO' })
    .eq('id', token_id)
  if (error) throw error
}

// ── Lista tokens de um registro ───────────────────────────────────────────────
export async function listarTokensRegistro(registro_id) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase
    .from('assinaturas_pendentes')
    .select('*')
    .eq('registro_id', registro_id)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}
