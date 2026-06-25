import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useFiltrosOperacionais, PainelFiltros } from '../components/PainelFiltros.jsx'

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
  const filtros = useFiltrosOperacionais({ usuarioLogado, periodoPadrao: 'hoje' })
  const ultimaBuscaRef = useRef(0)
  const [abaAtiva,  setAbaAtiva]  = useState('geral')
  const [loading,   setLoading]   = useState(false)
  const [erro,      setErro]      = useState('')

  // Dados dos 4 relatórios
  const [dadosGeral,       setDadosGeral]       = useState(null)
  const [dadosSupervisor,  setDadosSupervisor]  = useState(null)
  const [dadosPrefixo,     setDadosPrefixo]     = useState(null)
  const [dadosDisponiveis, setDadosDisponiveis] = useState(null)

  const motivoDescricao = (registro, fallback = 'OUTRO') => (
    registro?.descricao_motivo_indisponibilidade ||
    registro?.motivos_indisponibilidade?.descricao ||
    fallback
  )

  // Carrega dados brutos uma vez por busca, já limitados pelo painel padrão.
  const carregarDadosBase = async (ini, fim) => {
    const { data: estruturaRaw, error: estruturaError } = await supabase
      .from('estrutura_equipes')
      .select('id, colaborador, matricula, prefixo, superv_campo, superv_operacao, polo, base, processo_equipe, descr_situacao')
      .in('descr_situacao', ['ATIVO', 'RESERVA'])

    if (estruturaError) throw estruturaError

    const estrutura = filtros.filtrar(estruturaRaw || [])
    const prefixosEscopo = new Set(estrutura.map(e => e.prefixo).filter(Boolean))
    const idsEscopo = new Set(estrutura.map(e => e.id).filter(id => id !== null && id !== undefined))

    if (prefixosEscopo.size === 0) {
      return { estrutura, presentes: [], indisponiveis: [], prefixosEscopo, idsEscopo }
    }

    const [{ data: presentesRaw, error: presentesError }, { data: indisponiveisRaw, error: indisponiveisError }] = await Promise.all([
      supabase
        .from('equipes_dia')
        .select('id, eletricista_id, prefixo, data, id_indisponibilidade, descricao_motivo_indisponibilidade')
        .gte('data', ini)
        .lte('data', fim),
      supabase
        .from('indisponibilidades')
        .select('id, eletricista_id, prefixo, data, motivo_id, descricao_motivo_indisponibilidade, motivos_indisponibilidade(descricao)')
        .gte('data', ini)
        .lte('data', fim),
    ])

    if (presentesError) throw presentesError
    if (indisponiveisError) throw indisponiveisError

    const noEscopo = (registro) => {
      if (registro.prefixo && prefixosEscopo.has(registro.prefixo)) return true
      return idsEscopo.has(registro.eletricista_id)
    }

    return {
      estrutura,
      presentes: (presentesRaw || []).filter(noEscopo),
      indisponiveis: (indisponiveisRaw || []).filter(noEscopo),
      prefixosEscopo,
      idsEscopo,
    }
  }

  const montarGeral = ({ estrutura, presentes, indisponiveis }) => {
    const contadores = { PRESENTE: presentes.length }
    indisponiveis.forEach(i => {
      const motivo = motivoDescricao(i).toUpperCase()
      contadores[motivo] = (contadores[motivo] || 0) + 1
    })

    const total = Object.values(contadores).reduce((acc, qtde) => acc + qtde, 0)
    const dados = Object.entries(contadores)
      .map(([motivo, qtde]) => ({
        motivo,
        qtde,
        percentual: total > 0 ? Math.round(qtde / total * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.qtde - a.qtde)

    setDadosGeral({ total, totalElet: estrutura.length, dados })
  }

  const montarSupervisor = ({ estrutura, presentes, indisponiveis }) => {
    const grupos = {}

    estrutura.forEach(e => {
      const supervisor = e.superv_campo || 'Sem Supervisor'
      if (!grupos[supervisor]) {
        grupos[supervisor] = {
          supervisor,
          totalElet: 0,
          presentes: 0,
          ausentes: 0,
          ids: new Set(),
          prefixos: new Set(),
        }
      }
      grupos[supervisor].totalElet += 1
      if (e.id !== null && e.id !== undefined) grupos[supervisor].ids.add(e.id)
      if (e.prefixo) grupos[supervisor].prefixos.add(e.prefixo)
    })

    const pertenceAoGrupo = (registro, grupo) => (
      grupo.ids.has(registro.eletricista_id) ||
      (registro.prefixo && grupo.prefixos.has(registro.prefixo))
    )

    Object.values(grupos).forEach(grupo => {
      grupo.presentes = presentes.filter(p => pertenceAoGrupo(p, grupo)).length
      grupo.ausentes = indisponiveis.filter(i => pertenceAoGrupo(i, grupo)).length
      grupo.totalRegistros = grupo.presentes + grupo.ausentes
      grupo.pctPresenca = grupo.totalRegistros > 0
        ? Math.round(grupo.presentes / grupo.totalRegistros * 1000) / 10
        : 0
    })

    setDadosSupervisor(
      Object.values(grupos)
        .map(({ ids, prefixos, ...grupo }) => grupo)
        .sort((a, b) => b.pctPresenca - a.pctPresenca || a.supervisor.localeCompare(b.supervisor))
    )
  }

  const montarPrefixo = ({ indisponiveis }) => {
    const mapa = {}
    indisponiveis.forEach(i => {
      const chave = String(i.prefixo || '') + '__' + String(i.data || '')
      if (!mapa[chave]) mapa[chave] = { prefixo: i.prefixo || '—', data: i.data, motivos: [] }
      if (mapa[chave].motivos.length < 2) mapa[chave].motivos.push(motivoDescricao(i, '—'))
    })

    setDadosPrefixo(
      Object.values(mapa).sort((a, b) => String(a.prefixo).localeCompare(String(b.prefixo)))
    )
  }

  const montarDisponiveis = ({ estrutura, presentes, indisponiveis }) => {
    const comRegistro = new Set([
      ...presentes.map(p => p.eletricista_id),
      ...indisponiveis.map(i => i.eletricista_id),
    ])

    const disponiveis = estrutura.filter(e => !comRegistro.has(e.id))
    setDadosDisponiveis({ total: estrutura.length, disponiveis })
  }

  // Recalcula os relatórios sempre que o painel padrão muda.
  const aplicarFiltros = async () => {
    const buscaId = ++ultimaBuscaRef.current
    const { ini, fim } = filtros.getDatasQuery()


    if (!ini || !fim || ini > fim) {
      setErro('Selecione um período válido (início ≤ fim).')
      setLoading(false)
      return
    }

    if (!filtros.estruturaCarregada) {
      setErro('Aguarde o carregamento da estrutura de equipes.')
      setLoading(false)
      return
    }

    setLoading(true)
    setErro('')

    try {
      const base = await carregarDadosBase(ini, fim)
      if (buscaId !== ultimaBuscaRef.current) return
      montarGeral(base)
      montarSupervisor(base)
      montarPrefixo(base)
      montarDisponiveis(base)
    } catch (e) {
      if (buscaId === ultimaBuscaRef.current) setErro('Erro ao carregar relatório: ' + e.message)
    } finally {
      if (buscaId === ultimaBuscaRef.current) setLoading(false)
    }
  }

  const filtroAplicacaoKey = [
    filtros.estruturaCarregada ? '1' : '0',
    filtros.tipoPeriodo || (filtros.modoPeriodo ? 'periodo' : 'mes'),
    filtros.mesAno || '',
    filtros.dataIni || '',
    filtros.dataFim || '',
    filtros.selSupOp.join('|'),
    filtros.selSupCampo.join('|'),
    filtros.selPrefixos.join('|'),
  ].join('::')

  useEffect(() => {
    if (!filtros.estruturaCarregada) return
    const timer = setTimeout(() => { aplicarFiltros() }, 150)
    return () => clearTimeout(timer)
  }, [filtroAplicacaoKey])

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

        {/* ── Painel padrão de filtros ── */}
        <PainelFiltros
          filtros={filtros}
          titulo="🔍 Filtros"
          badge="dashboard indisponibilidade"
        />
        {loading && (
          <div style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 16,
            fontSize: 12,
            color: '#1e3a5f',
            fontWeight: 700,
            textAlign: 'center',
          }}>
            🔄 Atualizando relatório...
          </div>
        )}

        {/* ── Erro ── */}
        {erro && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 14, fontSize: 13, color: '#b91c1c', fontWeight: 600 }}>
            ❌ {erro}
          </div>
        )}

        {!temDados && !loading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📊</div>
            <p>Ajuste os filtros para ver os relatórios.</p>
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
