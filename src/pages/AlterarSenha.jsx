import { useState } from 'react'
import { alterarPropriaSenha } from '../lib/auth.js'

// Self-service — acessível a qualquer momento pelo atalho "🔑 Alterar Senha"
// no Home, ao lado do "Sair". Diferente da troca obrigatória
// (DefinirNovaSenha.jsx), pede a senha atual antes de trocar.
export default function AlterarSenha({ usuarioLogado, onVoltar }) {
  const [senhaAtual,     setSenhaAtual]     = useState('')
  const [novaSenha,      setNovaSenha]      = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [erro,    setErro]    = useState('')
  const [ok,      setOk]      = useState(false)
  const [loading, setLoading] = useState(false)

  const salvar = async e => {
    e.preventDefault()
    setErro('')
    if (!senhaAtual) { setErro('Informe a senha atual.'); return }
    if (novaSenha.length < 6) { setErro('A nova senha precisa ter pelo menos 6 caracteres.'); return }
    if (novaSenha !== confirmarSenha) { setErro('As senhas não conferem.'); return }
    setLoading(true)
    try {
      await alterarPropriaSenha(usuarioLogado.id, senhaAtual, novaSenha)
      setOk(true)
    } catch (err) {
      setErro(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>
      <div style={{ background: '#1e3a5f', padding: '18px 20px', color: '#fff' }}>
        <button onClick={onVoltar} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14 }}>
          ← Voltar
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>🔑 Alterar Senha</h1>
        <p style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Defina uma senha só sua, diferente da senha padrão inicial</p>
      </div>

      <div style={{ maxWidth: 420, margin: '0 auto', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24 }}>
          {ok ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <p style={{ fontSize: 16, fontWeight: 800, color: '#15803d', marginBottom: 8 }}>✅ Senha alterada com sucesso</p>
              <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Use a nova senha no seu próximo login.</p>
              <button onClick={onVoltar} className="btn-primary" style={{ background: '#1e3a5f' }}>Voltar para o Home</button>
            </div>
          ) : (
            <form onSubmit={salvar}>
              <div className="form-group">
                <label className="form-label">Senha atual</label>
                <input className="form-input" type="password" placeholder="••••••••"
                  value={senhaAtual} onChange={e => setSenhaAtual(e.target.value)} autoFocus />
              </div>

              <div className="form-group">
                <label className="form-label">Nova senha</label>
                <input className="form-input" type="password" placeholder="••••••••"
                  value={novaSenha} onChange={e => setNovaSenha(e.target.value)} />
                <p style={{ fontSize: 11, color: '#94a3b8', margin: '5px 0 0' }}>Mínimo de 6 caracteres.</p>
              </div>

              <div className="form-group" style={{ marginBottom: 20 }}>
                <label className="form-label">Confirmar nova senha</label>
                <input className="form-input" type="password" placeholder="••••••••"
                  value={confirmarSenha} onChange={e => setConfirmarSenha(e.target.value)} />
              </div>

              {erro && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b91c1c', marginBottom: 16 }}>
                  ❌ {erro}
                </div>
              )}

              <button type="submit" className="btn-primary" disabled={loading}
                style={{ background: loading ? '#64748b' : '#2563eb', marginBottom: 10 }}>
                {loading ? '⏳ Salvando...' : '💾 Salvar Nova Senha'}
              </button>
              <button type="button" onClick={onVoltar} className="btn-secondary">Cancelar</button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
