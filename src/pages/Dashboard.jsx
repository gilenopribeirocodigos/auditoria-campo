import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  useFiltrosOperacionais,
  PainelFiltros,
  calcMesAtual,
  mesLabel,
} from '../components/PainelFiltros.jsx'

// ─── Helpers visuais (específicos do Dashboard) ─────────────────────────────
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

function barColor(pct) {
  if (pct >= 100) return '#16a34a'
  if (pct >= 70)  return '#d97706'
  return '#dc2626'
}

function conceitoMeta(notaMedia) {
  if (notaMedia === '—' || notaMedia === null) return null
  const n = parseFloat(notaMedia)
  if (n >= 90) return { label: 'Excelente', emoji: '🏆', bg: '#dcfce7', color: '#15803d' }
  if (n >= 80) return { label: 'Bom',       emoji: '✅', bg: '#dbeafe', color: '#1d4ed8' }
  if (n >= 70) return { label: 'Regular',   emoji: '⚠️', bg: '#fef3c7', color: '#92400e' }
  return             { label: 'Crítico',    emoji: '❌', bg: '#fee2e2', color: '#dc2626' }
}

function diasUteisMes(mesAno, feriados = []) {
  const [ano, mes] = mesAno.split('-').map(Number)
  const diasNoMes  = new Date(ano, mes, 0).getDate()
  let uteis = 0
  for (let d = 1; d <= diasNoMes; d++) {
    const data = new Date(ano, mes - 1, d)
    const diaSemana = data.getDay()
    if (diaSemana === 0 || diaSemana === 6) continue
    const dataStr = `${ano}-${String(mes).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    if (feriados.includes(dataStr)) continue
    uteis++
  }
  return uteis
}

function hojeStr() {
  return new Date().toISOString().split('T')[0]
}

const TIPO_EMOJI = { CORTE: '✂️', ANEXO: '🔌', RELIGA: '⚡', EMERGENCIAL: '🚒' }

// ─── Componente principal ───────────────────────────────────────────────────
export default function Dashboard({ usuarioLogado, onVoltar }) {
  // Hook do painel — gerencia: modoPeriodo, mesAno, dataIni/Fim,
  // selSupOp, selSupCampo, selPrefixos + cascatas + mapPrefixo + filtrar()
  // Passa `usuarioLogado` pra ativar SEGREGAÇÃO POR ESTRUTURA automática:
  // o filtros.filtrar() já aplica a restrição de prefixos permitidos.
  const filtros = useFiltrosOperacionais({ inicializarMes: true, usuarioLogado })

  const [abaAtiva, setAbaAtiva] = useState('meta_dia')
  const [loading,  setLoading]  = useState(true)

  // ── dados raw (vindos do banco) ───────────────────────────────────────────
  const [audsRaw,        setAudsRaw]        = useState([])
  const [audsHojeRaw,    setAudsHojeRaw]    = useState([])
  const [fiscais,        setFiscais]        = useState([])
  const [metas,          setMetas]          = useState([])
  const [feriadosLista,  setFeriadosLista]  = useState([])
  const [feriados,       setFeriados]       = useState([])

  // ── Carrega tudo em paralelo ──────────────────────────────────────────────
  const carregar = async () => {
    setLoading(true)
    try {
      const { ini, fim } = filtros.getDatasQuery()
      if (!ini || !fim) { setLoading(false); return }

      const [
        { data: auds },
        { data: audsHoje },
        { data: fData },
        { data: mData },
        { data: ferData },
      ] = await Promise.all([
        supabase.from('auditorias').select('*').gte('data_auditoria', ini).lte('data_auditoria', fim).order('data_auditoria'),
        supabase.from('auditorias').select('fiscal, status, nota, data_auditoria, prefixo').eq('data_auditoria', hojeStr()),
        supabase.from('usuarios').select('nome, login, matricula').in('status', ['ATIVO', 'RESERVA']).order('nome'),
        supabase.from('metas_fiscal').select('*').eq('mes_ano', filtros.mesAno),
        supabase.from('feriados').select('*').order('data'),
      ])

      setAudsRaw(auds || [])
      setAudsHojeRaw(audsHoje || [])
      setFiscais(fData || [])
      setMetas(mData || [])
      setFeriadosLista(ferData || [])
      setFeriados((ferData || []).map(f => f.data))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (filtros.modoPeriodo && !filtros.dataIni) return
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.mesAno, filtros.modoPeriodo, filtros.dataIni, filtros.dataFim])

  // ── auditorias FILTRADAS (filtros.filtrar aplica Sup. Op + Sup. Campo + Prefixo + SEGREGAÇÃO) ──
  const realizadas     = useMemo(() => filtros.filtrar(audsRaw),
    [audsRaw, filtros.selRegional, filtros.selSupOp, filtros.selSupCampo, filtros.selPrefixos, filtros.mapPrefixo, filtros.prefixosPermitidos])
  const realizadasHoje = useMemo(() => filtros.filtrar(audsHojeRaw),
    [audsHojeRaw, filtros.selRegional, filtros.selSupOp, filtros.selSupCampo, filtros.selPrefixos, filtros.mapPrefixo, filtros.prefixosPermitidos])

  const filtroHierarquicoAtivo =
    filtros.selRegional.length > 0 ||
    filtros.selSupOp.length    > 0 ||
    filtros.selSupCampo.length > 0 ||
    filtros.selPrefixos.length > 0

  // ── computa "dados" (ranking, KPIs, evolução, tipo) ───────────────────────
  const dados = useMemo(() => {
    const auds = realizadas
    if (!auds || auds.length === 0) return null

    const total     = auds.length
    const atende    = auds.filter(a => a.status === 'ATENDE').length
    const parcial   = auds.filter(a => a.status === 'ATENDE PARCIAL').length
    const naoAtende = auds.filter(a => a.status === 'NÃO ATENDE').length
    const notaMedia = total > 0 ? (auds.reduce((s, a) => s + Number(a.nota), 0) / total).toFixed(1) : '—'
    const pctConformidade = total > 0 ? Math.round((atende / total) * 100) : 0

    const mapaEq = {}
    auds.forEach(a => {
      if (!a.prefixo) return
      if (!mapaEq[a.prefixo]) mapaEq[a.prefixo] = { prefixo: a.prefixo, notas: [], total: 0, atende: 0, nao: 0 }
      mapaEq[a.prefixo].notas.push(Number(a.nota))
      mapaEq[a.prefixo].total++
      if (a.status === 'ATENDE')     mapaEq[a.prefixo].atende++
      if (a.status === 'NÃO ATENDE') mapaEq[a.prefixo].nao++
    })
    const rankingEquipes = Object.values(mapaEq).map(e => ({
      ...e, media: (e.notas.reduce((s, n) => s + n, 0) / e.notas.length).toFixed(1),
    })).sort((a, b) => Number(b.media) - Number(a.media))

    const mapaFi = {}
    auds.forEach(a => {
      if (!a.fiscal) return
      if (!mapaFi[a.fiscal]) mapaFi[a.fiscal] = { fiscal: a.fiscal, notas: [], total: 0, atende: 0, nao: 0 }
      mapaFi[a.fiscal].notas.push(Number(a.nota))
      mapaFi[a.fiscal].total++
      if (a.status === 'ATENDE')     mapaFi[a.fiscal].atende++
      if (a.status === 'NÃO ATENDE') mapaFi[a.fiscal].nao++
    })
    const rankingFiscais = Object.values(mapaFi).map(f => ({
      ...f, media: (f.notas.reduce((s, n) => s + n, 0) / f.notas.length).toFixed(1),
    })).sort((a, b) => Number(b.media) - Number(a.media))

    const semanas = {}
    auds.forEach(a => {
      const d   = new Date(a.data_auditoria + 'T00:00:00')
      const sem = `S${Math.ceil(d.getDate() / 7)}`
      if (!semanas[sem]) semanas[sem] = { notas: [], total: 0 }
      semanas[sem].notas.push(Number(a.nota))
      semanas[sem].total++
    })
    const evolucao = Object.entries(semanas).map(([sem, v]) => ({
      sem, total: v.total,
      media: (v.notas.reduce((s, n) => s + n, 0) / v.notas.length).toFixed(1),
    }))

    const tipoServico = {}
    auds.forEach(a => {
      if (!a.tipo_servico) return
      if (!tipoServico[a.tipo_servico]) tipoServico[a.tipo_servico] = { total: 0, atende: 0 }
      tipoServico[a.tipo_servico].total++
      if (a.status === 'ATENDE') tipoServico[a.tipo_servico].atende++
    })

    return { total, atende, parcial, naoAtende, notaMedia, pctConformidade, rankingEquipes, rankingFiscais, evolucao, tipoServico }
  }, [realizadas])

  // ── computed metas ────────────────────────────────────────────────────────
  const diasUteis         = diasUteisMes(filtros.mesAno || calcMesAtual(), feriados)
  const feriadosDoMes     = feriadosLista.filter(f => f.data.startsWith(filtros.mesAno || ''))
  const dataHojeFormatada = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })

  const dadosFiscais = useMemo(() => {
    return fiscais.map(f => {
      const metaObj    = metas.find(m => m.fiscal_login === f.login)
      const meta       = metaObj?.meta ?? 0
      const metaDia    = meta > 0 && diasUteis > 0 ? Math.ceil(meta / diasUteis) : 0
      const auds       = realizadas.filter(a => a.fiscal === f.nome)
      const audsHoje   = realizadasHoje.filter(a => a.fiscal === f.nome)
      const total      = auds.length
      const totalHoje  = audsHoje.length
      const atende     = auds.filter(a => a.status === 'ATENDE').length
      const parcial    = auds.filter(a => a.status === 'ATENDE PARCIAL').length
      const nao        = auds.filter(a => a.status === 'NÃO ATENDE').length
      const notaMedia  = auds.length > 0 ? (auds.reduce((acc, a) => acc + Number(a.nota), 0) / auds.length).toFixed(1) : '—'
      const notaHoje   = audsHoje.length > 0 ? (audsHoje.reduce((acc, a) => acc + Number(a.nota), 0) / audsHoje.length).toFixed(1) : '—'
      const pct        = meta > 0 ? Math.round((total / meta) * 100) : 0
      const pctHoje    = metaDia > 0 ? Math.round((totalHoje / metaDia) * 100) : 0
      const faltam     = Math.max(0, meta - total)
      const faltamHoje = Math.max(0, metaDia - totalHoje)
      return { ...f, meta, metaDia, total, totalHoje, atende, parcial, nao, notaMedia, notaHoje, pct, pctHoje, faltam, faltamHoje }
    })
    .filter(f => filtroHierarquicoAtivo
      ? (f.total > 0 || f.totalHoje > 0)
      : (f.meta > 0 || f.total > 0 || f.totalHoje > 0))
  }, [fiscais, metas, realizadas, realizadasHoje, diasUteis, filtroHierarquicoAtivo])

  const totalMeta      = dadosFiscais.reduce((a, f) => a + f.meta, 0)
  const totalFeito     = dadosFiscais.reduce((a, f) => a + f.total, 0)
  const pctGeral       = totalMeta > 0 ? Math.round((totalFeito / totalMeta) * 100) : 0
  const totalMetaHoje  = dadosFiscais.reduce((a, f) => a + f.metaDia, 0)
  const totalFeitoHoje = dadosFiscais.reduce((a, f) => a + f.totalHoje, 0)
  const pctGeralHoje   = totalMetaHoje > 0 ? Math.round((totalFeitoHoje / totalMetaHoje) * 100) : 0

  // ── abas ─────────────────────────────────────────────────────────────────
  const abas = [
    { id: 'meta_dia', label: '📅 Meta do Dia'     },
    { id: 'meta_mes', label: '📊 Meta do Mês'     },
    { id: 'equipes',  label: '🚗 Ranking Equipes' },
    { id: 'fiscais',  label: '👤 Ranking Fiscais' },
  ]

  // ── bloco ranking ─────────────────────────────────────────────────────────
  const blocoRanking = (tipo) => {
    const lista = tipo === 'equipes' ? dados?.rankingEquipes : dados?.rankingFiscais
    if (!lista) return null
    return lista.map((item, idx) => {
      const media   = Number(item.media)
      const cor     = notaCor(media)
      const conc    = conceito(media)
      const isTop   = idx < 3
      const isBot   = idx >= lista.length - 3
      const pctConf = item.total > 0 ? Math.round((item.atende / item.total) * 100) : 0
      const key     = tipo === 'equipes' ? item.prefixo : item.fiscal
      return (
        <div key={key} style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '14px 18px', borderBottom: '1px solid #f1f5f9',
          background: isTop ? '#f0fdf4' : isBot ? '#fff7f7' : '#fff',
        }}>
          <div style={{
            minWidth: 32, height: 32, borderRadius: '50%', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14,
            background: idx === 0 ? '#fbbf24' : idx === 1 ? '#e2e8f0' : idx === 2 ? '#d97706' : cor.bg,
            color:      idx === 0 ? '#7c2d12' : idx === 1 ? '#475569' : idx === 2 ? '#fff'    : cor.color,
          }}>
            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{key}</span>
              <span style={{ fontSize: 11, color: conc.color, fontWeight: 700, marginLeft: 8, flexShrink: 0 }}>{conc.label}</span>
            </div>
            <div style={{ background: '#f1f5f9', borderRadius: 4, height: 6, overflow: 'hidden' }}>
              <div style={{ width: `${media}%`, height: 6, borderRadius: 4, background: cor.color, transition: 'width 0.5s' }} />
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11, color: '#94a3b8' }}>
              <span>{item.total} auditoria{item.total > 1 ? 's' : ''}</span>
              <span>✅ {pctConf}% conf.</span>
              <span style={{ color: '#dc2626' }}>❌ {item.nao} n/a</span>
            </div>
          </div>
          <div style={{
            minWidth: 52, height: 52, borderRadius: 12,
            background: cor.bg, border: `1.5px solid ${cor.border}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: cor.color, lineHeight: 1 }}>{item.media}</span>
            <span style={{ fontSize: 9, color: cor.color, opacity: 0.8 }}>média</span>
          </div>
        </div>
      )
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)', padding: '18px 20px', color: '#fff' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14,
          }}>← Voltar para Home</button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800 }}>📊 Dashboard — Ranking Operacional</h1>
            <p style={{ fontSize: 12, opacity: 0.8, marginTop: 3 }}>
              Visão consolidada do desempenho de equipes e fiscais
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
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '20px 16px 60px' }}>

        {/* ═══ PAINEL DE FILTROS (componente reutilizável) ═══ */}
        <PainelFiltros
          filtros={filtros}
          titulo="🔍 Filtros do Dashboard"
          badge="aplica em todas as abas"
        />

        {/* Abas */}
        <div style={{ display: 'flex', marginBottom: 20, background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {abas.map(a => (
            <button key={a.id} onClick={() => setAbaAtiva(a.id)} style={{
              flex: 1, padding: '13px 6px', border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700,
              background: abaAtiva === a.id ? '#1e3a5f' : '#fff',
              color:      abaAtiva === a.id ? '#fff'    : '#64748b',
              borderBottom: abaAtiva === a.id ? '3px solid #3b82f6' : '3px solid transparent',
              transition: 'all 0.2s',
            }}>{a.label}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: '#64748b' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
            <p style={{ fontSize: 16 }}>Carregando...</p>
          </div>
        ) : (
          <>

            {/* ══════════════ ABA META DO DIA ══════════════ */}
            {abaAtiva === 'meta_dia' && (
              <>
                <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '14px 16px', marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Progresso de Hoje</p>
                      <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, textTransform: 'capitalize' }}>{dataHojeFormatada}</p>
                    </div>
                    <span style={{ fontSize: 18, fontWeight: 900, color: barColor(pctGeralHoje) }}>
                      {totalFeitoHoje}/{totalMetaHoje} ({pctGeralHoje}%)
                    </span>
                  </div>
                  <div style={{ background: '#f1f5f9', borderRadius: 6, height: 12, overflow: 'hidden' }}>
                    <div style={{ height: 12, borderRadius: 6, width: `${Math.min(pctGeralHoje, 100)}%`, background: barColor(pctGeralHoje), transition: 'width 0.5s' }} />
                  </div>
                  <p style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
                    Meta diária baseada em {diasUteis} dias úteis em {mesLabel(filtros.mesAno || calcMesAtual())}
                    {feriadosDoMes.length > 0 && ` (${feriadosDoMes.length} feriado(s) descontado(s))`}
                  </p>
                </div>

                {dadosFiscais.filter(f => f.meta > 0).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
                    <p>{filtroHierarquicoAtivo
                      ? 'Nenhum fiscal com auditorias para os filtros selecionados.'
                      : `Nenhuma meta cadastrada para ${mesLabel(filtros.mesAno || calcMesAtual())}.`}</p>
                    {!filtroHierarquicoAtivo && <p style={{ fontSize: 12, marginTop: 8 }}>Acesse <strong>Metas por Fiscal</strong> para cadastrar.</p>}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {dadosFiscais.filter(f => f.meta > 0).sort((a, b) => b.pctHoje - a.pctHoje).map(f => (
                      <div key={f.login} style={{
                        background: '#fff', borderRadius: 14,
                        border: `1.5px solid ${f.pctHoje >= 100 ? '#86efac' : f.totalHoje > 0 ? '#fcd34d' : '#fca5a5'}`,
                        padding: '14px 16px',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div>
                            <p style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 2 }}>{f.nome}</p>
                            <p style={{ fontSize: 11, color: '#94a3b8' }}>{f.login}</p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 22, fontWeight: 900, color: barColor(f.pctHoje), lineHeight: 1 }}>{f.pctHoje}%</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{f.totalHoje}/{f.metaDia} hoje</div>
                          </div>
                        </div>
                        <div style={{ background: '#f1f5f9', borderRadius: 6, height: 10, overflow: 'hidden', marginBottom: 10 }}>
                          <div style={{ height: 10, borderRadius: 6, width: `${Math.min(f.pctHoje, 100)}%`, background: barColor(f.pctHoje), transition: 'width 0.5s' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
                          <span>📋 Meta dia: <strong>{f.metaDia}</strong></span>
                          <span>✅ Feitas: <strong style={{ color: '#15803d' }}>{f.totalHoje}</strong></span>
                          {f.notaHoje !== '—' && <span>📊 Nota: <strong>{f.notaHoje}</strong></span>}
                          {f.faltamHoje > 0
                            ? <span style={{ color: '#dc2626', fontWeight: 700 }}>⏳ Faltam {f.faltamHoje}</span>
                            : <span style={{ color: '#15803d', fontWeight: 700 }}>🏆 Meta do dia atingida!</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ══════════════ ABA META DO MÊS ══════════════ */}
            {abaAtiva === 'meta_mes' && (
              <>
                <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px', marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Progresso — {filtros.periodoLabel}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: barColor(pctGeral) }}>{totalFeito}/{totalMeta} ({pctGeral}%)</span>
                  </div>
                  <div style={{ background: '#f1f5f9', borderRadius: 6, height: 12, overflow: 'hidden' }}>
                    <div style={{ height: 12, borderRadius: 6, width: `${Math.min(pctGeral, 100)}%`, background: barColor(pctGeral), transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
                    <span>✅ Atende: <strong>{realizadas.filter(a => a.status === 'ATENDE').length}</strong></span>
                    <span>⚠️ Parcial: <strong>{realizadas.filter(a => a.status === 'ATENDE PARCIAL').length}</strong></span>
                    <span>❌ Não Atende: <strong>{realizadas.filter(a => a.status === 'NÃO ATENDE').length}</strong></span>
                    <span>📊 Nota Média: <strong>{realizadas.length > 0 ? (realizadas.reduce((a, r) => a + Number(r.nota), 0) / realizadas.length).toFixed(1) : '—'}</strong></span>
                    <span>📅 Dias úteis: <strong>{diasUteis}{feriadosDoMes.length > 0 && ` (-${feriadosDoMes.length} feriados)`}</strong></span>
                  </div>
                </div>

                {dadosFiscais.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
                    <p style={{ marginBottom: 8 }}>{filtroHierarquicoAtivo
                      ? 'Nenhum fiscal com auditorias para os filtros selecionados.'
                      : `Nenhuma meta cadastrada para ${mesLabel(filtros.mesAno || calcMesAtual())}.`}</p>
                    {!filtroHierarquicoAtivo && <p style={{ fontSize: 12 }}>Acesse <strong>Metas por Fiscal</strong> para cadastrar.</p>}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {dadosFiscais.sort((a, b) => b.pct - a.pct).map(f => {
                      const c = conceitoMeta(f.notaMedia)
                      return (
                        <div key={f.login} style={{
                          background: '#fff', borderRadius: 14,
                          border: `1.5px solid ${f.pct >= 100 ? '#86efac' : f.pct >= 70 ? '#fcd34d' : '#fca5a5'}`,
                          padding: '16px',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                                <span style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>{f.nome}</span>
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>{f.login}</span>
                              </div>
                              {c && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: c.bg, color: c.color, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                                  {c.emoji} {c.label}<span style={{ fontWeight: 400, opacity: 0.8, marginLeft: 2 }}>· nota {f.notaMedia}</span>
                                </div>
                              )}
                            </div>
                            <div style={{ textAlign: 'right', marginLeft: 12 }}>
                              <div style={{ fontSize: 22, fontWeight: 900, color: barColor(f.pct), lineHeight: 1 }}>{f.pct}%</div>
                              <div style={{ fontSize: 10, color: '#64748b' }}>{f.total}/{f.meta} auditorias</div>
                            </div>
                          </div>
                          <div style={{ background: '#f1f5f9', borderRadius: 6, height: 10, overflow: 'hidden', marginBottom: 10 }}>
                            <div style={{ height: 10, borderRadius: 6, width: `${Math.min(f.pct, 100)}%`, background: barColor(f.pct), transition: 'width 0.5s' }} />
                          </div>
                          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
                            <span style={{ color: '#15803d', fontWeight: 600 }}>✅ {f.atende} Atende</span>
                            <span style={{ color: '#d97706', fontWeight: 600 }}>⚠️ {f.parcial} Parcial</span>
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>❌ {f.nao} Não Atende</span>
                            {f.faltam > 0 && <span style={{ color: '#dc2626', fontWeight: 700 }}>⏳ Faltam {f.faltam}</span>}
                            {f.pct >= 100 && <span style={{ color: '#15803d', fontWeight: 700 }}>🏆 Meta atingida!</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            {/* ══════════════ ABAS RANKING ══════════════ */}
            {(abaAtiva === 'equipes' || abaAtiva === 'fiscais') && (
              <>
                {!dados || dados.total === 0 ? (
                  <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
                    <p style={{ fontSize: 16, marginBottom: 8 }}>Nenhuma auditoria em {filtros.periodoLabel}{filtroHierarquicoAtivo ? ' para os filtros selecionados' : ''}.</p>
                    <p style={{ fontSize: 13 }}>Ajuste os filtros ou aguarde as auditorias serem realizadas.</p>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
                      {[
                        { label: 'Total Auditorias', val: dados.total,                 icon: '📋', color: '#1e3a5f', bg: '#eff6ff' },
                        { label: 'Nota Média',        val: dados.notaMedia,             icon: '📊', color: '#7c3aed', bg: '#f5f3ff' },
                        { label: '% Conformidade',    val: `${dados.pctConformidade}%`, icon: '✅', color: '#15803d', bg: '#f0fdf4' },
                        { label: 'Atende',            val: dados.atende,                icon: '🟢', color: '#15803d', bg: '#dcfce7' },
                        { label: 'Atende Parcial',    val: dados.parcial,               icon: '🟡', color: '#d97706', bg: '#fef9c3' },
                        { label: 'Não Atende',        val: dados.naoAtende,             icon: '🔴', color: '#dc2626', bg: '#fee2e2' },
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

                    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '18px', marginBottom: 20 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12 }}>
                        📈 Distribuição de Resultados — {filtros.periodoLabel}
                      </p>
                      <div style={{ display: 'flex', height: 28, borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
                        {[
                          { val: dados.atende,    color: '#16a34a', label: 'Atende'    },
                          { val: dados.parcial,   color: '#d97706', label: 'Parcial'   },
                          { val: dados.naoAtende, color: '#dc2626', label: 'Não Atende'},
                        ].map(b => b.val > 0 && (
                          <div key={b.label} style={{
                            width: `${(b.val / dados.total) * 100}%`, background: b.color,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, color: '#fff', fontWeight: 700, transition: 'width 0.5s',
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

                    {abaAtiva === 'equipes' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '18px' }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 16 }}>📅 Evolução Semanal</p>
                          {dados.evolucao.length === 0 ? (
                            <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: '40px 0' }}>Sem dados</p>
                          ) : (
                            <>
                              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 130 }}>
                                {dados.evolucao.map(s => {
                                  const media = Number(s.media)
                                  const alturaBarra = Math.max(8, (media / 100) * 100)
                                  const cor = media >= 90 ? '#16a34a' : media >= 80 ? '#d97706' : '#dc2626'
                                  return (
                                    <div key={s.sem} style={{
                                      flex: 1, display: 'flex', flexDirection: 'column',
                                      alignItems: 'center', justifyContent: 'flex-end',
                                    }}>
                                      <span style={{ fontSize: 11, color: '#475569', fontWeight: 700, marginBottom: 4 }}>{s.media}</span>
                                      <div style={{ width: '100%', height: alturaBarra, background: cor, borderRadius: '6px 6px 0 0', transition: 'height 0.5s' }} />
                                    </div>
                                  )
                                })}
                              </div>
                              <div style={{ display: 'flex', gap: 12, marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
                                {dados.evolucao.map(s => (
                                  <div key={s.sem} style={{ flex: 1, textAlign: 'center' }}>
                                    <div style={{ fontSize: 11, color: '#475569', fontWeight: 700 }}>{s.sem}</div>
                                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{s.total} aud.</div>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '18px' }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 16 }}>🔧 Por Tipo de Serviço</p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {Object.entries(dados.tipoServico).map(([tipo, v]) => {
                              const pct = Math.round((v.atende / v.total) * 100)
                              const cor = pct >= 90 ? '#16a34a' : pct >= 70 ? '#d97706' : '#dc2626'
                              return (
                                <div key={tipo}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{TIPO_EMOJI[tipo] || '📋'} {tipo}</span>
                                    <span style={{ fontSize: 12, color: cor, fontWeight: 700 }}>{pct}% conf. · {v.total} aud.</span>
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
                    )}

                    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 20 }}>
                      <div style={{ padding: '10px 18px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', fontSize: 11, color: '#64748b', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <span>🏆 Top 3 = melhores notas médias do período</span>
                        <span>⚠️ Últimos 3 = atenção necessária</span>
                      </div>
                      <div>{blocoRanking(abaAtiva)}</div>
                    </div>
                  </>
                )}
              </>
            )}

            <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>
              VérticeGP · Atualizado em {new Date().toLocaleString('pt-BR')}
            </div>

          </>
        )}
      </div>
    </div>
  )
}
