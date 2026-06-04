import { supabase } from './supabase.js'

const SESSION_KEY   = 'dpl_audit_user'
const VERSAO_KEY    = 'dpl_versao'
const ATIVIDADE_KEY = 'dpl_ultima_atividade'
const TIMEOUT_MIN   = 150 // minutos de ociosidade para deslogar.

// Versão buildada (injetada pelo Vite a partir do package.json — Opção A)
// Fallback para '' caso não esteja definida (ex.: ambiente de teste)
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''

// Exporta para outros módulos (App.jsx, telas, etc.) usarem a versão atual
export function getVersaoApp() {
  return APP_VERSION
}

// ─── Login ────────────────────────────────────────────────────────────────────
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

  const usuarioSessao = {
    id:          usuario.id,
    nome:        usuario.nome,
    login:       usuario.login,
    perfil:      usuario.perfil,
    matricula:   usuario.matricula,
    base_regiao: usuario.base_regiao,
    permissoes,
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify(usuarioSessao))

  // Salva a versão buildada que o usuário está rodando neste login
  registrarAtividade()
  localStorage.setItem(VERSAO_KEY, APP_VERSION)

  // Registra no banco qual versão o usuário está usando e quando logou
  // (alimenta a tela de Gestão de Usuários)
  try {
    await supabase
      .from('usuarios')
      .update({
        versao_app:   APP_VERSION || null,
        ultimo_login: new Date().toISOString(),
      })
      .eq('id', usuario.id)
  } catch { /* não bloqueia o login se falhar */ }

  return usuarioSessao
}

// ─── Sessão ───────────────────────────────────────────────────────────────────
export function getUsuarioLogado() {
  try {
    const s = localStorage.getItem(SESSION_KEY)
    return s ? JSON.parse(s) : null
  } catch { return null }
}

export function fazerLogout() {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(ATIVIDADE_KEY)
}

// ─── Atividade ────────────────────────────────────────────────────────────────
export function registrarAtividade() {
  localStorage.setItem(ATIVIDADE_KEY, Date.now().toString())
}

function ociosoHaMais(minutos) {
  const ultima = localStorage.getItem(ATIVIDADE_KEY)
  if (!ultima) return false
  const diff = (Date.now() - parseInt(ultima)) / 1000 / 60
  return diff > minutos
}

// ─── Verificação de sessão ──────────────────────────────────────────────────
// Retorna true se a sessão é válida, false se deve deslogar/recarregar
export async function verificarSessao() {
  const usuario = getUsuarioLogado()
  if (!usuario) return { valida: false, motivo: null }

  // 1. Verifica timeout de ociosidade
  if (ociosoHaMais(TIMEOUT_MIN)) {
    fazerLogout()
    return { valida: false, motivo: 'timeout' }
  }

  // 2. Verifica se a versão buildada mudou em relação à que o usuário tem.
  //    Quando você faz deploy de uma versão nova do package.json,
  //    APP_VERSION muda e força o relogin automaticamente — SEM SQL.
  const versaoLocal = localStorage.getItem(VERSAO_KEY)

  if (APP_VERSION && versaoLocal && APP_VERSION !== versaoLocal) {
    fazerLogout()
    localStorage.setItem(VERSAO_KEY, APP_VERSION)
    return { valida: false, motivo: 'nova_versao' }
  }

  // Primeira vez sem versão salva — apenas registra
  if (APP_VERSION && !versaoLocal) {
    localStorage.setItem(VERSAO_KEY, APP_VERSION)
  }

  return { valida: true, motivo: null }
}

// ─── Permissões ───────────────────────────────────────────────────────────────
export function isAdmin(usuario) {
  return usuario?.perfil === 'ADMIN'
}

export function temPermissao(usuario, permissao) {
  if (!usuario) return false
  if (usuario.perfil === 'ADMIN') return true
  return (usuario.permissoes || []).includes(permissao)
}

// ─── CRUD Usuários ────────────────────────────────────────────────────────────
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
