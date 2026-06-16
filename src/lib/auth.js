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

  // Carrega processos atribuídos especificamente ao usuário (granularidade individual)
  const { data: procsUsuario } = await supabase
    .from('usuarios_processos')
    .select('processo_chave')
    .eq('usuario_id', usuario.id)

  // União: permissões do perfil + processos do usuário (chaves processo_XXX)
  // O PainelFiltros lê tudo de uma lista única `permissoes`, então basta juntar.
  const permissoes = [
    ...(perms        || []).map(p => p.permissao),
    ...(procsUsuario || []).map(p => p.processo_chave),
  ]

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

// ─── CRUD Processos do Usuário (granularidade individual) ────────────────────
export async function listarProcessosUsuario(usuarioId) {
  const { data, error } = await supabase
    .from('usuarios_processos')
    .select('processo_chave')
    .eq('usuario_id', usuarioId)
  if (error) throw error
  return (data || []).map(r => r.processo_chave)
}

// Salva a lista COMPLETA de processos do usuário (substitui tudo).
// Estratégia: deleta tudo do usuário, insere a nova lista. Mais simples e seguro.
export async function salvarProcessosUsuario(usuarioId, processosChaves) {
  console.log('🔄 salvarProcessosUsuario:', { usuarioId, processosChaves })

  // Deleta os atuais
  const { error: errDel, count: countDel } = await supabase
    .from('usuarios_processos')
    .delete({ count: 'exact' })
    .eq('usuario_id', usuarioId)
  if (errDel) {
    console.error('❌ Erro no DELETE:', errDel)
    throw new Error('Erro ao limpar processos antigos: ' + errDel.message)
  }
  console.log(`🗑️  Deletados ${countDel ?? 0} processos antigos`)

  // Insere os novos (se houver)
  if (processosChaves.length > 0) {
    const payload = processosChaves.map(chave => ({
      usuario_id:     usuarioId,
      processo_chave: chave,
    }))
    console.log('📥 INSERT payload:', payload)

    const { data, error: errIns } = await supabase
      .from('usuarios_processos')
      .insert(payload)
      .select()
    if (errIns) {
      console.error('❌ Erro no INSERT:', errIns)
      throw new Error('Erro ao salvar processos novos: ' + errIns.message)
    }
    console.log('✅ INSERT ok:', data)
  }
}
