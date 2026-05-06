import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase.js'

function calcMesAtual() {
  const hoje = new Date()
  const ini  = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0]
  const fim  = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0]
  return { ini, fim }
}

const STATUS_COR = {
  'ATENDE':         { bg: '#dcfce7', color: '#15803d', border: '#86efac' },
  'ATENDE PARCIAL': { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  'NÃO ATENDE':     { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
}

export default function FeedbacksPDF({ usuarioLogado, onVoltar }) {
  const [filtros,    setFiltros]    = useState({
    dataIni:   calcMesAtual().ini,
    dataFim:   calcMesAtual().fim,
    agruparPor: 'equipe', // 'equipe' | 'fiscal'
  })
  const [auditorias, setAuditorias] = useState([])
  const [loading,    setLoading]    = useState(false)
  const [gerado,     setGerado]     = useState(false)
  const printRef = useRef(null)

  const upd = (k, v) => setFiltros(f => ({ ...f, [k]: v }))

  const buscar = async () => {
    setLoading(true)
    setGerado(false)
    try {
      const { data, error } = await supabase
        .from('auditorias')
        .select('*')
        .gte('data_auditoria', filtros.dataIni)
        .lte('data_auditoria', filtros.dataFim)
        .not('feedback', 'is', null)
        .neq('feedback', '')
        .order('prefixo')
        .order('data_auditoria')

      if (error) throw error
      setAuditorias(data || [])
      setGerado(true)
    } catch (e) {
      console.error(e)
      alert('Erro ao buscar feedbacks: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const imprimirPDF = () => window.print()

  const formatData = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
  const formatPeriodo = () =>
    `${formatData(filtros.dataIni)} a ${formatData(filtros.dataFim)}`

  // Agrupa por equipe ou fiscal
  const grupos = (() => {
    if (!auditorias.length) return []
    const chave = filtros.agruparPor === 'equipe' ? 'prefixo' : 'fiscal'
    const mapa = {}
    auditorias.forEach(a => {
      const k = a[chave] || '—'
      if (!mapa[k]) mapa[k] = []
      mapa[k].push(a)
    })
    return Object.entries(mapa).sort(([a], [b]) => a.localeCompare(b))
  })()

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>

      {/* PRINT STYLE */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-area { padding: 0 !important; background: white !important; }
          body { background: white !important; }
          .page-break { page-break-before: always; }
        }
      `}</style>

      {/* Header */}
      <div className="no-print" style={{
        background: 'linear-gradient(135deg, #1e3a5f, #2563eb)',
        padding: '18px 20px', color: '#fff',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14,
          }}>← Voltar para Home</button>
          <h1 style={{ fontSize: 20, fontWeight: 800 }}>💬 Relatório de Feedbacks</h1>
          <p style={{ fontSize: 12, opacity: 0.8, marginTop: 3 }}>
            Feedbacks aplicados às equipes no período
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="no-print" style={{ maxWidth: 900, margin: '0 auto', padding: '16px 16px 0' }}>
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px', marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
            Filtros
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Data início</label>
              <input type="date" value={filtros.dataIni} onChange={e => upd('dataIni', e.target.value)}
                className="form-input" style={{ fontSize: 13, padding: '8px 10px' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Data fim</label>
              <input type="date" value={filtros.dataFim} onChange={e => upd('dataFim', e.target.value)}
                className="form-input" style={{ fontSize: 13, padding: '8px 10px' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Agrupar por</label>
              <select value={filtros.agruparPor} onChange={e => upd('agruparPor', e.target.value)}
                className="form-input" style={{ fontSize: 13, padding: '8px 10px' }}>
                <option value="equipe">Equipe (Prefixo)</option>
                <option value="fiscal">Fiscal</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={buscar} disabled={loading} style={{
              padding: '10px 24px', background: loading ? '#64748b' : '#1e3a5f', color: '#fff',
              border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>
              {loading ? '⏳ Buscando...' : '🔍 Gerar Relatório'}
            </button>
            {gerado && auditorias.length > 0 && (
              <button onClick={imprimirPDF} style={{
                padding: '10px 24px', background: '#7c3aed', color: '#fff',
                border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>
                🖨️ Imprimir / Salvar PDF ({auditorias.length} feedbacks)
              </button>
            )}
          </div>

          {gerado && auditorias.length === 0 && (
            <div style={{ marginTop: 14, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#15803d', fontWeight: 600 }}>
              ✅ Nenhum feedback encontrado no período selecionado.
            </div>
          )}
        </div>
      </div>

      {/* ÁREA DE IMPRESSÃO */}
      {gerado && auditorias.length > 0 && (
        <div ref={printRef} className="print-area" style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px 60px' }}>

          {/* Cabeçalho do relatório — aparece no PDF */}
          <div style={{
            background: '#1e3a5f', color: '#fff', borderRadius: 12,
            padding: '20px 24px', marginBottom: 24,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>
                  💬 Relatório de Feedbacks — DPL Construções
                </h2>
                <p style={{ fontSize: 12, opacity: 0.8 }}>Contrato Equatorial Energia 1021/2024</p>
                <p style={{ fontSize: 13, marginTop: 8, fontWeight: 600 }}>
                  Período: {formatPeriodo()}
                </p>
                <p style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                  Agrupado por: {filtros.agruparPor === 'equipe' ? 'Equipe (Prefixo)' : 'Fiscal'}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 32, fontWeight: 900 }}>{auditorias.length}</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>feedbacks no período</div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                  {grupos.length} {filtros.agruparPor === 'equipe' ? 'equipe(s)' : 'fiscal(is)'}
                </div>
              </div>
            </div>
          </div>

          {/* Grupos */}
          {grupos.map(([grupo, items], gi) => (
            <div key={grupo} style={{ marginBottom: 28 }} className={gi > 0 && gi % 3 === 0 ? 'page-break' : ''}>

              {/* Cabeçalho do grupo */}
              <div style={{
                background: '#1e3a5f', color: '#fff',
                borderRadius: '10px 10px 0 0', padding: '12px 18px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 800 }}>
                    {filtros.agruparPor === 'equipe' ? '🚗 ' : '👤 '}
                    {grupo}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                  <span style={{ background: 'rgba(255,255,255,0.15)', padding: '3px 10px', borderRadius: 20 }}>
                    {items.length} feedback{items.length > 1 ? 's' : ''}
                  </span>
                  <span style={{ background: 'rgba(255,255,255,0.15)', padding: '3px 10px', borderRadius: 20 }}>
                    Média: {(items.reduce((a, i) => a + Number(i.nota), 0) / items.length).toFixed(1)} pts
                  </span>
                </div>
              </div>

              {/* Itens do grupo */}
              <div style={{ border: '1.5px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
                {items.map((a, idx) => {
                  const sc = STATUS_COR[a.status] || { bg: '#f1f5f9', color: '#374151', border: '#e2e8f0' }
                  return (
                    <div key={a.id} style={{
                      background: idx % 2 === 0 ? '#fff' : '#f8fafc',
                      borderBottom: idx < items.length - 1 ? '1px solid #f1f5f9' : 'none',
                      padding: '14px 18px',
                    }}>
                      {/* Linha 1: info da auditoria */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                            {filtros.agruparPor === 'equipe' ? a.fiscal : a.prefixo}
                          </span>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px',
                            borderRadius: 20, background: sc.bg, color: sc.color,
                            border: `1px solid ${sc.border}`,
                          }}>
                            {a.status}
                          </span>
                          <span style={{ fontSize: 11, color: '#64748b' }}>
                            {a.tipo_servico} · {a.produtivo ? 'Produtivo' : 'Improdutivo'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#64748b', flexShrink: 0 }}>
                          <span>📅 {formatData(a.data_auditoria)}</span>
                          <span>OS: {a.os}</span>
                          <span style={{
                            fontSize: 13, fontWeight: 800,
                            color: sc.color, background: sc.bg,
                            padding: '1px 8px', borderRadius: 6,
                          }}>
                            {Number(a.nota).toFixed(0)} pts
                          </span>
                        </div>
                      </div>

                      {/* Feedback */}
                      <div style={{
                        background: '#fffbeb', border: '1px solid #fcd34d',
                        borderRadius: 8, padding: '10px 14px',
                        marginBottom: a.observacoes ? 8 : 0,
                      }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: '#92400e', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Feedback do Fiscal:
                        </p>
                        <p style={{ fontSize: 13, color: '#78350f', lineHeight: 1.6, margin: 0 }}>
                          {a.feedback}
                        </p>
                      </div>

                      {/* Observações (se houver) */}
                      {a.observacoes && (
                        <div style={{
                          background: '#f0f9ff', border: '1px solid #bae6fd',
                          borderRadius: 8, padding: '10px 14px', marginTop: 8,
                        }}>
                          <p style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Observações:
                          </p>
                          <p style={{ fontSize: 13, color: '#0c4a6e', lineHeight: 1.6, margin: 0 }}>
                            {a.observacoes}
                          </p>
                        </div>
                      )}

                      {/* Eletricistas */}
                      {(a.nome_eletricista || a.nome_eletricista2) && (
                        <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
                          {a.nome_eletricista && <span>👷 {a.nome_eletricista}</span>}
                          {a.nome_eletricista2 && <span style={{ marginLeft: 12 }}>👷 {a.nome_eletricista2}</span>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Rodapé do relatório */}
          <div style={{
            borderTop: '2px solid #e2e8f0', paddingTop: 16, marginTop: 8,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: 11, color: '#94a3b8', flexWrap: 'wrap', gap: 8,
          }}>
            <span>DPL Construções — Contrato Equatorial Energia 1021/2024</span>
            <span>Gerado em {new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })}</span>
          </div>
        </div>
      )}
    </div>
  )
}
