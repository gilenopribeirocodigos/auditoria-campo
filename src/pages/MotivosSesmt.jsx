import { useEffect, useState } from 'react'
import { CarregandoHexagono, SearchSelect } from '../components/Shared.jsx'
import { TIPOS_ACAO_SESMT } from '../data/sesmt_config.js'
import { listarTodosMotivosSesmt, criarMotivoSesmt, atualizarMotivoSesmt, removerMotivoSesmt } from '../lib/sesmt.js'

const OPCOES_TIPO = Object.entries(TIPOS_ACAO_SESMT).map(([, tipo]) => `${tipo.emoji} ${tipo.label}`)
const LABEL_POR_CHAVE = Object.fromEntries(Object.entries(TIPOS_ACAO_SESMT).map(([chave, tipo]) => [chave, `${tipo.emoji} ${tipo.label}`]))
const CHAVE_POR_LABEL = Object.fromEntries(Object.entries(TIPOS_ACAO_SESMT).map(([chave, tipo]) => [`${tipo.emoji} ${tipo.label}`, chave]))

export default function MotivosSesmt({ onVoltar }) {
  const [carregando, setCarregando] = useState(true)
  const [motivos, setMotivos] = useState([])
  const [erro, setErro] = useState('')
  const [novoTipoLabel, setNovoTipoLabel] = useState('')
  const [novoMotivo, setNovoMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [editTipoLabel, setEditTipoLabel] = useState('')
  const [editMotivo, setEditMotivo] = useState('')

  const carregar = async () => {
    setCarregando(true)
    try {
      setMotivos(await listarTodosMotivosSesmt())
    } catch (e) {
      setErro(e.message || 'Erro ao carregar motivos.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { carregar() }, [])

  const adicionar = async () => {
    const tipoChave = CHAVE_POR_LABEL[novoTipoLabel]
    if (!tipoChave || !novoMotivo.trim()) return
    setSalvando(true)
    try {
      await criarMotivoSesmt(tipoChave, novoMotivo)
      setNovoMotivo('')
      await carregar()
    } catch (e) {
      alert('Não foi possível adicionar: ' + (e.message || e))
    } finally {
      setSalvando(false)
    }
  }

  const iniciarEdicao = (m) => {
    setEditandoId(m.id)
    setEditTipoLabel(LABEL_POR_CHAVE[m.tipo] || '')
    setEditMotivo(m.motivo)
  }
  const cancelarEdicao = () => { setEditandoId(null); setEditTipoLabel(''); setEditMotivo('') }

  const confirmarEdicao = async () => {
    const tipoChave = CHAVE_POR_LABEL[editTipoLabel]
    if (!tipoChave || !editMotivo.trim()) return
    setSalvando(true)
    try {
      await atualizarMotivoSesmt(editandoId, tipoChave, editMotivo)
      cancelarEdicao()
      await carregar()
    } catch (e) {
      alert('Não foi possível salvar: ' + (e.message || e))
    } finally {
      setSalvando(false)
    }
  }

  const remover = async (m) => {
    if (!confirm(`Remover o motivo "${m.motivo}" de ${LABEL_POR_CHAVE[m.tipo] || m.tipo}?`)) return
    try {
      await removerMotivoSesmt(m.id)
      await carregar()
    } catch (e) {
      alert('Não foi possível remover: ' + (e.message || e))
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header no-print">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: 1.5, textTransform: 'uppercase' }}>Ações SESMT</div>
          <button onClick={onVoltar} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>← Voltar</button>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>⚙️ Motivos SESMT</div>
      </header>
      <main className="app-content">
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
          Cadastre os motivos disponíveis para cada tipo de ação SESMT. Ao registrar, o fiscal escolhe
          um motivo dentro da lista do tipo selecionado. Remover um motivo daqui não altera ações já registradas com esse texto.
        </p>

        {carregando ? (
          <CarregandoHexagono texto="Carregando..." />
        ) : erro ? (
          <p style={{ color: '#dc2626', fontWeight: 700 }}>⚠️ {erro}</p>
        ) : (
          <>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>Novo Motivo</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                <div>
                  <label className="form-label">Tipo de Ação *</label>
                  <SearchSelect
                    opcoes={OPCOES_TIPO} valor={novoTipoLabel}
                    onSelecionar={setNovoTipoLabel}
                    placeholder="Buscar e escolher o tipo de ação..."
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="form-input" value={novoMotivo}
                    onChange={e => setNovoMotivo(e.target.value.toUpperCase())}
                    placeholder="Ex.: USO DE EPI/EPC" style={{ flex: 1 }}
                    onKeyDown={e => { if (e.key === 'Enter') adicionar() }}
                  />
                  <button onClick={adicionar} disabled={salvando || !novoTipoLabel || !novoMotivo.trim()} style={{
                    padding: '0 16px', borderRadius: 10, border: 'none',
                    background: (novoTipoLabel && novoMotivo.trim()) ? '#1e3a5f' : '#e2e8f0',
                    color: (novoTipoLabel && novoMotivo.trim()) ? '#fff' : '#94a3b8',
                    fontWeight: 700, cursor: (novoTipoLabel && novoMotivo.trim()) ? 'pointer' : 'not-allowed',
                  }}>＋</button>
                </div>
              </div>
            </div>

            {motivos.length === 0 ? (
              <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: 20 }}>Nenhum motivo cadastrado ainda.</p>
            ) : (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Tipo de Ação</th>
                      <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Motivo</th>
                      <th style={{ width: 76 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {motivos.map((m, i) => {
                      const editando = editandoId === m.id
                      return (
                        <tr key={m.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc', borderTop: '1px solid #f1f5f9' }}>
                          <td style={{ padding: editando ? '6px 8px' : '8px 12px', fontSize: 12.5, color: '#1e293b', minWidth: 200 }}>
                            {editando ? (
                              <SearchSelect opcoes={OPCOES_TIPO} valor={editTipoLabel} onSelecionar={setEditTipoLabel} placeholder="Escolha..." />
                            ) : (LABEL_POR_CHAVE[m.tipo] || m.tipo)}
                          </td>
                          <td style={{ padding: editando ? '6px 8px' : '8px 12px', fontSize: 12.5, color: '#1e293b' }}>
                            {editando ? (
                              <input
                                className="form-input" autoFocus value={editMotivo}
                                onChange={e => setEditMotivo(e.target.value.toUpperCase())}
                                onKeyDown={e => { if (e.key === 'Enter') confirmarEdicao(); if (e.key === 'Escape') cancelarEdicao() }}
                                style={{ padding: '6px 8px', fontSize: 12.5 }}
                              />
                            ) : m.motivo}
                          </td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {editando ? (
                              <>
                                <button onClick={confirmarEdicao} disabled={salvando || !editMotivo.trim()} style={{
                                  width: 24, height: 24, borderRadius: '50%', border: 'none', background: '#dcfce7',
                                  color: '#15803d', fontSize: 12, fontWeight: 700, cursor: 'pointer', lineHeight: '24px', padding: 0, marginRight: 4,
                                }}>✓</button>
                                <button onClick={cancelarEdicao} disabled={salvando} style={{
                                  width: 24, height: 24, borderRadius: '50%', border: 'none', background: '#f1f5f9',
                                  color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer', lineHeight: '24px', padding: 0,
                                }}>✕</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => iniciarEdicao(m)} style={{
                                  width: 24, height: 24, borderRadius: '50%', border: 'none', background: '#eff6ff',
                                  color: '#1d4ed8', fontSize: 11, fontWeight: 700, cursor: 'pointer', lineHeight: '24px', padding: 0, marginRight: 4,
                                }}>✎</button>
                                <button onClick={() => remover(m)} style={{
                                  width: 24, height: 24, borderRadius: '50%', border: 'none', background: '#fef2f2',
                                  color: '#dc2626', fontSize: 12, fontWeight: 700, cursor: 'pointer', lineHeight: '24px', padding: 0,
                                }}>✕</button>
                              </>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
