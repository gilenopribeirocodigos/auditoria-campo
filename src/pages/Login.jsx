import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

const SESSION_KEY = 'dpl_audit_user'

export default function Login({ onLogin }) {
  const [login,   setLogin]   = useState('')
  const [senha,   setSenha]   = useState('')
  const [erro,    setErro]    = useState('')
  const [debug,   setDebug]   = useState('')
  const [loading, setLoading] = useState(false)

  const entrar = async e => {
    e.preventDefault()
    if (!login || !senha) { setErro('Preencha login e senha.'); return }
    setLoading(true); setErro(''); setDebug('')

    try {
      // 1. Verifica se supabase está configurado
      if (!supabase) {
        setDebug('ERRO: Supabase é null — variáveis de ambiente não carregadas.')
        throw new Error('Supabase não configurado.')
      }
      setDebug('Supabase OK. Buscando usuário...')

      // 2. Busca sem filtro de status para ver o que existe
      const { data: todos, error: errTodos } = await supabase
        .from('usuarios')
        .select('id, nome, login, status, perfil')

      if (errTodos) {
        setDebug('Erro ao acessar tabela usuarios: ' + errTodos.message)
        throw new Error('Erro de conexão: ' + errTodos.message)
      }

      setDebug(`Usuários encontrados na tabela: ${JSON.stringify(todos?.map(u => u.login))}`)

      // 3. Busca pelo login digitado
      const loginDigitado = login.trim().toLowerCase()
      const encontrado = todos?.find(u => u.login === loginDigitado)

      if (!encontrado) {
        setDebug(prev => prev + ` | Login "${loginDigitado}" NÃO encontrado na tabela.`)
        throw new Error(`Usuário "${loginDigitado}" não encontrado.`)
      }

      if (encontrado.status !== 'ATIVO') {
        throw new Error(`Usuário encontrado mas status é "${encontrado.status}".`)
      }

      // 4. Busca com senha
      const { data: comSenha, error: errSenha } = await supabase
        .from('usuarios')
        .select('*')
        .eq('login', loginDigitado)

      if (errSenha) throw new Error('Erro: ' + errSenha.message)

      const usuario = comSenha[0]
      if (usuario.senha !== senha) {
        setDebug(prev => prev + ` | Senha digitada não confere.`)
        throw new Error('Senha incorreta.')
      }

      // 5. Login OK
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        id: usuario.id, nome: usuario.nome, login: usuario.login,
        perfil: usuario.perfil, base_regiao: usuario.base_regiao,
      }))
      onLogin(usuario)

    } catch (err) {
      setErro(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: 52, marginBottom: 10 }}>⚡</div>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
            Auditoria Operacional
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
            DPL Construções — Equatorial Energia
          </p>
        </div>

        <div style={{
          background: '#fff', borderRadius: 20, padding: '32px 28px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 24, textAlign: 'center' }}>
            Acesse sua conta
          </h2>

          <form onSubmit={entrar}>
            <div className="form-group">
              <label className="form-label">Login</label>
              <input className="form-input" type="text" placeholder="seu.login"
                value={login} onChange={e => setLogin(e.target.value)}
                autoCapitalize="none" autoCorrect="off" />
            </div>

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="form-label">Senha</label>
              <input className="form-input" type="password" placeholder="••••••••"
                value={senha} onChange={e => setSenha(e.target.value)} />
            </div>

            {erro && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                padding: '10px 14px', fontSize: 13, color: '#b91c1c', marginBottom: 10,
              }}>
                ❌ {erro}
              </div>
            )}

            {/* DIAGNÓSTICO — aparece só quando há debug */}
            {debug && (
              <div style={{
                background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8,
                padding: '10px 14px', fontSize: 11, color: '#0369a1',
                marginBottom: 16, wordBreak: 'break-all', lineHeight: 1.6,
              }}>
                🔍 {debug}
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={loading}
              style={{ background: loading ? '#64748b' : '#2563eb', fontSize: 16, fontWeight: 700 }}>
              {loading ? '⏳ Verificando...' : '🔐 Entrar'}
            </button>
          </form>
        </div>

        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textAlign: 'center', marginTop: 20 }}>
          Contrato 1021/2024 — Sistema de Auditoria v2.0
        </p>
      </div>
    </div>
  )
}
