import { useState, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  useFiltrosOperacionais,
  PainelFiltros,
  FIELD_HEIGHT,
} from '../components/PainelFiltros.jsx'

const STATUS_COR = {
  'ATENDE':         { bg: '#dcfce7', color: '#15803d', border: '#86efac' },
  'ATENDE PARCIAL': { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  'NÃO ATENDE':     { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
}

function tendencia(auditorias) {
  if (auditorias.length < 2) return null
  const metade   = Math.floor(auditorias.length / 2)
  const mediaAnt = auditorias.slice(0, metade).reduce((a, b) => a + Number(b.nota), 0) / metade
  const mediaRec = auditorias.slice(metade).reduce((a, b) => a + Number(b.nota), 0) / (auditorias.length - metade)
  const diff = mediaRec - mediaAnt
  if (diff > 5)  return { label: '📈 Melhorando',  color: '#15803d', bg: '#dcfce7' }
  if (diff < -5) return { label: '📉 Piorando',    color: '#dc2626', bg: '#fee2e2' }
  return             { label: '➡️ Estável',         color: '#92400e', bg: '#fef3c7' }
}

export default function RelatorioEquipe({ usuarioLogado, onVoltar }) {
  // ─── Hook do painel: Período + Sup. Op + Sup. Campo + Prefixo ───
  const filtros = useFiltrosOperacionais({ inicializarMes: true, usuarioLogado })

  const [auditorias, setAuditorias] = useState([])
  const [equipeInfo, setEquipeInfo] = useState([])
  const [loading,    setLoading]    = useState(false)
  const [gerado,     setGerado]     = useState(false)

  // Computed: lista FINAL de prefixos a buscar (combina cascata + SEGREGAÇÃO)
  // O mapPrefixo já vem filtrado pelo hook (só prefixos que o usuário pode ver),
  // então iterar sobre ele já respeita a segregação automaticamente.
  const prefixosFiltrados = useMemo(() => {
    const filtroAtivo =
      filtros.selRegional.length > 0 ||
      filtros.selSupOp.length    > 0 ||
      filtros.selSupCampo.length > 0 ||
      filtros.selPrefixos.length > 0

    // Se há segregação mas sem filtros do painel ativos,
    // usa todos os prefixos permitidos como base (sem exigir seleção manual)
    if (!filtroAtivo) {
      if (filtros.prefixosPermitidos) return [...filtros.prefixosPermitidos].sort()
      return []  // sem segregação e sem filtro → exige seleção manual
    }

    // Com filtros do painel: itera sobre mapPrefixo (já segregado)
    const set = new Set()
    Object.entries(filtros.mapPrefixo).forEach(([pref, info]) => {
      if (filtros.selRegional.length > 0 && !filtros.selRegional.includes(info.regional)) return
      if (filtros.selSupOp.length    > 0 && !filtros.selSupOp.includes(info.op))       return
      if (filtros.selSupCampo.length > 0 && !filtros.selSupCampo.includes(info.campo)) return
      if (filtros.selPrefixos.length > 0 && !filtros.selPrefixos.includes(pref))       return
      set.add(pref)
    })
    return [...set].sort()
  }, [filtros.selRegional, filtros.selSupOp, filtros.selSupCampo, filtros.selPrefixos, filtros.mapPrefixo, filtros.prefixosPermitidos])

  const buscar = async () => {
    if (prefixosFiltrados.length === 0) {
      alert(filtros.temSegregacao
        ? 'Nenhuma equipe disponível na sua estrutura para o filtro selecionado.'
        : 'Selecione pelo menos uma equipe via os filtros (Sup. Operacional, Sup. Campo ou Prefixo).'
      )
      return
    }
    setLoading(true)
    setGerado(false)
    try {
      const { ini, fim } = filtros.getDatasQuery()

      // Auditorias das equipes no período
      const { data: auds, error } = await supabase
        .from('auditorias').select('*')
        .in('prefixo', prefixosFiltrados)
        .gte('data_auditoria', ini).lte('data_auditoria', fim)
        .order('data_auditoria').order('hora_auditoria')
      if (error) throw error

      // Info das equipes na estrutura_equipes
      const { data: eq } = await supabase
        .from('estrutura_equipes').select('*')
        .in('prefixo', prefixosFiltrados).limit(500)

      setAuditorias(auds || [])
      setEquipeInfo(eq || [])
      setGerado(true)
    } catch (e) {
      alert('Erro ao buscar: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const formatData    = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
  const formatPeriodo = () => {
    const { ini, fim } = filtros.getDatasQuery()
    return `${formatData(ini)} a ${formatData(fim)}`
  }

  // ── Métricas consolidadas ──
  const totalAuds = auditorias.length
  const notaMedia = totalAuds > 0
    ? (auditorias.reduce((a, b) => a + Number(b.nota), 0) / totalAuds).toFixed(1)
    : '—'
  const atende    = auditorias.filter(a => a.status === 'ATENDE').length
  const parcial   = auditorias.filter(a => a.status === 'ATENDE PARCIAL').length
  const naoAtende = auditorias.filter(a => a.status === 'NÃO ATENDE').length
  const tend      = tendencia(auditorias)

  // ── Reincidências (itens NC em mais de 1 auditoria) ──
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

  // ── Eletricistas únicos ──
  const eletricistas = [...new Set([
    ...auditorias.map(a => a.nome_eletricista).filter(Boolean),
    ...auditorias.map(a => a.nome_eletricista2).filter(Boolean),
  ])]

  // ── Ranking de equipes (para visão multi-equipe) ──
  const rankingEquipes = useMemo(() => {
    if (auditorias.length === 0) return []
    const mapa = {}
    auditorias.forEach(a => {
      if (!a.prefixo) return
      if (!mapa[a.prefixo]) mapa[a.prefixo] = { prefixo: a.prefixo, notas: [], total: 0, atende: 0, parcial: 0, nao: 0 }
      mapa[a.prefixo].notas.push(Number(a.nota))
      mapa[a.prefixo].total++
      if (a.status === 'ATENDE')         mapa[a.prefixo].atende++
      if (a.status === 'ATENDE PARCIAL') mapa[a.prefixo].parcial++
      if (a.status === 'NÃO ATENDE')     mapa[a.prefixo].nao++
    })
    return Object.values(mapa).map(e => ({
      ...e, media: (e.notas.reduce((s, n) => s + n, 0) / e.notas.length).toFixed(1),
    })).sort((a, b) => Number(b.media) - Number(a.media))
  }, [auditorias])

  const isMulti = prefixosFiltrados.length > 1

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
            Histórico consolidado de fiscalizações — selecione 1 ou mais equipes
            {filtros.temSegregacao && (
              <span style={{
                marginLeft: 8, padding: '2px 8px', borderRadius: 10,
                background: 'rgba(255,255,255,0.2)', fontSize: 10, fontWeight: 700,
              }}>
                🔒 Sua estrutura ({filtros.prefixosPermitidos?.length || 0} prefixos)
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Painel + Ações */}
      <div className="no-print" style={{ maxWidth: 900, margin: '0 auto', padding: '16px 16px 0' }}>

        <PainelFiltros
          filtros={filtros}
          titulo="🔍 Filtros do Relatório"
          badge="equipes / auditorias"
        />

        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={buscar} disabled={loading} style={{
            height: FIELD_HEIGHT, padding: '0 22px',
            color: '#fff', border: 'none', borderRadius: 10,
            fontSize: 14, fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
            background: loading ? '#64748b' : '#c2410c',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            {loading ? '⏳ Buscando...' : '🔍 Gerar Relatório'}
          </button>
          {gerado && totalAuds > 0 && (
            <button onClick={() => window.print()} style={{
              height: FIELD_HEIGHT, padding: '0 22px',
              background: '#7c3aed', color: '#fff',
              border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              🖨️ Imprimir / Salvar PDF
            </button>
          )}
          {prefixosFiltrados.length > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 700, color: '#c2410c',
              background: '#ffedd5', padding: '4px 10px', borderRadius: 6,
              border: '1px solid #fed7aa',
            }}>
              {prefixosFiltrados.length} equipe{prefixosFiltrados.length > 1 ? 's' : ''} selecionada{prefixosFiltrados.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {prefixosFiltrados.length === 0 && (
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '14px 16px', fontSize: 13, color: '#c2410c', fontWeight: 600, marginBottom: 16 }}>
            {filtros.temSegregacao
              ? '⚠️ Nenhuma equipe disponível na sua estrutura. Verifique seus processos liberados com o administrador.'
              : '⚠️ Selecione pelo menos uma equipe via os filtros (Supervisor Operacional, de Campo ou Prefixo) para gerar o relatório.'
            }
          </div>
        )}

        {gerado && totalAuds === 0 && prefixosFiltrados.length > 0 && (
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#c2410c', fontWeight: 600, marginBottom: 16 }}>
            ⚠️ Nenhuma auditoria encontrada para os filtros selecionados no período.
          </div>
        )}
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
                  🚗 {isMulti
                    ? `${prefixosFiltrados.length} equipes selecionadas`
                    : prefixosFiltrados[0]}
                </h2>
                <p style={{ fontSize: 12, opacity: 0.8 }}>Relatório de Fiscalizações — DPL Construções</p>
                <p style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>Contrato Equatorial Energia 1021/2024</p>
                <p style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>Período: {formatPeriodo()}</p>
                {filtros.selRegional.length > 0 && (
                  <p style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
                    Regional: {filtros.selRegional.join(', ')}
                  </p>
                )}
                {filtros.selSupOp.length > 0 && (
                  <p style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
                    Sup. Operacional: {filtros.selSupOp.join(', ')}
                  </p>
                )}
                {filtros.selSupCampo.length > 0 && (
                  <p style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
                    Sup. Campo: {filtros.selSupCampo.join(', ')}
                  </p>
                )}
                {isMulti && (
                  <p style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>
                    Prefixos: {prefixosFiltrados.join(' · ')}
                  </p>
                )}
                {eletricistas.length > 0 && (
                  <p style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                    👷 {eletricistas.slice(0, 8).join(' · ')}{eletricistas.length > 8 ? ` +${eletricistas.length - 8}` : ''}
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
                  }}>{tend.label}</div>
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

          {/* Ranking de equipes (só aparece se for multi-equipe) */}
          {isMulti && rankingEquipes.length > 1 && (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ background: '#7c2d12', color: '#fff', padding: '12px 18px' }}>
                <p style={{ fontSize: 13, fontWeight: 700 }}>🏆 Ranking das Equipes ({rankingEquipes.length})</p>
              </div>
              {rankingEquipes.map((e, idx) => {
                const sc = e.media >= 90 ? STATUS_COR['ATENDE']
                         : e.media >= 80 ? STATUS_COR['ATENDE PARCIAL']
                         : STATUS_COR['NÃO ATENDE']
                const pctConf = e.total > 0 ? Math.round((e.atende / e.total) * 100) : 0
                return (
                  <div key={e.prefixo} style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '12px 16px', borderBottom: idx < rankingEquipes.length - 1 ? '1px solid #f1f5f9' : 'none',
                    background: idx === 0 ? '#f0fdf4' : idx === rankingEquipes.length - 1 ? '#fff7f7' : '#fff',
                  }}>
                    <div style={{
                      minWidth: 30, height: 30, borderRadius: '50%', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13,
                      background: idx === 0 ? '#fbbf24' : idx === 1 ? '#e2e8f0' : idx === 2 ? '#d97706' : '#f1f5f9',
                      color:      idx === 0 ? '#7c2d12' : idx === 1 ? '#475569' : idx === 2 ? '#fff'    : '#64748b',
                    }}>
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{e.prefixo}</div>
                      <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#64748b', marginTop: 2, flexWrap: 'wrap' }}>
                        <span>{e.total} aud.</span>
                        <span style={{ color: '#15803d' }}>✅ {e.atende}</span>
                        <span style={{ color: '#d97706' }}>⚠️ {e.parcial}</span>
                        <span style={{ color: '#dc2626' }}>❌ {e.nao}</span>
                        <span>· {pctConf}% conf.</span>
                      </div>
                    </div>
                    <div style={{
                      minWidth: 50, height: 44, borderRadius: 10,
                      background: sc.bg, border: `1.5px solid ${sc.border}`,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: 15, fontWeight: 900, color: sc.color, lineHeight: 1 }}>{e.media}</span>
                      <span style={{ fontSize: 8, color: sc.color, opacity: 0.8 }}>média</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Evolução de notas — linha do tempo */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px', marginBottom: 20 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 14 }}>
              📊 Evolução das Notas (ordem cronológica)
            </p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80, overflowX: 'auto', paddingBottom: 4 }}>
              {auditorias.map((a) => {
                const nota = Number(a.nota)
                const h    = Math.max(8, (nota / 100) * 80)
                const cor  = nota >= 90 ? '#16a34a' : nota >= 80 ? '#d97706' : '#dc2626'
                return (
                  <div key={a.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 36 }}>
                    <span style={{ fontSize: 9, color: '#64748b', marginBottom: 2 }}>{nota.toFixed(0)}</span>
                    <div style={{ width: 28, height: h, background: cor, borderRadius: '4px 4px 0 0' }} title={`${a.prefixo} — ${formatData(a.data_auditoria)} — ${nota} pts`} />
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
                    <span style={{ fontSize: 12, color: '#991b1b', flex: 1 }}>Item #{id}</span>
                    <span style={{
                      background: '#dc2626', color: '#fff',
                      padding: '2px 10px', borderRadius: 20,
                      fontSize: 12, fontWeight: 700, flexShrink: 0,
                    }}>{count}x não conforme</span>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                        #{idx + 1} — {isMulti && <span style={{ color: '#c2410c' }}>{a.prefixo} · </span>}{formatData(a.data_auditoria)} às {a.hora_auditoria}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px',
                        borderRadius: 20, background: sc.bg, color: sc.color,
                        border: `1px solid ${sc.border}`,
                      }}>{a.status}</span>
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
                      }}>{Number(a.nota).toFixed(0)} pts</span>
                    </div>
                  </div>

                  {(a.nome_eletricista || a.nome_eletricista2) && (
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: a.feedback ? 8 : 0 }}>
                      👷 {[a.nome_eletricista, a.nome_eletricista2].filter(Boolean).join(' · ')}
                    </div>
                  )}

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

          {/* Info das equipes (cadastro) */}
          {equipeInfo.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px', marginBottom: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12 }}>
                👷 Composição das Equipes (Cadastro) — {equipeInfo.length} registros
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {equipeInfo.map((e, i) => (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '90px 1fr 110px 130px 90px', gap: 10, fontSize: 12, color: '#475569',
                    padding: '8px 12px', background: i % 2 === 0 ? '#f8fafc' : '#fff',
                    borderRadius: 8, alignItems: 'center',
                  }}>
                    <span style={{ fontWeight: 800, color: '#c2410c' }}>{e.prefixo}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <strong style={{ color: '#1e293b' }}>{e.matricula}</strong> · {e.colaborador}
                    </span>
                    <span style={{ color: '#94a3b8', fontSize: 11 }}>{e.base}</span>
                    <span style={{ color: '#94a3b8', fontSize: 11 }}>{e.superv_campo}</span>
                    <span style={{ color: '#94a3b8', fontSize: 11 }}>{e.placas}</span>
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
