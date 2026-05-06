import { useState, useEffect, useRef } from 'react'
import { listarPautas, criarPauta, atualizarPauta, deletarPauta } from '../lib/pautas.js'
import { supabase } from '../lib/supabase.js'

const TIPOS_SERVICO     = ['CORTE', 'ANEXO', 'RELIGA']
const RECORRENCIAS      = ['UNICA', 'DIARIA', 'SEMANAL']
const RECORRENCIA_LABEL = { UNICA: 'Única', DIARIA: 'Diária', SEMANAL: 'Semanal' }

const FORM_VAZIO = {
  prefixo: '', fiscal_login: '', data_prevista: new Date().toISOString().split('T')[0],
  tipo_servico: 'CORTE', tipo_auditoria: 'DESEMPENHO',
  recorrencia: 'UNICA', observacao: '',
}

function statusCor(s) {
  return {
    PENDENTE:  { bg: '#fef3c7', color: '#92400e', label: '⏳ Pendente'  },
    CONCLUIDA: { bg: '#dcfce7', color: '#15803d', label: '✅ Concluída' },
    CANCELADA: { bg: '#fee2e2', color: '#dc2626', label: '❌ Cancelada' },
    VENCIDA:   { bg: '#fce7f3', color: '#9d174d', label: '🚨 Vencida'  },
  }[s] || { bg: '#f1f5f9', color: '#374151', label: s }
}

function calcStatus(p) {
  if (p.status !== 'PENDENTE') return p.status
  const hoje = new Date().toISOString().split('T')[0]
  if (p.data_prevista < hoje) return 'VENCIDA'
  return 'PENDENTE'
}

export default function GestaoPauta({ usuarioLogado, onVoltar }) {
  const [pautas,      setPautas]      = useState([])
  const [fiscais,     setFiscais]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [modal,       setModal]       = useState(false)
  const [editando,    setEditando]    = useState(null)
  const [formData,    setFormData]    = useState(FORM_VAZIO)
  const [salvando,    setSalvando]    = useState(false)
  const [erro,        setErro]        = useState('')
  const [filtro,      setFiltro]      = useState('TODOS')
  const [csvModal,    setCsvModal]    = useState(false)
  const [csvTexto,    setCsvTexto]    = useState('')
  const [csvStatus,   setCsvStatus]   = useState('')
  const [prefixoSugs, setPrefixoSugs] = useState([])
  const prefixoRef = useRef(null)

  const carregar = async () => {
    setLoading(true)
    try {
      const todas = await listarPautas()
      setPautas(todas)
      const { data } = await supabase
        .from('usuarios').select('nome, login')
        .eq('status', 'ATIVO').order('nome')
      setFiscais(data || [])
    } catch (e) { setErro(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { carregar() }, [])

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handler = e => {
      if (prefixoRef.current && !prefixoRef.current.contains(e.target)) setPrefixoSugs([])
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const upd         = (k, v) => setFormData(f => ({ ...f, [k]: v }))
  const abrirNovo   = () => { setEditando(null); setFormData(FORM_VAZIO); setErro(''); setPrefixoSugs([]); setModal(true) }
  const abrirEditar = p  => { setEditando(p); setFormData({ ...p }); setErro(''); setPrefixoSugs([]); setModal(true) }
  const fechar      = () => { setModal(false); setErro(''); setPrefixoSugs([]) }

  // Autocomplete prefixo
  const onPrefixoChange = async v => {
    upd('prefixo', v)
    if (v.length < 2) { setPrefixoSugs([]); return }
    const { data } = await supabase
      .from('estrutura_equipes')
      .select('prefixo')
      .ilike('prefixo', `%${v}%`)
      .order('prefixo')
      .limit(10)
    if (data) setPrefixoSugs([...new Set(data.map(r => r.prefixo))])
  }

  const salvar = async () => {
    if (!formData.prefixo || !formData.fiscal_login || !formData.data_prevista) {
      setErro('Prefixo, fiscal e data são obrigatórios.'); return
    }
    setSalvando(true); setErro('')
    try {
      if (editando) await atualizarPauta(editando.id, formData)
      else          await criarPauta({ ...formData, status: 'PENDENTE' })
      await carregar(); fechar()
    } catch (e) { setErro(e.message) }
    finally { setSalvando(false) }
  }

  const cancelar = async p => {
    if (!window.confirm(`Cancelar pauta ${p.prefixo}?`)) return
    try { await atualizarPauta(p.id, { status: 'CANCELADA' }); await carregar() }
    catch (e) { alert(e.message) }
  }

  const excluir = async p => {
    if (!window.confirm(`Excluir pauta ${p.prefixo}?`)) return
    try { await deletarPauta(p.id); await carregar() }
    catch (e) { alert(e.message) }
  }

  const whatsappVencidas = () => {
    const vencidas = pautas.filter(p => calcStatus(p) === 'VENCIDA')
    if (vencidas.length === 0) { alert('Não há pautas vencidas!'); return }
    const linhas = vencidas.map(p =>
      `▪️ ${p.prefixo} | Fiscal: ${p.fiscal_login} | Data: ${p.data_prevista}`
    ).join('\n')
    const msg = encodeURIComponent(
      `🚨 *PAUTAS DE FISCALIZAÇÃO VENCIDAS — DPL CONSTRUÇÕES*\n\n${linhas}\n\nFavor regularizar!`
    )
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  const importarCsv = async () => {
    setCsvStatus('importando')
    try {
      const linhas = csvTexto.trim().split('\n').filter(l => l.trim())
      const [header, ...rows] = linhas
      const cols = header.split(';').map(c => c.trim().toLowerCase())
      const pautasNovas = rows.map(row => {
        const vals = row.split(';')
        const obj  = cols.reduce((a, c, i) => ({ ...a, [c]: (vals[i] || '').trim() }), {})
        return {
          prefixo:        obj.prefixo        || '',
          fiscal_login:   obj.fiscal_login   || '',
          data_prevista:  obj.data_prevista  || new Date().toISOString().split('T')[0],
          tipo_servico:   obj.tipo_servico   || 'CORTE',
          tipo_auditoria: obj.tipo_auditoria || 'DESEMPENHO',
          recorrencia:    obj.recorrencia    || 'UNICA',
          observacao:     obj.observacao     || '',
          status: 'PENDENTE',
        }
      }).filter(p => p.prefixo && p.fiscal_login)

      for (const p of pautasNovas) await criarPauta(p)
      setCsvStatus(`✅ ${pautasNovas.length} pautas importadas!`)
      await carregar()
      setTimeout(() => { setCsvModal(false); setCsvTexto(''); setCsvStatus('') }, 1500)
    } catch (e) {
      setCsvStatus('❌ Erro: ' + e.message)
    }
  }

  const pautasFiltradas = pautas.filter(p => {
    const s = calcStatus(p)
    if (filtro === 'TODOS')   return true
    if (filtro === 'VENCIDA') return s === 'VENCIDA'
    return p.status === filtro
  })

  const counts = {
    PENDENTE:  pautas.filter(p => p.status === 'PENDENTE' && calcStatus(p) === 'PENDENTE').length,
    VENCIDA:   pautas.filter(p => calcStatus(p) === 'VENCIDA').length,
    CONCLUIDA: pautas.filter(p => p.status === 'CONCLUIDA').length,
    CANCELADA: pautas.filter(p => p.status === 'CANCELADA').length,
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #b45309, #d97706)', padding: '18px 20px', color: '#fff' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14,
          }}>← Voltar para Home</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800 }}>📋 Pauta de Fiscalização</h1>
              <p style={{ fontSize: 12, opacity: 0.8, marginTop: 3 }}>Equipes obrigatórias para fiscalização</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {['PENDENTE','VENCIDA','CONCLUIDA'].map(s => (
                <div key={s} style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '6px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{counts[s]}</div>
                  <div style={{ fontSize: 9, opacity: 0.8 }}>{s}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '16px 16px 80px' }}>

        {/* Ações */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={abrirNovo} style={{
            background: '#d97706', color: '#fff', border: 'none',
            padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>+ Nova Pauta</button>
          <button onClick={() => setCsvModal(true)} style={{
            background: '#0f766e', color: '#fff', border: 'none',
            padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>📥 Importar CSV</button>
          {counts.VENCIDA > 0 && (
            <button onClick={whatsappVencidas} style={{
              background: '#25d366', color: '#fff', border: 'none',
              padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>📲 WhatsApp Vencidas ({counts.VENCIDA})</button>
          )}
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {['TODOS','PENDENTE','VENCIDA','CONCLUIDA','CANCELADA'].map(f => (
            <button key={f} onClick={() => setFiltro(f)} style={{
              padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
              background: filtro === f ? '#d97706' : '#e2e8f0',
              color: filtro === f ? '#fff' : '#374151',
            }}>{f}</button>
          ))}
        </div>

        {/* Lista */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Carregando...</div>
        ) : pautasFiltradas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
            <p>Nenhuma pauta encontrada</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pautasFiltradas.map(p => {
              const s  = calcStatus(p)
              const sc = statusCor(s)
              return (
                <div key={p.id} style={{
                  background: '#fff', borderRadius: 14,
                  border: `1.5px solid ${s === 'VENCIDA' ? '#fca5a5' : s === 'CONCLUIDA' ? '#86efac' : '#e2e8f0'}`,
                  padding: '14px 16px', opacity: p.status === 'CANCELADA' ? 0.6 : 1,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>{p.prefixo}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.color }}>
                          {sc.label}
                        </span>
                        <span style={{ fontSize: 10, background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 20 }}>
                          🔁 {RECORRENCIA_LABEL[p.recorrencia]}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
                        <span>👤 {p.fiscal_login}</span>
                        <span style={{ margin: '0 8px' }}>·</span>
                        <span>📅 {p.data_prevista}</span>
                        <span style={{ margin: '0 8px' }}>·</span>
                        <span>🔧 {p.tipo_servico} — {p.tipo_auditoria === 'DESEMPENHO' ? 'Desempenho' : 'Pós Serviço'}</span>
                      </div>
                      {p.observacao && <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>💬 {p.observacao}</p>}
                    </div>
                    {p.status === 'PENDENTE' && (
                      <div style={{ display: 'flex', gap: 6, marginLeft: 10 }}>
                        <button onClick={() => abrirEditar(p)} style={{
                          width: 32, height: 32, borderRadius: 8, border: 'none',
                          background: '#fef3c7', color: '#92400e', cursor: 'pointer', fontSize: 14,
                        }}>✏️</button>
                        <button onClick={() => cancelar(p)} style={{
                          width: 32, height: 32, borderRadius: 8, border: 'none',
                          background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: 14,
                        }}>✕</button>
                      </div>
                    )}
                    {(p.status === 'CONCLUIDA' || p.status === 'CANCELADA') && (
                      <button onClick={() => excluir(p)} style={{
                        width: 32, height: 32, borderRadius: 8, border: 'none', marginLeft: 10,
                        background: '#f1f5f9', color: '#7c3aed', cursor: 'pointer', fontSize: 14,
                      }}>🗑️</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal manual */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700 }}>{editando ? '✏️ Editar Pauta' : '+ Nova Pauta'}</h3>
              <button onClick={fechar} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#64748b' }}>×</button>
            </div>

            {/* PREFIXO COM AUTOCOMPLETE */}
            <div className="form-group" style={{ position: 'relative' }} ref={prefixoRef}>
              <label className="form-label">Prefixo da Equipe *</label>
              <input
                className="form-input"
                value={formData.prefixo}
                onChange={e => onPrefixoChange(e.target.value)}
                placeholder="Digite para buscar (ex: PI-THE)"
              />
              {prefixoSugs.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                  background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto',
                }}>
                  {prefixoSugs.map((s, i) => (
                    <button key={i} onClick={() => { upd('prefixo', s); setPrefixoSugs([]) }} style={{
                      display: 'block', width: '100%', padding: '11px 14px', textAlign: 'left',
                      background: 'none', border: 'none',
                      borderBottom: i < prefixoSugs.length - 1 ? '1px solid #f1f5f9' : 'none',
                      fontSize: 13, color: '#1e293b', cursor: 'pointer',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Fiscal Responsável *</label>
              <select className="form-input" value={formData.fiscal_login} onChange={e => upd('fiscal_login', e.target.value)}>
                <option value="">Selecione o fiscal...</option>
                {fiscais.map(f => <option key={f.login} value={f.login}>{f.nome} ({f.login})</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Data Prevista *</label>
              <input className="form-input" type="date" value={formData.data_prevista} onChange={e => upd('data_prevista', e.target.value)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">Tipo de Serviço</label>
                <select className="form-input" value={formData.tipo_servico} onChange={e => upd('tipo_servico', e.target.value)}>
                  {TIPOS_SERVICO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Tipo de Auditoria</label>
                <select className="form-input" value={formData.tipo_auditoria} onChange={e => upd('tipo_auditoria', e.target.value)}>
                  <option value="DESEMPENHO">Desempenho Op.</option>
                  <option value="POS_SERVICO">Pós Serviço</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Recorrência</label>
              <select className="form-input" value={formData.recorrencia} onChange={e => upd('recorrencia', e.target.value)}>
                {RECORRENCIAS.map(r => <option key={r} value={r}>{RECORRENCIA_LABEL[r]}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Observação</label>
              <input className="form-input" value={formData.observacao} onChange={e => upd('observacao', e.target.value)} placeholder="Opcional..." />
            </div>

            {erro && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b91c1c', marginBottom: 14 }}>
                ❌ {erro}
              </div>
            )}

            <button className="btn-primary" onClick={salvar} disabled={salvando}
              style={{ background: salvando ? '#64748b' : '#d97706' }}>
              {salvando ? '⏳ Salvando...' : '💾 Salvar Pauta'}
            </button>
          </div>
        </div>
      )}

      {/* Modal CSV */}
      {csvModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700 }}>📥 Importar Pautas via CSV</h3>
              <button onClick={() => { setCsvModal(false); setCsvTexto(''); setCsvStatus('') }}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#64748b' }}>×</button>
            </div>

            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#15803d' }}>
              <strong>Formato do CSV (separado por ;):</strong><br />
              <code>prefixo;fiscal_login;data_prevista;tipo_servico;tipo_auditoria;recorrencia;observacao</code><br /><br />
              <strong>Exemplo:</strong><br />
              <code>PI-THE-C001M;gileno.ribeiro;2026-05-10;CORTE;DESEMPENHO;SEMANAL;Prioridade alta</code>
            </div>

            <div className="form-group">
              <label className="form-label">Cole o conteúdo CSV abaixo:</label>
              <textarea
                className="form-textarea"
                value={csvTexto}
                onChange={e => setCsvTexto(e.target.value)}
                placeholder={`prefixo;fiscal_login;data_prevista;tipo_servico;tipo_auditoria;recorrencia;observacao\nPI-THE-C001M;gileno.ribeiro;2026-05-10;CORTE;DESEMPENHO;UNICA;`}
                rows={8}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>

            {csvStatus && (
              <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: csvStatus.startsWith('✅') ? '#15803d' : '#b91c1c' }}>
                {csvStatus}
              </div>
            )}

            <button className="btn-primary" onClick={importarCsv}
              disabled={!csvTexto.trim() || csvStatus === 'importando'}
              style={{ background: '#0f766e' }}>
              {csvStatus === 'importando' ? '⏳ Importando...' : '📥 Importar Pautas'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
