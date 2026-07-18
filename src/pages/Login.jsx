import { useState } from 'react'
import { fazerLogin, getVersaoApp } from '../lib/auth.js'

const VERSAO = getVersaoApp()

export default function Login({ onLogin }) {
  const [login,        setLogin]        = useState('')
  const [senha,        setSenha]        = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [erro,    setErro]    = useState('')
  const [debug,   setDebug]   = useState('')
  const [loading, setLoading] = useState(false)
  const entrar = async e => {
    e.preventDefault()
    if (!login || !senha) { setErro('Preencha login e senha.'); return }
    setLoading(true); setErro(''); setDebug('')
    try {
      const usuarioSessao = await fazerLogin(login, senha)
      onLogin(usuarioSessao)
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
          <div style={{ marginBottom: 10 }}>
            <svg viewBox="0 0 100 100" width="72" height="72" xmlns="http://www.w3.org/2000/svg">
              <line className="vgp-e vgp-d0" x1="50" y1="7"  x2="87" y2="28"/>
              <line className="vgp-e vgp-d1" x1="87" y1="28" x2="87" y2="72"/>
              <line className="vgp-e vgp-d2" x1="87" y1="72" x2="50" y2="93"/>
              <line className="vgp-e vgp-d3" x1="50" y1="93" x2="13" y2="72"/>
              <line className="vgp-e vgp-d4" x1="13" y1="72" x2="13" y2="28"/>
              <line className="vgp-e vgp-d5" x1="13" y1="28" x2="50" y2="7"/>
              <line className="vgp-sp vgp-d0" x1="50" y1="50" x2="50" y2="7"/>
              <line className="vgp-sp vgp-d1" x1="50" y1="50" x2="87" y2="28"/>
              <line className="vgp-sp vgp-d2" x1="50" y1="50" x2="87" y2="72"/>
              <line className="vgp-sp vgp-d3" x1="50" y1="50" x2="50" y2="93"/>
              <line className="vgp-sp vgp-d4" x1="50" y1="50" x2="13" y2="72"/>
              <line className="vgp-sp vgp-d5" x1="50" y1="50" x2="13" y2="28"/>
              <circle className="vgp-hl" cx="50" cy="50" r="17"/>
              <circle cx="50" cy="50" r="7.5" fill="#fbbf24"/>
              <circle className="vgp-nd vgp-d0" cx="50" cy="7"  r="5.5" fill="#fff"/>
              <circle className="vgp-nd vgp-d1" cx="87" cy="28" r="5.5" fill="#fff"/>
              <circle className="vgp-nd vgp-d2" cx="87" cy="72" r="5.5" fill="#fff"/>
              <circle className="vgp-nd vgp-d3" cx="50" cy="93" r="5.5" fill="#fff"/>
              <circle className="vgp-nd vgp-d4" cx="13" cy="72" r="5.5" fill="#fff"/>
              <circle className="vgp-nd vgp-d5" cx="13" cy="28" r="5.5" fill="#fff"/>
            </svg>
          </div>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
            Vértice<span className="vgp-gp">GP</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
            Plataforma de Gestão Operacional
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
              <div style={{ position: 'relative' }}>
                <input className="form-input" type={mostrarSenha ? 'text' : 'password'} placeholder="••••••••"
                  value={senha} onChange={e => setSenha(e.target.value)}
                  style={{ paddingRight: 44 }} />
                <button type="button" onClick={() => setMostrarSenha(v => !v)}
                  aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  style={{
                    position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                    width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0,
                  }}>
                  {mostrarSenha ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 3l18 18" />
                      <path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-3.4 4.2M6.6 6.6C3.6 8.5 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.4-1" />
                      <path d="M9.5 9.7A3 3 0 0 0 12 15a3 3 0 0 0 2.3-1.06" />
                    </svg>
                  )}
                </button>
              </div>
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
          VérticeGP · v{VERSAO} · © 2026 Todos os direitos reservados
        </p>
      </div>
    </div>
  )
}
