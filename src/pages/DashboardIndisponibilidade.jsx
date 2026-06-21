import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'

// ════════════════════════════════════════════════════════════════════════════
// Dashboard de Indisponibilidade — VérticeGP
// ────────────────────────────────────────────────────────────────────────────
// 4 relatórios (mesmo do sistema original):
//  1. Geral      — totais por motivo no período
//  2. Supervisor — por supervisor de campo
//  3. Por Prefixo — equipes com indisponibilidades
//  4. Disponíveis — eletricistas sem registro no período
// ════════════════════════════════════════════════════════════════════════════

const COR_MOTIVO = (motivo) => {
  if (!motivo) return '#64748b'
  const m = motivo.toUpperCase()
  if (m === 'PRESENTE')            return '#16a34a'
  if (m === 'NÃO REGISTRADO')      return '#94a3b8'
  if (m.includes('ATESTADO'))      return '#dc2626'
  if (m.includes('FALTA'))         return '#b91c1c'
  if (m.includes('VIATURA'))       return '#d97706'
  if (m.includes('FERIAS'))        return '#7c3aed'
  if (m.includes('LICENCA'))       return '#0891b2'
  if (m.includes('ACIDENTE'))      return '#dc2626'
  if (m.includes('TREINA'))        return '#2563eb'
  return '#64748b'
}

function BarraMotivo({ motivo, qtde, percentual, total }) {
  const cor = COR_MOTIVO(motivo)
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{motivo}</span>
        <span style={{ fontSize: 12, color: '#64748b' }}>
          {qtde} ({percentual}%)
        </span>
      </div>
      <div style={{ background: '#f1f5f9', borderRadius: 6, height: 12, overflow: 'hidden' }}>
        <div style={{ width: `${percentual}%`, height: 12, background: cor, borderRadius: 6 }} />
      </div>
    </div>
  )
}

export default function DashboardIndisponibilidade({ usuarioLogado, onVoltar }) {
  const hoje = new Date().toISOString().split('T')[0]
  const inicioMes = hoje.slice(0, 8) + '01'

  const [dataIni,   setDataIni]   = useState(inicioMes)
  const [dataFim,   setDataFim]   = useState(hoje)
  const [abaAtiva,  setAbaAtiva]  = useState('geral')
  const [loading,   setLoading]   = useState(false)
  const [erro,      setErro]      = useState('')

  // Dados dos 4 relatórios
  const [dadosGeral,       setDadosGeral]       = useState(null)
  const [dadosSupervisor,  setDadosSupervisor]  = useState(null)
  const [dadosPrefixo,     setDadosPrefixo]     = useState(null)
  const [dadosDisponiveis, setDadosDisponiveis] = useState(null)

  // ─── Busca o relatório geral ────────────────────────────────────────────────
  const buscarGeral = useCallback(async () => {
    const { data: eletricistas } = await supabase
      .from('estrutura_equipes')
      .select('id')
      .in('descr_situacao', ['ATIVO', 'RESERVA'])

    const totalElet = eletricistas?.length || 0

    const { data: indisponiveis } = await supabase
      .from('indisponibilidades')
      .select('motivo_id, motivos_indisponibilidade(descricao)')
      .gte('data', dataIni).lte('data', dataFim)

    const { data: presentes } = await supabase
      .from('equipes_dia')
      .select('id')
      .gte('data', dataIni).lte('data', dataFim)

    const contadores = { 'PRESENTE': presentes?.length || 0 }
    ;(indisponiveis || []).forEach(i => {
      const m = i.motivos_indisponibilidade?.descricao?.toUpperCase() || 'OUTRO'
      contadores[m] = (contadores[m] || 0) + 1
    })

    const total = Object.values(contadores).reduce((a, b) => a + b, 0)
    const dados = Object.entries(contadores).map(([motivo, qtde]) => ({
      motivo, qtde,
      percentual: total > 0 ? Math.round(qtde / total * 1000) / 10 : 0,
    })).sort((a, b) => b.qtde - a.qtde)

    setDadosGeral({ total, totalElet, dados })
  }, [dataIni, dataFim])

  // ─── Busca por supervisor ───────────────────────────────────────────────────
  const buscarSupervisor = useCallback(async () => {
    const { data: supervisores } = await supabase
      .from('estrutura_equipes')
      .select('superv_campo')
      .in('descr_situacao', ['ATIVO', 'RESERVA'])

    const supSet = [...new Set((supervisores || []).map(s => s.superv_campo).filter(Boolean))]

    const resultados = await Promise.all(supSet.map(async sup => {
      const { data: eletSup } = await supabase
        .from('estrutura_equipes')
        .select('id')
        .eq('superv_campo', sup)
        .in('descr_situacao', ['ATIVO', 'RESERVA'])

      const ids = (eletSup || []).map(e => e.id)

      const [{ data: presentes }, { data: ausentes }] = await Promise.all([
        supabase.from('equipes_dia').select('id').in('eletricista_id', ids).gte('data', dataIni).lte('data', dataFim),
        supabase.from('indisponibilidades').select('id').in('eletricista_id', ids).gte('data', dataIni).lte('data', dataFim),
      ])

      const totalPres = presentes?.length || 0
      const totalAus  = ausentes?.length || 0
      const totalReg  = totalPres + totalAus

      return {
        supervisor: sup,
        totalElet: ids.length,
        presentes: totalPres,
        ausentes: totalAus,
        totalRegistros: totalReg,
        pctPresenca: totalReg > 0 ? Math.round(totalPres / totalReg * 1000) / 10 : 0,
      }
    }))

    setDadosSupervisor(resultados.sort((a, b) => b.pctPresenca - a.pctPresenca))
  }, [dataIni, dataFim])

  // ─── Busca por prefixo ──────────────────────────────────────────────────────
  const buscarPrefixo = useCallback(async () => {
    const { data: indisponiveis } = await supabase
      .from('indisponibilidades')
      .select('prefixo, data, motivo_id, motivos_indisponibilidade(descricao)')
      .gte('data', dataIni).lte('data', dataFim)
      .order('prefixo').order('data')

    const mapa = {}
    ;(indisponiveis || []).forEach(i => {
      const chave = `${i.prefixo}__${i.data}`
      if (!mapa[chave]) mapa[chave] = { prefixo: i.prefixo, data: i.data, motivos: [] }
      if (mapa[chave].motivos.length < 2) {
        mapa[chave].motivos.push(i.motivos_indisponibilidade?.descricao || '—')
      }
    })

    setDadosPrefixo(Object.values(mapa).sort((a, b) => a.prefixo.localeCompare(b.prefixo)))
  }, [dataIni, dataFim])

  // ─── Busca eletricistas disponíveis (sem nenhum registro no período) ────────
  const buscarDisponiveis = useCallback(async () => {
    const { data: todos } = await supabase
      .from('estrutura_equipes')
      .select('id, colaborador, matricula, prefixo, superv_campo, superv_operacao, polo, base, processo_equipe')
      .in('descr_situacao', ['ATIVO', 'RESERVA'])

    const [{ data: presentes }, { data: ausentes }] = await Promise.all([
      supabase.from('equipes_dia').select('eletricista_id').gte('data', dataIni).lte('data', dataFim),
      supabase.from('indisponibilidades').select('eletricista_id').gte('data', dataIni).lte('data', dataFim),
    ])

    const comRegistro = new Set([
      ...(presentes || []).map(p => p.eletricista_id),
      ...(ausentes  || []).map(a => a.eletricista_id),
    ])

    const disponiveis = (todos || []).filter(e => !comRegistro.has(e.id))
    setDadosDisponiveis({ total: todos?.length || 0, disponiveis })
  }, [dataIni, dataFim])

  // ─── Busca ao clicar em "Filtrar" ──────────────────────────────────────────
  const filtrar = async () => {
    if (!dataIni || !dataFim || dataIni > dataFim) {
      setErro('Selecione um período válido (início ≤ fim).')
      return
    }
    setLoading(true)
    setErro('')
    try {
      await Promise.all([buscarGeral(), buscarSupervisor(), buscarPrefixo(), buscarDisponiveis()])
    } catch (e) {
      setErro('Erro ao carregar relatório: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const temDados = dadosGeral !== null

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>

      {/* ── Header ── */}
      <div style={{ background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', padding: '18px 20px', color: '#fff' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14,
          }}>← Voltar para Home</button>
          <h1 style={{ fontSize: 20, fontWeight: 800 }}>📊 Dashboard de Indisponibilidade</h1>
          <p style={{ fontSize: 12, opacity: 0.8, marginTop: 3 }}>Relatórios de frequência e ausência das equipes</p>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 16px 60px' }}>

        {/* ── Filtro de período ── */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px', marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 12 }}>📅 Período de Análise</p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">De</label>
              <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} className="form-input" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Até</label>
              <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="form-input" />
            </div>
            <button
              onClick={filtrar}
              disabled={loading}
              className="btn-primary"
              style={{ background: loading ? '#64748b' : '#1e3a5f', minWidth: 120, marginBottom: 0 }}>
              {loading ? '⏳ Buscando...' : '🔍 Filtrar'}
            </button>
          </div>
        </div>

        {/* ── Erro ── */}
        {erro && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 14, fontSize: 13, color: '#b91c1c', fontWeight: 600 }}>
            ❌ {erro}
          </div>
        )}

        {!temDados && !loading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📊</div>
            <p>Selecione um período e clique em Filtrar para ver os relatórios.</p>
          </div>
        )}

        {temDados && (
          <>
            {/* ── Abas ── */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
              {[
                { id: 'geral',       label: '📈 Geral'       },
                { id: 'supervisor',  label: '👤 Por Supervisor' },
                { id: 'prefixo',     label: '🚗 Por Prefixo'  },
                { id: 'disponiveis', label: '📋 Disponíveis'  },
              ].map(aba => (
                <button key={aba.id} onClick={() => setAbaAtiva(aba.id)} style={{
                  padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                  background: abaAtiva === aba.id ? '#1e3a5f' : '#e2e8f0',
                  color:      abaAtiva === aba.id ? '#fff'    : '#374151',
                }}>{aba.label}</button>
              ))}
            </div>

            {/* ══════════════════════════════
                ABA: GERAL
            ══════════════════════════════ */}
            {abaAtiva === 'geral' && dadosGeral && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
                  {[
                    { label: 'Total Eletricistas', val: dadosGeral.totalElet,                              cor: '#2563eb' },
                    { label: 'Total Registros',    val: dadosGeral.total,                                  cor: '#7c3aed' },
                    { label: 'Presentes',          val: dadosGeral.dados.find(d => d.motivo === 'PRESENTE')?.qtde || 0, cor: '#16a34a' },
                  ].map(({ label, val, cor }) => (
                    <div key={label} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px', textAlign: 'center' }}>
                      <p style={{ fontSize: 26, fontWeight: 900, color: cor }}>{val}</p>
                      <p style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>{label}</p>
                    </div>
                  ))}
                </div>

                <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '20px' }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 16 }}>Distribuição por Motivo</p>
                  {dadosGeral.dados.map(d => (
                    <BarraMotivo key={d.motivo} {...d} total={dadosGeral.total} />
                  ))}
                </div>
              </>
            )}

            {/* ══════════════════════════════
                ABA: POR SUPERVISOR
            ══════════════════════════════ */}
            {abaAtiva === 'supervisor' && dadosSupervisor && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {dadosSupervisor.map(s => (
                  <div key={s.supervisor} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{s.supervisor}</p>
                        <p style={{ fontSize: 11, color: '#64748b' }}>{s.totalElet} eletricistas · {s.totalRegistros} registros</p>
                      </div>
                      <div style={{
                        background: s.pctPresenca >= 90 ? '#dcfce7' : s.pctPresenca >= 70 ? '#fef3c7' : '#fee2e2',
                        color:      s.pctPresenca >= 90 ? '#16a34a' : s.pctPresenca >= 70 ? '#d97706' : '#dc2626',
                        borderRadius: 10, padding: '6px 12px', fontWeight: 800, fontSize: 16,
                      }}>
                        {s.pctPresenca}% presença
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[
                        { label: '✓ Presentes', val: s.presentes, cor: '#16a34a' },
                        { label: '✗ Ausentes',  val: s.ausentes,  cor: '#dc2626' },
                      ].map(({ label, val, cor }) => (
                        <div key={label} style={{ background: '#f8fafc', borderRadius: 10, padding: '10px', textAlign: 'center' }}>
                          <p style={{ fontSize: 20, fontWeight: 800, color: cor }}>{val}</p>
                          <p style={{ fontSize: 11, color: '#64748b' }}>{label}</p>
                        </div>
                      ))}
                    </div>
                    {/* Barra de presença */}
                    <div style={{ marginTop: 10, background: '#f1f5f9', borderRadius: 6, height: 8, overflow: 'hidden' }}>
                      <div style={{ width: `${s.pctPresenca}%`, height: 8, background: s.pctPresenca >= 90 ? '#16a34a' : s.pctPresenca >= 70 ? '#d97706' : '#dc2626', borderRadius: 6 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ══════════════════════════════
                ABA: POR PREFIXO
            ══════════════════════════════ */}
            {abaAtiva === 'prefixo' && dadosPrefixo && (
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                    {dadosPrefixo.length} ocorrência(s) de indisponibilidade por prefixo
                  </p>
                </div>
                {dadosPrefixo.length === 0 ? (
                  <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>
                    🎉 Nenhuma indisponibilidade registrada no período.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          {['Prefixo', 'Data', 'Motivo 1', 'Motivo 2'].map(h => (
                            <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dadosPrefixo.map((row, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 700, color: '#1e293b', fontFamily: 'monospace' }}>{row.prefixo}</td>
                            <td style={{ padding: '10px 14px', color: '#64748b' }}>{new Date(row.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                                {row.motivos[0] || '—'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              {row.motivos[1] ? (
                                <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                                  {row.motivos[1]}
                                </span>
                              ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════════════════
                ABA: DISPONÍVEIS
            ══════════════════════════════ */}
            {abaAtiva === 'disponiveis' && dadosDisponiveis && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                  {[
                    { label: 'Total Eletricistas',   val: dadosDisponiveis.total,                  cor: '#2563eb' },
                    { label: 'Sem Registro no Período', val: dadosDisponiveis.disponiveis.length,  cor: '#d97706' },
                  ].map(({ label, val, cor }) => (
                    <div key={label} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px', textAlign: 'center' }}>
                      <p style={{ fontSize: 26, fontWeight: 900, color: cor }}>{val}</p>
                      <p style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>{label}</p>
                    </div>
                  ))}
                </div>

                {dadosDisponiveis.disponiveis.length === 0 ? (
                  <div style={{ background: '#f0fdf4', borderRadius: 14, border: '1px solid #86efac', padding: 30, textAlign: 'center', color: '#16a34a' }}>
                    🎉 Todos os eletricistas têm registro no período selecionado!
                  </div>
                ) : (
                  <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                        Eletricistas sem registro no período
                      </p>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: '#f8fafc' }}>
                            {['Matrícula', 'Colaborador', 'Prefixo', 'Supervisor de Campo', 'Processo'].map(h => (
                              <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {dadosDisponiveis.disponiveis.map((e, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '10px 14px', color: '#64748b', fontFamily: 'monospace' }}>{e.matricula}</td>
                              <td style={{ padding: '10px 14px', fontWeight: 700, color: '#1e293b' }}>{e.colaborador}</td>
                              <td style={{ padding: '10px 14px', color: '#64748b', fontFamily: 'monospace' }}>{e.prefixo || '—'}</td>
                              <td style={{ padding: '10px 14px', color: '#64748b' }}>{e.superv_campo || '—'}</td>
                              <td style={{ padding: '10px 14px', color: '#64748b' }}>{e.processo_equipe || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
