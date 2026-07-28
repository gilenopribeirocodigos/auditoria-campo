// CRUD do cadastro de Motivos por tipo de Registro Operacional — mesmo padrão
// de sql/pc_classificacoes (cadastro editável em vez de lista fixa no código).
import { supabase } from './supabase.js'

function assertSupabase() {
  if (!supabase) throw new Error('Supabase não configurado — verifique as variáveis de ambiente.')
}

export async function listarMotivos() {
  assertSupabase()
  const { data, error } = await supabase
    .from('motivos_registros_operacionais')
    .select('id, tipo_registro, motivo, ativo')
    .eq('ativo', true)
    .order('tipo_registro')
    .order('motivo')
  if (error) throw error
  return data || []
}

export async function listarMotivosPorTipo(tipoRegistro) {
  const todos = await listarMotivos()
  return todos.filter(m => m.tipo_registro === tipoRegistro)
}

export async function criarMotivo(tipoRegistro, motivo) {
  assertSupabase()
  const { data, error } = await supabase
    .from('motivos_registros_operacionais')
    .insert({ tipo_registro: tipoRegistro, motivo: motivo.trim().toUpperCase() })
    .select().single()
  if (error) throw error
  return data
}

export async function atualizarMotivo(id, tipoRegistro, motivo) {
  assertSupabase()
  const { error } = await supabase
    .from('motivos_registros_operacionais')
    .update({ tipo_registro: tipoRegistro, motivo: motivo.trim().toUpperCase() })
    .eq('id', id)
  if (error) throw error
}

export async function removerMotivo(id) {
  assertSupabase()
  const { error } = await supabase.from('motivos_registros_operacionais').delete().eq('id', id)
  if (error) throw error
}
