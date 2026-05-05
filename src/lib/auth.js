import { supabase } from './supabase.js'

const SESSION_KEY = 'dpl_audit_user'

export async function fazerLogin(login, senha) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('login', login.trim().toLowerCase())
    .eq('senha', senha)
    .eq('status', 'ATIVO')
    .single()
  if (error || !data) throw new Error('Login ou senha incorretos.')
  // Salva sessão no localStorage
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    id: data.id, nome: data.nome, login: data.login,
    perfil: data.perfil, base_regiao: data.base_regiao,
  }))
  return data
}

export function getUsuarioLogado() {
  try {
    const s = localStorage.getItem(SESSION_KEY)
    return s ? JSON.parse(s) : null
  } catch { return null }
}

export function fazerLogout() {
  localStorage.removeItem(SESSION_KEY)
}

export function isAdmin(usuario) {
  return usuario?.perfil === 'ADMIN'
}

// CRUD usuários
export async function listarUsuarios() {
  const { data, error } = await supabase
    .from('usuarios').select('*').order('nome')
  if (error) throw error
  return data
}

export async function criarUsuario(payload) {
  const { data, error } = await supabase
    .from('usuarios').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function atualizarUsuario(id, payload) {
  const { data, error } = await supabase
    .from('usuarios').update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deletarUsuario(id) {
  const { error } = await supabase.from('usuarios').delete().eq('id', id)
  if (error) throw error
}
