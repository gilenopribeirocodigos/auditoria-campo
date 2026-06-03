import { supabase } from './supabase.js'

const SESSION_KEY  = 'dpl_audit_user'
const VERSAO_KEY   = 'dpl_versao'
const ATIVIDADE_KEY = 'dpl_ultima_atividade'
const TIMEOUT_MIN  = 60 // minutos de ociosidade para deslogar

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

  // Salva versão atual e atividade no login
  registrarAtividade()
  const versaoAtual = await sincronizarVersaoLocal()

  // Registra no banco qual versão o usuário está usando e quando logou
  try {
    await supabase
      .from('usuarios')
      .update({
        versao_app:   versaoAtual || null,
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

// ─── Versão do sistema ────────────────────────────────────────────────────────
// Retorna a versão sincronizada (para registrar no banco no login)
async function sincronizarVersaoLocal() {
  try {
    const { data } = await supabase
      .from('sistema_config')
      .select('valor')
      .eq('chave', 'versao')
      .single()
    if (data?.valor) {
      localStorage.setItem(VERSAO_KEY, data.valor)
      return data.valor
    }
  } catch { /* silencioso */ }
  return localStorage.getItem(VERSAO_KEY) || null
}

// Retorna true se a sessão é válida, false se deve deslogar/recarregar
export async function verificarSessao() {
  const usuario = getUsuarioLogado()
  if (!usuario) return { valida: false, motivo: null }

  // 1. Verifica timeout de ociosidade
  if (ociosoHaMais(TIMEOUT_MIN)) {
    fazerLogout()
    return { valida: false, motivo: 'timeout' }
  }

  // 2. Verifica versão do sistema no servidor
  try {
    const { data } = await supabase
      .from('sistema_config')
      .select('valor')
      .eq('chave', 'versao')
      .single()

    const versaoServidor = data?.valor
    const versaoLocal    = localStorage.getItem(VERSAO_KEY)

    if (versaoServidor && versaoLocal && versaoServidor !== versaoLocal) {
      // Versão mudou — desloga e sinaliza para recarregar
      fazerLogout()
      localStorage.setItem(VERSAO_KEY, versaoServidor)
      return { valida: false, motivo: 'nova_versao' }
    }

    if (versaoServidor && !versaoLocal) {
      localStorage.setItem(VERSAO_KEY, versaoServidor)
    }
  } catch { /* sem internet, ignora verificação de versão */ }

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
