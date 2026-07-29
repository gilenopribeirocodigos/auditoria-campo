// CRUD do cadastro de Motivos da Auditoria (Pauta de Fiscalização) — mesmo
// padrão de src/lib/motivosRegistros.js: cadastro editável em vez de lista
// fixa no código.
import { supabase } from './supabase.js'

function assertSupabase() {
  if (!supabase) throw new Error('Supabase não configurado — verifique as variáveis de ambiente.')
}

export async function listarMotivos() {
  assertSupabase()
  const { data, error } = await supabase
    .from('motivos_auditoria')
    .select('id, motivo, ativo')
    .eq('ativo', true)
    .order('motivo')
  if (error) throw error
  return data || []
}

export async function criarMotivo(motivo) {
  assertSupabase()
  const { data, error } = await supabase
    .from('motivos_auditoria')
    .insert({ motivo: motivo.trim().toUpperCase() })
    .select().single()
  if (error) throw error
  return data
}

export async function atualizarMotivo(id, motivo) {
  assertSupabase()
  const { error } = await supabase
    .from('motivos_auditoria')
    .update({ motivo: motivo.trim().toUpperCase() })
    .eq('id', id)
  if (error) throw error
}

export async function removerMotivo(id) {
  assertSupabase()
  const { error } = await supabase.from('motivos_auditoria').delete().eq('id', id)
  if (error) throw error
}
