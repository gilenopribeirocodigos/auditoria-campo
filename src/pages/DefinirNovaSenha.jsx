import { useState } from 'react'
import { definirNovaSenhaObrigatoria, atualizarPrecisaTrocarSenhaNaSessao, getVersaoApp } from '../lib/auth.js'

const VERSAO = getVersaoApp()

// Tela obrigatória exibida logo após o login quando o usuário está com
// precisa_trocar_senha=true (senha padrão inicial, ou resetada por um
// admin em Gestão de Usuários) — bloqueia o acesso ao Home até a pessoa
// definir uma senha só dela. Não tem "Voltar"/"Cancelar" de propósito.
export default function DefinirNovaSenha({ usuario, onSenhaDefinida, onSair }) {
  const [novaSenha,      setNovaSenha]      = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [erro,    setErro]    = useState('')
  const [loading, setLoading] = useState(false)

  const salvar = async e => {
    e.preventDefault()
    setErro('')
    if (novaSenha.length < 6) { setErro('A nova senha precisa ter pelo menos 6 caracteres.'); return }
    if (novaSenha !== confirmarSenha) { setErro('As senhas não conferem.'); return }
    setLoading(true)
    try {
      await definirNovaSenhaObrigatoria(usuario.id, novaSenha)
      const sessaoAtualizada = atualizarPrecisaTrocarSenhaNaSessao()
      onSenhaDefinida(sessaoAtualizada || { ...usuario, precisa_trocar_senha: false })
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
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ marginBottom: 10 }}>
            <svg viewBox="0 0 100 100" width="60" height="60" xmlns="http://www.w3.org/2000/svg">
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
          <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
            Vértice<span className="vgp-gp">GP</span>
          </h1>
        </div>

        <div style={{
          background: '#fff', borderRadius: 20, padding: '30px 26px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 10, textAlign: 'center' }}>
            🔒 Defina sua nova senha
          </h2>

          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '12px 14px', marginBottom: 20 }}>
            <p style={{ fontSize: 12.5, color: '#0369a1', lineHeight: 1.5, margin: 0 }}>
              Sua senha ainda é a padrão inicial (ou foi redefinida por um administrador).
              Por segurança, crie uma senha nova e só sua antes de continuar.
            </p>
          </div>

          <form onSubmit={salvar}>
            <div className="form-group">
              <label className="form-label">Nova senha</label>
              <input className="form-input" type="password" placeholder="••••••••"
                value={novaSenha} onChange={e => setNovaSenha(e.target.value)} autoFocus />
              <p style={{ fontSize: 11, color: '#94a3b8', margin: '5px 0 0' }}>Mínimo de 6 caracteres.</p>
            </div>
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="form-label">Confirmar nova senha</label>
              <input className="form-input" type="password" placeholder="••••••••"
                value={confirmarSenha} onChange={e => setConfirmarSenha(e.target.value)} />
            </div>

            {erro && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                padding: '10px 14px', fontSize: 13, color: '#b91c1c', marginBottom: 16,
              }}>
                ❌ {erro}
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={loading}
              style={{ background: loading ? '#64748b' : '#2563eb', fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
              {loading ? '⏳ Salvando...' : '🔒 Definir Senha e Entrar'}
            </button>
            <button type="button" onClick={onSair} style={{
              display: 'block', width: '100%', background: 'none', border: 'none',
              color: '#94a3b8', fontSize: 12, textAlign: 'center', cursor: 'pointer', padding: '4px 0',
            }}>
              Sair e entrar com outro usuário
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
