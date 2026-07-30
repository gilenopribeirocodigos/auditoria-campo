import { supabase } from './supabase.js'

function exigirSupabase() {
  if (!supabase) {
    throw new Error('A conexão com o banco de dados não está configurada.')
  }
}

function primeiroRegistro(data) {
  if (Array.isArray(data)) return data[0] || null
  return data || null
}

function bancoSTC() {
  exigirSupabase()
  return supabase.schema('public')
}

export async function buscarAlertaSTCPorToken(token) {
  const { data, error } = await bancoSTC().rpc('stc_obter_alerta_por_token', {
    p_token: token,
  })

  if (error) {
    console.error('Erro ao consultar alerta STC:', error)
    throw new Error('Não foi possível consultar este alerta.')
  }

  return primeiroRegistro(data)
}

export async function encerrarAlertaSTC(token, encerradoPor, justificativa) {
  const { data, error } = await bancoSTC().rpc('stc_encerrar_alerta', {
    p_token: token,
    p_encerrado_por: encerradoPor.trim(),
    p_justificativa: justificativa.trim(),
  })

  if (error) {
    console.error('Erro ao encerrar alerta STC:', error)
    throw new Error(error.message || 'Não foi possível encerrar este alerta.')
  }

  return primeiroRegistro(data)
}
