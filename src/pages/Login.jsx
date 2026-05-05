import { useState } from 'react'
import { fazerLogin } from '../lib/auth.js'

export default function Login({ onLogin }) {
  const [login,  setLogin]  = useState('')
  const [senha,  setSenha]  = useState('')
  const [erro,   setErro]   = useState('')
  const [loading, setLoading] = useState(false)

  const entrar = async e => {
    e.preventDefault()
    if (!login || !senha) { setErro('Preencha login e senha.'); return }
    setLoading(true); setErro('')
    try {
      const user = await fazerLogin(login, senha)
      onLogin(user)
    } catch (err) {
      setErro(err.message || 'Erro ao fazer login.')
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo / título */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: 52, marginBottom: 10 }}>⚡</div>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
            Auditoria Operacional
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
            DPL Construções — Equatorial Energia
          </p>
        </div>

        {/* Card de login */}
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
              <input
                className="form-input"
                type="text"
                placeholder="seu.login"
                value={login}
                onChange={e => setLogin(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="form-label">Senha</label>
              <input
                className="form-input"
                type="password"
                placeholder="••••••••"
                value={senha}
                onChange={e => setSenha(e.target.value)}
              />
            </div>

            {erro && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                padding: '10px 14px', fontSize: 13, color: '#b91c1c', marginBottom: 16,
              }}>
                ❌ {erro}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{ background: loading ? '#64748b' : '#2563eb', fontSize: 16, fontWeight: 700 }}
            >
              {loading ? '⏳ Entrando...' : '🔐 Entrar'}
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
