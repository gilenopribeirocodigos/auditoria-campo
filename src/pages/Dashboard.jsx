import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

function calcMesAtual() {
  const hoje = new Date()
  const ini  = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0]
  const fim  = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0]
  return { ini, fim }
}

function mesLabel(mesAno) {
  const [ano, mes] = mesAno.split('-')
  const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${nomes[parseInt(mes) - 1]}/${ano}`
}

function notaCor(nota) {
  if (nota >= 90) return { color: '#15803d', bg: '#dcfce7', border: '#86efac' }
  if (nota >= 80) return { color: '#d97706', bg: '#fef3c7', border: '#fcd34d' }
  return                 { color: '#dc2626', bg: '#fee2e2', border: '#fca5a5' }
}

function conceito(nota) {
  if (nota >= 90) return { label: '🏆 Excelente', color: '#15803d' }
  if (nota >= 80) return { label: '✅ Bom',       color: '#1d4ed8' }
  if (nota >= 70) return { label: '⚠️ Regular',   color: '#d97706' }
  return                 { label: '❌ Crítico',    color: '#dc2626' }
}

export default function Dashboard({ usuarioLogado, onVoltar }) {
  const [mesAno,    setMesAno]    = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [dados,     setDados]     = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [abaRanking, setAbaRanking] = useState('equipes') // 'equipes' | 'fiscais'

  const mesesOpcoes = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - 5 + i)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const carregar = async () => {
    setLoading(true)
    try {
      const [ano, mes] = mesAno.split('-')
      const ini = `${ano}-${mes}-01`
      const fim = new Date(parseInt(ano), parseInt(mes), 0).toISOString().split('T')[0]

      const { data: auds } = await supabase
        .from('auditorias').select('*')
        .gte('data_auditoria', ini)
        .lte('data_auditoria', fim)
        .order('data_auditoria')

      if (!auds) { setDados(null); return }

      // ---- KPIs gerais ----
      const total     = auds.length
      const atende    = auds.filter(a => a.status === 'ATENDE').length
      const parcial   = auds.filter(a => a.status === 'ATENDE PARCIAL').length
      const naoAtende = auds.filter(a => a.status === 'NÃO ATENDE').length
      const notaMedia = total > 0
        ? (auds.reduce((s, a) => s + Number(a.nota), 0) / total).toFixed(1)
        : '—'
      const pctConformidade = total > 0 ? Math.round((atende / total) * 100) : 0

      // ---- Ranking equipes ----
      const mapaEq = {}
      auds.forEach(a => {
        if (!a.prefixo) return
        if (!mapaEq[a.prefixo]) mapaEq[a.prefixo] = { prefixo: a.prefixo, notas: [], total: 0, atende: 0, nao: 0 }
        mapaEq[a.prefixo].notas.push(Number(a.nota))
        mapaEq[a.prefixo].total++
        if (a.status === 'ATENDE') mapaEq[a.prefixo].atende++
        if (a.status === 'NÃO ATENDE') mapaEq[a.prefixo].nao++
      })
      const rankingEquipes = Object.values(mapaEq).map(e => ({
        ...e,
        media: (e.notas.reduce((s, n) => s + n, 0) / e.notas.length).toFixed(1),
      })).sort((a, b) => Number(b.media) - Number(a.media))

      // ---- Ranking fiscais ----
      const mapaFi = {}
      auds.forEach(a => {
        if (!a.fiscal) return
        if (!mapaFi[a.fiscal]) mapaFi[a.fiscal] = { fiscal: a.fiscal, notas: [], total: 0, atende: 0, nao: 0 }
        mapaFi[a.fiscal].notas.push(Number(a.nota))
        mapaFi[a.fiscal].total++
        if (a.status === 'ATENDE') mapaFi[a.fiscal].atende++
        if (a.status === 'NÃO ATENDE') mapaFi[a.fiscal].nao++
      })
      const rankingFiscais = Object.values(mapaFi).map(f => ({
        ...f,
        media: (f.notas.reduce((s, n) => s + n, 0) / f.notas.length).toFixed(1),
      })).sort((a, b) => Number(b.media) - Number(a.media))

      // ---- Evolução semanal ----
      const semanas = {}
      auds.forEach(a => {
        const d    = new Date(a.data_auditoria + 'T00:00:00')
        const sem  = `S${Math.ceil(d.getDate() / 7)}`
        if (!semanas[sem]) semanas[sem] = { notas: [], total: 0 }
        semanas[sem].notas.push(Number(a.nota))
        semanas[sem].total++
      })
      const evolucao = Object.entries(semanas).map(([sem, v]) => ({
        sem,
        media: (v.notas.reduce((s, n) => s + n, 0) / v.notas.length).toFixed(1),
        total: v.total,
      }))

      // ---- Distribuição por tipo de serviço ----
      const tipoServico = {}
      auds.forEach(a => {
        if (!a.tipo_servico) return
        if (!tipoServico[a.tipo_servico]) tipoServico[a.tipo_servico] = { total: 0, atende: 0 }
        tipoServico[a.tipo_servico].total++
        if (a.status === 'ATENDE') tipoServico[a.tipo_servico].atende++
      })

      setDados({ total, atende, parcial, naoAtende, notaMedia, pctConformidade, rankingEquipes, rankingFiscais, evolucao, tipoServico })
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, [mesAno])

  const TIPO_EMOJI = { CORTE: '✂️', ANEXO: '🔌', RELIGA: '⚡' }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1e3a5f, #1d4ed8)', padding: '18px 20px', color: '#fff' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14,
          }}>← Voltar para Home</button>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800 }}>📊 Dashboard — Ranking Operacional</h1>
              <p style={{ fontSize: 12, opacity: 0.8, marginTop: 3 }}>
                Visão consolidada do desempenho de equipes e fiscais
              </p>
            </div>
            <select value={mesAno} onChange={e => setMesAno(e.target.value)} style={{
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff', padding: '9px 16px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>
              {mesesOpcoes.map(m => (
                <option key={m} value={m} style={{ color: '#1e293b', background: '#fff' }}>
                  {mesLabel(m)}{m === mesAno ? ' ← atual' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '20px 16px 60px' }}>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: '#64748b' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
            <p style={{ fontSize: 16 }}>Carregando dashboard...</p>
          </div>
        ) : !dados || dados.total === 0 ? (
          <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
            <p style={{ fontSize: 16, marginBottom: 8 }}>Nenhuma auditoria em {mesLabel(mesAno)}.</p>
            <p style={{ fontSize: 13 }}>Selecione outro mês ou aguarde as auditorias serem realizadas.</p>
          </div>
        ) : (
          <>
            {/* ===== KPIs ===== */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Total Auditorias', val: dados.total,            icon: '📋', color: '#1e3a5f', bg: '#eff6ff' },
                { label: 'Nota Média',        val: dados.notaMedia,        icon: '📊', color: '#7c3aed', bg: '#f5f3ff' },
                { label: '% Conformidade',    val: `${dados.pctConformidade}%`, icon: '✅', color: '#15803d', bg: '#f0fdf4' },
                { label: 'Atende',            val: dados.atende,           icon: '🟢', color: '#15803d', bg: '#dcfce7' },
                { label: 'Atende Parcial',    val: dados.parcial,          icon: '🟡', color: '#d97706', bg: '#fef9c3' },
                { label: 'Não Atende',        val: dados.naoAtende,        icon: '🔴', color: '#dc2626', bg: '#fee2e2' },
              ].map(k => (
                <div key={k.label} style={{
                  background: k.bg, borderRadius: 14, padding: '16px',
                  border: `1.5px solid ${k.color}22`, textAlign: 'center',
                }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>{k.icon}</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.val}</div>
                  <div style={{ fontSize: 11, color: k.color, fontWeight: 600, marginTop: 4, opacity: 0.8 }}>{k.label}</div>
                </div>
              ))}
            </div>

            {/* ===== BARRA DE CONFORMIDADE GERAL ===== */}
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '18px', marginBottom: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12 }}>
                📈 Distribuição de Resultados — {mesLabel(mesAno)}
              </p>
              <div style={{ display: 'flex', height: 28, borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
                {dados.total > 0 && [
                  { val: dados.atende,    color: '#16a34a', label: 'Atende' },
                  { val: dados.parcial,   color: '#d97706', label: 'Parcial' },
                  { val: dados.naoAtende, color: '#dc2626', label: 'Não Atende' },
                ].map(b => b.val > 0 && (
                  <div key={b.label} style={{
                    width: `${(b.val / dados.total) * 100}%`,
                    background: b.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, color: '#fff', fontWeight: 700,
                    transition: 'width 0.5s',
                  }}>
                    {Math.round((b.val / dados.total) * 100)}%
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
                <span>🟢 Atende: <strong style={{ color: '#15803d' }}>{dados.atende}</strong></span>
                <span>🟡 Parcial: <strong style={{ color: '#d97706' }}>{dados.parcial}</strong></span>
                <span>🔴 Não Atende: <strong style={{ color: '#dc2626' }}>{dados.naoAtende}</strong></span>
              </div>
            </div>

            {/* ===== EVOLUÇÃO SEMANAL + TIPO DE SERVIÇO ===== */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

              {/* Evolução semanal */}
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '18px' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 16 }}>
                  📅 Evolução Semanal
                </p>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 100 }}>
                  {dados.evolucao.map((s, i) => {
                    const h   = Math.max(10, (Number(s.media) / 100) * 100)
                    const cor = Number(s.media) >= 90 ? '#16a34a' : Number(s.media) >= 80 ? '#d97706' : '#dc2626'
                    return (
                      <div key={s.sem} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>{s.media}</span>
                        <div style={{
                          width: '100%', height: h, background: cor,
                          borderRadius: '4px 4px 0 0', position: 'relative',
                        }} />
                        <span style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>{s.sem}</span>
                        <span style={{ fontSize: 9, color: '#cbd5e1' }}>{s.total} aud.</span>
                      </div>
                    )
                  })}
                  {dados.evolucao.length === 0 && (
                    <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', width: '100%' }}>Sem dados</p>
                  )}
                </div>
              </div>

              {/* Por tipo de serviço */}
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '18px' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 16 }}>
                  🔧 Por Tipo de Serviço
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {Object.entries(dados.tipoServico).map(([tipo, v]) => {
                    const pct = Math.round((v.atende / v.total) * 100)
                    const cor = pct >= 90 ? '#16a34a' : pct >= 70 ? '#d97706' : '#dc2626'
                    return (
                      <div key={tipo}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                            {TIPO_EMOJI[tipo] || '📋'} {tipo}
                          </span>
                          <span style={{ fontSize: 12, color: cor, fontWeight: 700 }}>
                            {pct}% conf. · {v.total} aud.
                          </span>
                        </div>
                        <div style={{ background: '#f1f5f9', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: 8, background: cor, borderRadius: 4, transition: 'width 0.5s' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* ===== RANKING ===== */}
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 20 }}>

              {/* Abas */}
              <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
                {[
                  { id: 'equipes', label: '🚗 Ranking de Equipes' },
                  { id: 'fiscais', label: '👤 Ranking de Fiscais' },
                ].map(a => (
                  <button key={a.id} onClick={() => setAbaRanking(a.id)} style={{
                    flex: 1, padding: '14px', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700,
                    background: abaRanking === a.id ? '#1e3a5f' : '#f8fafc',
                    color:      abaRanking === a.id ? '#fff'    : '#64748b',
                    borderBottom: abaRanking === a.id ? '3px solid #3b82f6' : '3px solid transparent',
                    transition: 'all 0.2s',
                  }}>
                    {a.label}
                  </button>
                ))}
              </div>

              {/* Legenda */}
              <div style={{ padding: '10px 18px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', fontSize: 11, color: '#64748b', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <span>🏆 Top 3 = melhores notas médias do período</span>
                <span>⚠️ Últimos 3 = atenção necessária</span>
              </div>

              {/* Lista */}
              <div>
                {(abaRanking === 'equipes' ? dados.rankingEquipes : dados.rankingFiscais).map((item, idx) => {
                  const media  = Number(item.media)
                  const cor    = notaCor(media)
                  const conc   = conceito(media)
                  const isTop  = idx < 3
                  const isBot  = idx >= (abaRanking === 'equipes' ? dados.rankingEquipes : dados.rankingFiscais).length - 3
                  const pctConf = item.total > 0 ? Math.round((item.atende / item.total) * 100) : 0

                  return (
                    <div key={abaRanking === 'equipes' ? item.prefixo : item.fiscal} style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '14px 18px',
                      borderBottom: '1px solid #f1f5f9',
                      background: isTop ? '#f0fdf4' : isBot ? '#fff7f7' : '#fff',
                    }}>
                      {/* Posição */}
                      <div style={{
                        minWidth: 32, height: 32, borderRadius: '50%', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14,
                        background: idx === 0 ? '#fbbf24' : idx === 1 ? '#e2e8f0' : idx === 2 ? '#d97706' : cor.bg,
                        color:      idx === 0 ? '#7c2d12' : idx === 1 ? '#475569' : idx === 2 ? '#fff'    : cor.color,
                      }}>
                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                      </div>

                      {/* Nome + barra */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {abaRanking === 'equipes' ? item.prefixo : item.fiscal}
                          </span>
                          <span style={{ fontSize: 11, color: conc.color, fontWeight: 700, marginLeft: 8, flexShrink: 0 }}>
                            {conc.label}
                          </span>
                        </div>
                        <div style={{ background: '#f1f5f9', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                          <div style={{
                            width: `${media}%`, height: 6, borderRadius: 4,
                            background: cor.color, transition: 'width 0.5s',
                          }} />
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11, color: '#94a3b8' }}>
                          <span>{item.total} auditoria{item.total > 1 ? 's' : ''}</span>
                          <span>✅ {pctConf}% conf.</span>
                          <span style={{ color: '#dc2626' }}>❌ {item.nao} n/a</span>
                        </div>
                      </div>

                      {/* Nota */}
                      <div style={{
                        minWidth: 52, height: 52, borderRadius: 12,
                        background: cor.bg, border: `1.5px solid ${cor.border}`,
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ fontSize: 18, fontWeight: 900, color: cor.color, lineHeight: 1 }}>
                          {item.media}
                        </span>
                        <span style={{ fontSize: 9, color: cor.color, opacity: 0.8 }}>média</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Rodapé */}
            <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>
              DPL Construções — Contrato Equatorial Energia 1021/2024 · Atualizado em {new Date().toLocaleString('pt-BR')}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
