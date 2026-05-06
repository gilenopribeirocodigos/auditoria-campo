import { useState, useEffect } from 'react'
import { listarUsuarios, criarUsuario, atualizarUsuario, deletarUsuario } from '../lib/auth.js'

const PERFIS = ['ADMIN', 'SUPERV. OPERAÇÃO', 'SUPERV. CAMPO']

const PERFIL_CORES = {
  'ADMIN':            { bg: '#fce7f3', color: '#9d174d' },
  'SUPERV. OPERAÇÃO': { bg: '#d1fae5', color: '#065f46' },
  'SUPERV. CAMPO':    { bg: '#dbeafe', color: '#1e40af' },
}

const FORM_VAZIO = {
  nome: '', login: '', senha: '', matricula: '',
  perfil: 'SUPERV. CAMPO', base_regiao: 'Todas', status: 'ATIVO',
}

export default function GestaoUsuarios({ usuarioLogado, onVoltar }) {
  const [usuarios, setUsuarios] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState(false)
  const [editando, setEditando] = useState(null)
  const [formData, setFormData] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [erro,     setErro]     = useState('')

  const carregar = async () => {
    setLoading(true)
    try { setUsuarios(await listarUsuarios()) }
    catch (e) { setErro(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { carregar() }, [])

  const abrirNovo   = () => { setEditando(null); setFormData(FORM_VAZIO); setErro(''); setModal(true) }
  const abrirEditar = u  => { setEditando(u); setFormData({ ...u, senha: '' }); setErro(''); setModal(true) }
  const fechar      = () => { setModal(false); setErro('') }
  const upd         = (k, v) => setFormData(f => ({ ...f, [k]: v }))

  const salvar = async () => {
    if (!formData.nome || !formData.login) { setErro('Nome e login são obrigatórios.'); return }
    if (!editando && !formData.senha) { setErro('Senha obrigatória para novo usuário.'); return }
    setSalvando(true); setErro('')
    try {
      const payload = { ...formData }
      if (!payload.senha) delete payload.senha
      if (editando) await atualizarUsuario(editando.id, payload)
      else          await criarUsuario(payload)
      await carregar(); fechar()
    } catch (e) { setErro(e.message) }
    finally { setSalvando(false) }
  }

  const alternarStatus = async u => {
    // Ciclo: ATIVO → RESERVA → INATIVO → ATIVO
    const ciclo = { 'ATIVO': 'RESERVA', 'RESERVA': 'INATIVO', 'INATIVO': 'ATIVO' }
    const novoStatus = ciclo[u.status] || 'ATIVO'
    try { await atualizarUsuario(u.id, { status: novoStatus }); await carregar() }
    catch (e) { alert(e.message) }
  }

  const excluir = async u => {
    if (u.id === usuarioLogado.id) { alert('Você não pode excluir seu próprio usuário.'); return }
    if (!window.confirm(`Excluir ${u.nome}?`)) return
    try { await deletarUsuario(u.id); await carregar() }
    catch (e) { alert(e.message) }
  }

  const statusCor = s => ({
    'ATIVO':   { bg: '#dcfce7', color: '#15803d', label: '✅ ATIVO' },
    'RESERVA': { bg: '#fef3c7', color: '#92400e', label: '🟡 RESERVA' },
    'INATIVO': { bg: '#fee2e2', color: '#dc2626', label: '⭕ INATIVO' },
  }[s] || { bg: '#f1f5f9', color: '#374151', label: s })

  const ativos   = usuarios.filter(u => u.status === 'ATIVO').length
  const reservas = usuarios.filter(u => u.status === 'RESERVA').length

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #4c1d95, #7c3aed)', padding: '18px 20px', color: '#fff' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14,
          }}>
            ← Voltar para Home
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800 }}>👥 Gestão de Usuários</h1>
              <p style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>Administrador: {usuarioLogado.nome}</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{usuarios.length}</div>
                <div style={{ fontSize: 10, opacity: 0.8 }}>Total</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{ativos}</div>
                <div style={{ fontSize: 10, opacity: 0.8 }}>Ativos</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{reservas}</div>
                <div style={{ fontSize: 10, opacity: 0.8 }}>Reserva</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 16px' }}>
        <button onClick={abrirNovo} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#7c3aed', color: '#fff', border: 'none',
          padding: '12px 20px', borderRadius: 12, fontSize: 14, fontWeight: 700,
          cursor: 'pointer', marginBottom: 18,
        }}>
          + Novo Usuário
        </button>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Carregando...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {usuarios.map(u => {
              const pc = PERFIL_CORES[u.perfil] || { bg: '#f1f5f9', color: '#374151' }
              const sc = statusCor(u.status)
              return (
                <div key={u.id} style={{
                  background: '#fff', borderRadius: 14,
                  border: `1.5px solid ${u.status === 'ATIVO' ? '#e2e8f0' : u.status === 'RESERVA' ? '#fcd34d' : '#fecaca'}`,
                  padding: '14px 16px',
                  opacity: u.status === 'INATIVO' ? 0.6 : 1,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{u.nome}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: pc.bg, color: pc.color }}>
                          {u.perfil}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.color }}>
                          {sc.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        Login: <strong>{u.login}</strong>
                        {u.matricula && <> · Matrícula: <strong>{u.matricula}</strong></>}
                        {' '}· Base: {u.base_regiao}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginLeft: 10 }}>
                      <button onClick={() => abrirEditar(u)} style={{
                        width: 34, height: 34, borderRadius: 8, border: 'none',
                        background: '#fef3c7', color: '#92400e', cursor: 'pointer', fontSize: 15,
                      }}>✏️</button>
                      <button onClick={() => alternarStatus(u)}
                        title={`Status atual: ${u.status}. Clique para alternar`}
                        style={{
                          width: 34, height: 34, borderRadius: 8, border: 'none',
                          background: u.status === 'ATIVO' ? '#fef3c7' : u.status === 'RESERVA' ? '#fee2e2' : '#dcfce7',
                          cursor: 'pointer', fontSize: 15,
                        }}>
                        {u.status === 'ATIVO' ? '🟡' : u.status === 'RESERVA' ? '🔴' : '🟢'}
                      </button>
                      {u.id !== usuarioLogado.id && (
                        <button onClick={() => excluir(u)} style={{
                          width: 34, height: 34, borderRadius: 8, border: 'none',
                          background: '#f1f5f9', color: '#7c3aed', cursor: 'pointer', fontSize: 15,
                        }}>🗑️</button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#fff', borderRadius: '20px 20px 0 0',
            padding: '24px 20px 40px', width: '100%', maxWidth: 480,
            maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700 }}>
                {editando ? '✏️ Editar Usuário' : '+ Novo Usuário'}
              </h3>
              <button onClick={fechar} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#64748b' }}>×</button>
            </div>

            <div className="form-group">
              <label className="form-label">Nome completo *</label>
              <input className="form-input" value={formData.nome}
                onChange={e => upd('nome', e.target.value)} placeholder="Nome completo" />
            </div>

            <div className="form-group">
              <label className="form-label">Login *</label>
              <input className="form-input" value={formData.login}
                onChange={e => upd('login', e.target.value.toLowerCase())} placeholder="nome.sobrenome" />
            </div>

            <div className="form-group">
              <label className="form-label">Matrícula</label>
              <input className="form-input" value={formData.matricula || ''}
                onChange={e => upd('matricula', e.target.value)} placeholder="Ex: 12345" />
            </div>

            <div className="form-group">
              <label className="form-label">Senha {editando ? '(deixe vazio para manter)' : '*'}</label>
              <input className="form-input" type="password" value={formData.senha}
                onChange={e => upd('senha', e.target.value)} placeholder="••••••••" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">Perfil</label>
                <select className="form-input" value={formData.perfil} onChange={e => upd('perfil', e.target.value)}>
                  {PERFIS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-input" value={formData.status} onChange={e => upd('status', e.target.value)}>
                  <option value="ATIVO">ATIVO</option>
                  <option value="RESERVA">RESERVA</option>
                  <option value="INATIVO">INATIVO</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Base / Região</label>
              <input className="form-input" value={formData.base_regiao}
                onChange={e => upd('base_regiao', e.target.value)} placeholder="Ex: Teresina, Todas..." />
            </div>

            {erro && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b91c1c', marginBottom: 14 }}>
                ❌ {erro}
              </div>
            )}

            <button className="btn-primary" onClick={salvar} disabled={salvando}
              style={{ background: salvando ? '#64748b' : '#7c3aed' }}>
              {salvando ? '⏳ Salvando...' : '💾 Salvar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
