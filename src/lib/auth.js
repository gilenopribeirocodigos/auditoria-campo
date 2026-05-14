import { supabase } from './supabase.js'

const SESSION_KEY = 'dpl_audit_user'

export async function fazerLogin(login, senha) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('login', login.trim().toLowerCase())
    .eq('status', 'ATIVO')
  if (error) throw new Error('Erro de conexão: ' + error.message)
  if (!data || data.length === 0) throw new Error('Usuário não encontrado ou inativo.')
  const usuario = data[0]
  if (usuario.senha !== senha) throw new Error('Senha incorreta.')

  // Carrega permissões do perfil
  const { data: perms } = await supabase
    .from('perfis_permissoes')
    .select('permissao')
    .eq('perfil', usuario.perfil)

  const permissoes = (perms || []).map(p => p.permissao)

  localStorage.setItem(SESSION_KEY, JSON.stringify({
    id:          usuario.id,
    nome:        usuario.nome,
    login:       usuario.login,
    perfil:      usuario.perfil,
    matricula:   usuario.matricula,
    base_regiao: usuario.base_regiao,
    permissoes,
  }))
  return usuario
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

export function temPermissao(usuario, permissao) {
  if (!usuario) return false
  if (usuario.perfil === 'ADMIN') return true
  return (usuario.permissoes || []).includes(permissao)
}

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
