import { useState, useRef, useEffect } from 'react'
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

function tendencia(auditorias) {
  if (auditorias.length < 2) return null
  const metade = Math.floor(auditorias.length / 2)
  const mediaAnt = auditorias.slice(0, metade).reduce((a, b) => a + Number(b.nota), 0) / metade
  const mediaRec = auditorias.slice(metade).reduce((a, b) => a + Number(b.nota), 0) / (auditorias.length - metade)
  const diff = mediaRec - mediaAnt
  if (diff > 5)  return { label: '📈 Melhorando',  color: '#15803d', bg: '#dcfce7' }
  if (diff < -5) return { label: '📉 Piorando',    color: '#dc2626', bg: '#fee2e2' }
  return             { label: '➡️ Estável',        color: '#92400e', bg: '#fef3c7' }
}

export default function RelatorioEquipe({ usuarioLogado, onVoltar }) {
  const [filtros,     setFiltros]     = useState({
    prefixo: '',
    dataIni: calcMesAtual().ini,
    dataFim: calcMesAtual().fim,
  })
  const [prefixoSugs, setPrefixoSugs] = useState([])
  const [auditorias,  setAuditorias]  = useState([])
  const [equipeInfo,  setEquipeInfo]  = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [gerado,      setGerado]      = useState(false)

  const prefixoRef = useRef(null)

  useEffect(() => {
    const handler = e => {
      if (prefixoRef.current && !prefixoRef.current.contains(e.target)) setPrefixoSugs([])
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const upd = (k, v) => setFiltros(f => ({ ...f, [k]: v }))

  const onPrefixoChange = async v => {
    upd('prefixo', v)
    if (v.length < 2) { setPrefixoSugs([]); return }
    const { data } = await supabase
      .from('estrutura_equipes').select('prefixo')
      .ilike('prefixo', `%${v}%`).order('prefixo').limit(10)
    if (data) setPrefixoSugs([...new Set(data.map(r => r.prefixo))])
  }

  const buscar = async () => {
    if (!filtros.prefixo) { alert('Selecione uma equipe (prefixo).'); return }
    setLoading(true)
    setGerado(false)
    try {
      // Auditorias da equipe no período
      const { data: auds, error } = await supabase
        .from('auditorias').select('*')
        .eq('prefixo', filtros.prefixo)
        .gte('data_auditoria', filtros.dataIni)
        .lte('data_auditoria', filtros.dataFim)
        .order('data_auditoria')
        .order('hora_auditoria')
      if (error) throw error

      // Info da equipe na tabela estrutura_equipes
      const { data: eq } = await supabase
        .from('estrutura_equipes').select('*')
        .eq('prefixo', filtros.prefixo).limit(10)

      setAuditorias(auds || [])
      setEquipeInfo(eq || [])
      setGerado(true)
    } catch (e) {
      alert('Erro ao buscar: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const formatData = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
  const formatPeriodo = () => `${formatData(filtros.dataIni)} a ${formatData(filtros.dataFim)}`

  // Métricas consolidadas
  const totalAuds    = auditorias.length
  const notaMedia    = totalAuds > 0 ? (auditorias.reduce((a, b) => a + Number(b.nota), 0) / totalAuds).toFixed(1) : '—'
  const atende       = auditorias.filter(a => a.status === 'ATENDE').length
  const parcial      = auditorias.filter(a => a.status === 'ATENDE PARCIAL').length
  const naoAtende    = auditorias.filter(a => a.status === 'NÃO ATENDE').length
  const tend         = tendencia(auditorias)

  // Reincidências — itens NC que aparecem em mais de 1 auditoria
  const ncCount = {}
  auditorias.forEach(a => {
    if (!a.respostas) return
    Object.entries(a.respostas).forEach(([id, val]) => {
      if (val === false) {
        ncCount[id] = (ncCount[id] || 0) + 1
      }
    })
  })
  const reincidencias = Object.entries(ncCount)
    .filter(([, count]) => count > 1)
    .sort(([, a], [, b]) => b - a)

  // Eletricistas únicos da equipe nas auditorias do período
  const eletricistas = [...new Set([
    ...auditorias.map(a => a.nome_eletricista).filter(Boolean),
    ...auditorias.map(a => a.nome_eletricista2).filter(Boolean),
  ])]

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>

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
        background: '#c2410c',
        padding: '18px 20px', color: '#fff',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14,
          }}>← Voltar para Home</button>
          <h1 style={{ fontSize: 20, fontWeight: 800 }}>🚗 Relatório por Equipe</h1>
          <p style={{ fontSize: 12, opacity: 0.8, marginTop: 3 }}>
            Histórico completo de fiscalizações de uma equipe
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="no-print" style={{ maxWidth: 900, margin: '0 auto', padding: '16px 16px 0' }}>
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px', marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
            Selecione a Equipe e o Período
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>

            {/* PREFIXO COM AUTOCOMPLETE */}
            <div ref={prefixoRef} style={{ position: 'relative' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>
                Prefixo da Equipe *
              </label>
              <input
                type="text" value={filtros.prefixo}
                onChange={e => onPrefixoChange(e.target.value)}
                placeholder="Ex: PI-THE-C001M"
                className="form-input" style={{ fontSize: 13, padding: '8px 10px' }}
              />
              {filtros.prefixo && (
                <button onClick={() => { upd('prefixo', ''); setPrefixoSugs([]); setGerado(false) }} style={{
                  position: 'absolute', right: 8, top: 30, background: 'none',
                  border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16,
                }}>×</button>
              )}
              {prefixoSugs.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                  background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto',
                }}>
                  {prefixoSugs.map((s, i) => (
                    <button key={i} onClick={() => { upd('prefixo', s); setPrefixoSugs([]) }} style={{
                      display: 'block', width: '100%', padding: '10px 14px', textAlign: 'left',
                      background: 'none', border: 'none',
                      borderBottom: i < prefixoSugs.length - 1 ? '1px solid #f1f5f9' : 'none',
                      fontSize: 13, color: '#1e293b', cursor: 'pointer',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >{s}</button>
                  ))}
                </div>
              )}
            </div>

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

          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={buscar} disabled={loading || !filtros.prefixo} style={{
              padding: '10px 24px', color: '#fff', border: 'none', borderRadius: 10,
              fontSize: 14, fontWeight: 700, cursor: filtros.prefixo ? 'pointer' : 'not-allowed',
              background: loading ? '#64748b' : !filtros.prefixo ? '#e2e8f0' : '#c2410c',
            }}>
              {loading ? '⏳ Buscando...' : '🔍 Gerar Relatório'}
            </button>
            {gerado && totalAuds > 0 && (
              <button onClick={() => window.print()} style={{
                padding: '10px 24px', background: '#7c3aed', color: '#fff',
                border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>
                🖨️ Imprimir / Salvar PDF
              </button>
            )}
          </div>

          {gerado && totalAuds === 0 && (
            <div style={{ marginTop: 14, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#c2410c', fontWeight: 600 }}>
              ⚠️ Nenhuma auditoria encontrada para {filtros.prefixo} no período selecionado.
            </div>
          )}
        </div>
      </div>

      {/* RELATÓRIO */}
      {gerado && totalAuds > 0 && (
        <div className="print-area" style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px 60px' }}>

          {/* Cabeçalho */}
          <div style={{
            background: '#7c2d12', color: '#fff', borderRadius: 12,
            padding: '20px 24px', marginBottom: 20,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>
                  🚗 {filtros.prefixo}
                </h2>
                <p style={{ fontSize: 12, opacity: 0.8 }}>Relatório de Fiscalizações — DPL Construções</p>
                <p style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>Contrato Equatorial Energia 1021/2024</p>
                <p style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>Período: {formatPeriodo()}</p>
                {eletricistas.length > 0 && (
                  <p style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                    👷 {eletricistas.join(' · ')}
                  </p>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 40, fontWeight: 900, lineHeight: 1 }}>{notaMedia}</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>nota média</div>
                {tend && (
                  <div style={{
                    marginTop: 8, background: 'rgba(255,255,255,0.15)',
                    padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                  }}>
                    {tend.label}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Métricas rápidas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Total Auditorias', val: totalAuds,  color: '#1e3a5f', bg: '#eff6ff' },
              { label: 'Atende',           val: atende,     color: '#15803d', bg: '#dcfce7' },
              { label: 'Atende Parcial',   val: parcial,    color: '#92400e', bg: '#fef3c7' },
              { label: 'Não Atende',       val: naoAtende,  color: '#dc2626', bg: '#fee2e2' },
            ].map(m => (
              <div key={m.label} style={{
                background: m.bg, borderRadius: 12, padding: '14px',
                textAlign: 'center', border: `1.5px solid ${m.color}22`,
              }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: m.color }}>{m.val}</div>
                <div style={{ fontSize: 11, color: m.color, fontWeight: 600, marginTop: 2 }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Evolução de notas — linha do tempo */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px', marginBottom: 20 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 14 }}>
              📊 Evolução das Notas
            </p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80, overflowX: 'auto', paddingBottom: 4 }}>
              {auditorias.map((a, i) => {
                const nota = Number(a.nota)
                const h    = Math.max(8, (nota / 100) * 80)
                const cor  = nota >= 90 ? '#16a34a' : nota >= 80 ? '#d97706' : '#dc2626'
                return (
                  <div key={a.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 36 }}>
                    <span style={{ fontSize: 9, color: '#64748b', marginBottom: 2 }}>{nota.toFixed(0)}</span>
                    <div style={{ width: 28, height: h, background: cor, borderRadius: '4px 4px 0 0' }} title={`${formatData(a.data_auditoria)} — ${nota} pts`} />
                    <span style={{ fontSize: 8, color: '#94a3b8', marginTop: 3, textAlign: 'center' }}>
                      {formatData(a.data_auditoria).slice(0, 5)}
                    </span>
                  </div>
                )
              })}
            </div>
            {tend && (
              <div style={{
                marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6,
                background: tend.bg, color: tend.color,
                padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
              }}>
                {tend.label} — comparando primeira e segunda metade do período
              </div>
            )}
          </div>

          {/* Reincidências */}
          {reincidencias.length > 0 && (
            <div style={{
              background: '#fef2f2', border: '1.5px solid #fecaca',
              borderRadius: 14, padding: '16px', marginBottom: 20,
            }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c', marginBottom: 12 }}>
                🔁 Não Conformidades Reincidentes ({reincidencias.length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {reincidencias.slice(0, 10).map(([id, count]) => (
                  <div key={id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: '#fff', borderRadius: 8, padding: '10px 14px',
                    border: '1px solid #fecaca',
                  }}>
                    <span style={{ fontSize: 12, color: '#991b1b', flex: 1 }}>
                      Item #{id}
                    </span>
                    <span style={{
                      background: '#dc2626', color: '#fff',
                      padding: '2px 10px', borderRadius: 20,
                      fontSize: 12, fontWeight: 700, flexShrink: 0,
                    }}>
                      {count}x não conforme
                    </span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: '#dc2626', marginTop: 10, opacity: 0.8 }}>
                ⚠️ Atenção especial recomendada para estes itens nas próximas fiscalizações.
              </p>
            </div>
          )}

          {/* Histórico detalhado */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ background: '#7c2d12', color: '#fff', padding: '12px 18px' }}>
              <p style={{ fontSize: 13, fontWeight: 700 }}>📋 Histórico Detalhado ({totalAuds} auditoria{totalAuds > 1 ? 's' : ''})</p>
            </div>
            {auditorias.map((a, idx) => {
              const sc = STATUS_COR[a.status] || { bg: '#f1f5f9', color: '#374151', border: '#e2e8f0' }
              return (
                <div key={a.id} style={{
                  background: idx % 2 === 0 ? '#fff' : '#f8fafc',
                  borderBottom: idx < auditorias.length - 1 ? '1px solid #f1f5f9' : 'none',
                  padding: '14px 18px',
                }}>
                  {/* Linha 1 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                        #{idx + 1} — {formatData(a.data_auditoria)} às {a.hora_auditoria}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px',
                        borderRadius: 20, background: sc.bg, color: sc.color,
                        border: `1px solid ${sc.border}`,
                      }}>
                        {a.status}
                      </span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>
                        {a.tipo_servico} · {a.produtivo ? 'Produtivo' : 'Improdutivo'} ·{' '}
                        {a.tipo_auditoria === 'DESEMPENHO' ? 'Desempenho Op.' : 'Pós Serviço'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: '#64748b' }}>👤 {a.fiscal}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>OS: {a.os}</span>
                      <span style={{
                        fontSize: 16, fontWeight: 900, color: sc.color,
                        background: sc.bg, padding: '2px 10px', borderRadius: 8,
                        border: `1px solid ${sc.border}`,
                      }}>
                        {Number(a.nota).toFixed(0)} pts
                      </span>
                    </div>
                  </div>

                  {/* Eletricistas */}
                  {(a.nome_eletricista || a.nome_eletricista2) && (
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: a.feedback ? 8 : 0 }}>
                      👷 {[a.nome_eletricista, a.nome_eletricista2].filter(Boolean).join(' · ')}
                    </div>
                  )}

                  {/* Feedback */}
                  {a.feedback && (
                    <div style={{
                      background: '#fffbeb', border: '1px solid #fcd34d',
                      borderRadius: 8, padding: '8px 12px', marginTop: 8,
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#92400e', textTransform: 'uppercase' }}>
                        Feedback:
                      </span>
                      <p style={{ fontSize: 12, color: '#78350f', margin: '4px 0 0', lineHeight: 1.5 }}>
                        {a.feedback}
                      </p>
                    </div>
                  )}

                  {/* Observações */}
                  {a.observacoes && (
                    <div style={{
                      background: '#f0f9ff', border: '1px solid #bae6fd',
                      borderRadius: 8, padding: '8px 12px', marginTop: 8,
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase' }}>
                        Observações:
                      </span>
                      <p style={{ fontSize: 12, color: '#0c4a6e', margin: '4px 0 0', lineHeight: 1.5 }}>
                        {a.observacoes}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Info da equipe (eletricistas cadastrados) */}
          {equipeInfo.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px', marginBottom: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12 }}>
                👷 Composição da Equipe (Cadastro)
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {equipeInfo.map((e, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 12, fontSize: 12, color: '#475569',
                    padding: '8px 12px', background: i % 2 === 0 ? '#f8fafc' : '#fff',
                    borderRadius: 8,
                  }}>
                    <span style={{ fontWeight: 700, color: '#1e293b', minWidth: 80 }}>{e.matricula}</span>
                    <span style={{ flex: 1 }}>{e.colaborador}</span>
                    <span style={{ color: '#94a3b8' }}>{e.base}</span>
                    <span style={{ color: '#94a3b8' }}>{e.placas}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rodapé */}
          <div style={{
            borderTop: '2px solid #e2e8f0', paddingTop: 16,
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
