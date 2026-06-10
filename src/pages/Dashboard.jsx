import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'

// ─── helpers ────────────────────────────────────────────────────────────────
function calcMesAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
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

function fmtData(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

const TIPO_EMOJI = { CORTE: '✂️', ANEXO: '🔌', RELIGA: '⚡', EMERGENCIAL: '🚒' }

// ─── Estilos padrão dos campos do Painel de Filtros ─────────────────────────
// Mesma altura/borda/padding pra todos os campos ficarem alinhados.
const FIELD_HEIGHT = 38
const LABEL_STYLE = {
  display: 'block',
  fontSize: 11,
  fontWeight: 800,
  color: '#475569',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 6,
}
const INPUT_STYLE = {
  width: '100%',
  height: FIELD_HEIGHT,
  padding: '0 12px',
  borderRadius: 10,
  border: '1.5px solid #e2e8f0',
  background: '#fff',
  color: '#1e293b',
  fontSize: 13,
  fontWeight: 600,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}

// ─── MultiSelect reutilizável ───────────────────────────────────────────────
// Dropdown com checkboxes + busca interna. Mostra "Todos" quando nada
// selecionado, "X selecionados" quando múltiplos, ou o item único.
function MultiSelect({ opcoes, selecionados, onChange, placeholder = 'Todos', disabled = false }) {
  const [aberto, setAberto] = useState(false)
  const [busca,  setBusca]  = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const toggle = (op) => {
    if (selecionados.includes(op)) onChange(selecionados.filter(s => s !== op))
    else onChange([...selecionados, op])
  }

  const opcoesFiltradas = busca
    ? opcoes.filter(o => o.toLowerCase().includes(busca.toLowerCase()))
    : opcoes

  const textoBotao =
    selecionados.length === 0 ? placeholder
    : selecionados.length === 1 ? selecionados[0]
    : `${selecionados.length} selecionados`

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => !disabled && setAberto(!aberto)}
        disabled={disabled}
        style={{
          ...INPUT_STYLE,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: disabled ? '#f8fafc' : '#fff',
          color: disabled ? '#cbd5e1' : selecionados.length === 0 ? '#94a3b8' : '#1e293b',
          textAlign: 'left',
          borderColor: aberto ? '#3b82f6' : '#e2e8f0',
        }}
      >
        <span style={{
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontWeight: selecionados.length > 0 ? 700 : 500,
        }}>
          {textoBotao}
        </span>
        <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 8, flexShrink: 0 }}>▼</span>
      </button>

      {aberto && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
          background: '#fff', border: '1.5px solid #bfdbfe', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)', maxHeight: 320, overflowY: 'auto',
        }}>
          <div style={{ padding: 8, borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, background: '#fff' }}>
            <input
              type="text"
              autoFocus
              placeholder="Buscar..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{
                width: '100%', padding: '6px 10px', fontSize: 12,
                border: '1px solid #e2e8f0', borderRadius: 8, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {selecionados.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                style={{
                  marginTop: 6, width: '100%', padding: '4px 8px',
                  fontSize: 11, fontWeight: 700, color: '#dc2626',
                  background: '#fef2f2', border: '1px solid #fecaca',
                  borderRadius: 6, cursor: 'pointer',
                }}
              >
                ✕ Limpar seleção ({selecionados.length})
              </button>
            )}
          </div>

          {opcoesFiltradas.length === 0 ? (
            <p style={{ padding: 14, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
              Nenhum resultado
            </p>
          ) : opcoesFiltradas.map(op => {
            const sel = selecionados.includes(op)
            return (
              <button
                key={op}
                type="button"
                onClick={() => toggle(op)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '9px 12px', background: sel ? '#eff6ff' : 'none',
                  border: 'none', borderBottom: '1px solid #f8fafc',
                  textAlign: 'left', cursor: 'pointer',
                }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = '#f8fafc' }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'none' }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                  border: `2px solid ${sel ? '#2563eb' : '#cbd5e1'}`,
                  background: sel ? '#2563eb' : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {sel && <span style={{ color: '#fff', fontSize: 11, fontWeight: 800 }}>✓</span>}
                </div>
                <span style={{ fontSize: 12, color: '#1e293b', fontWeight: sel ? 700 : 500 }}>{op}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── componente principal ───────────────────────────────────────────────────
export default function Dashboard({ usuarioLogado, onVoltar }) {
  const [mesAno,      setMesAno]      = useState(calcMesAtual)
  const [abaAtiva,    setAbaAtiva]    = useState('meta_dia')
  const [loading,     setLoading]     = useState(true)

  // ── filtro de período ─────────────────────────────────────────────────────
  const [modoPeriodo, setModoPeriodo] = useState(false) // false = mês, true = período
  const [dataIni,     setDataIni]     = useState('')
  const [dataFim,     setDataFim]     = useState('')

  // ── filtros de supervisor (aplicados in-memory, sem nova query) ───────────
  const [selSupOp,    setSelSupOp]    = useState([])
  const [selSupCampo, setSelSupCampo] = useState([])

  // ── dados raw (vindos do banco) ───────────────────────────────────────────
  const [audsRaw,        setAudsRaw]        = useState([])
  const [audsHojeRaw,    setAudsHojeRaw]    = useState([])
  const [fiscais,        setFiscais]        = useState([])
  const [metas,          setMetas]          = useState([])
  const [feriadosLista,  setFeriadosLista]  = useState([])
  const [feriados,       setFeriados]       = useState([])

  // ── estrutura de equipes (carregada uma vez para mapear prefixo→supervisores)
  const [supervOps,      setSupervOps]      = useState([])
  const [supervCampos,   setSupervCampos]   = useState([])
  const [mapPrefixo,     setMapPrefixo]     = useState({}) // { prefixo: { op, campo } }
  const [mapOpToCampo,   setMapOpToCampo]   = useState({}) // { op: Set<campo> }

  const mesesOpcoes = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - 5 + i)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const primeiroDia = `${mesAno}-01`
  const ultimoDia   = new Date(parseInt(mesAno.split('-')[0]), parseInt(mesAno.split('-')[1]), 0)
    .toISOString().split('T')[0]

  const periodoLabel = modoPeriodo && dataIni
    ? (dataFim && dataFim !== dataIni ? `${fmtData(dataIni)} → ${fmtData(dataFim)}` : fmtData(dataIni))
    : mesLabel(mesAno)

  function getDatasQuery() {
    if (modoPeriodo && dataIni) {
      return { ini: dataIni, fim: dataFim || dataIni }
    }
    const [ano, mes] = mesAno.split('-')
    return {
      ini: `${ano}-${mes}-01`,
      fim: new Date(parseInt(ano), parseInt(mes), 0).toISOString().split('T')[0],
    }
  }

  // ── carrega estrutura de equipes (1 vez, no mount) ────────────────────────
  useEffect(() => {
    supabase.from('estrutura_equipes')
      .select('prefixo, superv_campo, superv_operacao')
      .then(({ data }) => {
        const opSet    = new Set()
        const campoSet = new Set()
        const mp       = {}
        const op2c     = {}
        ;(data || []).forEach(r => {
          if (r.superv_operacao) opSet.add(r.superv_operacao.trim())
          if (r.superv_campo)    campoSet.add(r.superv_campo.trim())
          if (r.prefixo) {
            mp[r.prefixo] = {
              op:    r.superv_operacao?.trim() || '',
              campo: r.superv_campo?.trim()    || '',
            }
          }
          if (r.superv_operacao && r.superv_campo) {
            if (!op2c[r.superv_operacao.trim()]) op2c[r.superv_operacao.trim()] = new Set()
            op2c[r.superv_operacao.trim()].add(r.superv_campo.trim())
          }
        })
        setSupervOps([...opSet].sort())
        setSupervCampos([...campoSet].sort())
        setMapPrefixo(mp)
        setMapOpToCampo(op2c)
      })
  }, [])

  // ── cascata: ao mudar Sup. Op, limpa Sup. Campo que não é mais subordinado
  useEffect(() => {
    if (selSupOp.length === 0) return
    const validos = new Set()
    selSupOp.forEach(op => mapOpToCampo[op]?.forEach(c => validos.add(c)))
    setSelSupCampo(prev => prev.filter(c => validos.has(c)))
  }, [selSupOp, mapOpToCampo])

  // ── lista de Sup. Campo visível (cascata aplicada) ────────────────────────
  const supervCamposVisiveis = useMemo(() => {
    if (selSupOp.length === 0) return supervCampos
    const validos = new Set()
    selSupOp.forEach(op => mapOpToCampo[op]?.forEach(c => validos.add(c)))
    return supervCampos.filter(c => validos.has(c))
  }, [selSupOp, mapOpToCampo, supervCampos])

  // ── carrega tudo em paralelo ──────────────────────────────────────────────
  const carregar = async () => {
    setLoading(true)
    try {
      const { ini, fim } = getDatasQuery()

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
        supabase.from('metas_fiscal').select('*').eq('mes_ano', mesAno),
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
    if (modoPeriodo && !dataIni) return
    carregar()
  }, [mesAno, modoPeriodo, dataIni, dataFim])

  // ── função de filtro por supervisor (aplicada em memória) ─────────────────
  const filtraPorSupervisor = (lista) => {
    if (selSupOp.length === 0 && selSupCampo.length === 0) return lista
    return lista.filter(a => {
      if (!a.prefixo) return false
      const info = mapPrefixo[a.prefixo]
      if (!info) return false
      if (selSupOp.length    > 0 && !selSupOp.includes(info.op))       return false
      if (selSupCampo.length > 0 && !selSupCampo.includes(info.campo)) return false
      return true
    })
  }

  // ── auditorias FILTRADAS (usadas em todo o cálculo abaixo) ────────────────
  const realizadas     = useMemo(() => filtraPorSupervisor(audsRaw),     [audsRaw,     selSupOp, selSupCampo, mapPrefixo])
  const realizadasHoje = useMemo(() => filtraPorSupervisor(audsHojeRaw), [audsHojeRaw, selSupOp, selSupCampo, mapPrefixo])

  const filtroSupervisorAtivo = selSupOp.length > 0 || selSupCampo.length > 0

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
  const diasUteis         = diasUteisMes(mesAno, feriados)
  const feriadosDoMes     = feriadosLista.filter(f => f.data.startsWith(mesAno))
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
    // Sem filtro de supervisor: mostra fiscais com meta OU com auditoria
    // Com filtro de supervisor: mostra apenas fiscais que TÊM auditoria (a meta sozinha não diz que ele cobre aquele supervisor)
    .filter(f => filtroSupervisorAtivo
      ? (f.total > 0 || f.totalHoje > 0)
      : (f.meta > 0 || f.total > 0 || f.totalHoje > 0))
  }, [fiscais, metas, realizadas, realizadasHoje, diasUteis, filtroSupervisorAtivo])

  const totalMeta      = dadosFiscais.reduce((a, f) => a + f.meta, 0)
  const totalFeito     = dadosFiscais.reduce((a, f) => a + f.total, 0)
  const totalFaltam    = dadosFiscais.reduce((a, f) => a + f.faltam, 0)
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

  const limparTodosFiltros = () => {
    setSelSupOp([])
    setSelSupCampo([])
    setDataIni('')
    setDataFim('')
    setModoPeriodo(false)
    setMesAno(calcMesAtual())
  }
  const algumFiltroAtivo = filtroSupervisorAtivo || modoPeriodo || mesAno !== calcMesAtual()

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
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {key}
              </span>
              <span style={{ fontSize: 11, color: conc.color, fontWeight: 700, marginLeft: 8, flexShrink: 0 }}>
                {conc.label}
              </span>
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

      {/* ── Header limpo: só botão voltar + título ── */}
      <div style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)', padding: '18px 20px', color: '#fff' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14,
          }}>← Voltar para Home</button>

          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800 }}>📊 Dashboard — Ranking Operacional</h1>
            <p style={{ fontSize: 12, opacity: 0.8, marginTop: 3 }}>Visão consolidada do desempenho de equipes e fiscais</p>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '20px 16px 60px' }}>

        {/* ════════════════════ PAINEL DE FILTROS ════════════════════ */}
        <div style={{
          background: '#fff', borderRadius: 14, border: '1.5px solid #e2e8f0',
          padding: '16px 18px', marginBottom: 16,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          {/* Header do painel */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #f1f5f9',
          }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              🔍 Filtros do Dashboard
              <span style={{
                fontSize: 10, fontWeight: 700, color: '#64748b',
                background: '#f1f5f9', padding: '2px 8px', borderRadius: 6,
                textTransform: 'uppercase', letterSpacing: 0.5,
              }}>
                aplica em todas as abas
              </span>
            </p>
            {algumFiltroAtivo && (
              <button onClick={limparTodosFiltros} style={{
                fontSize: 11, fontWeight: 700, color: '#dc2626',
                background: '#fef2f2', border: '1px solid #fecaca',
                padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
              }}>
                ✕ Limpar filtros
              </button>
            )}
          </div>

          {/* Grid de campos */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
            alignItems: 'flex-start',
          }}>

            {/* ── Grupo 1: Período ── */}
            <div>
              <label style={LABEL_STYLE}>Período</label>

              {/* Toggle Mês / Período */}
              <div style={{
                display: 'flex', background: '#f1f5f9', borderRadius: 10,
                padding: 3, gap: 2, marginBottom: 8, height: FIELD_HEIGHT, boxSizing: 'border-box',
              }}>
                <button onClick={() => { setModoPeriodo(false); setDataIni(''); setDataFim('') }} style={{
                  flex: 1, borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700, transition: 'all 0.2s',
                  background: !modoPeriodo ? '#fff' : 'transparent',
                  color:      !modoPeriodo ? '#1e3a5f' : '#64748b',
                  boxShadow:  !modoPeriodo ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }}>📅 Mês</button>
                <button onClick={() => setModoPeriodo(true)} style={{
                  flex: 1, borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700, transition: 'all 0.2s',
                  background: modoPeriodo ? '#fff' : 'transparent',
                  color:      modoPeriodo ? '#1e3a5f' : '#64748b',
                  boxShadow:  modoPeriodo ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }}>📆 Período</button>
              </div>

              {/* Modo Mês: dropdown de mês */}
              {!modoPeriodo && (
                <select value={mesAno} onChange={e => setMesAno(e.target.value)} style={{
                  ...INPUT_STYLE,
                  cursor: 'pointer',
                  appearance: 'none',
                  backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\'%3E%3Cpath d=\'M1 1l4 4 4-4\' stroke=\'%2394a3b8\' stroke-width=\'1.5\' fill=\'none\' stroke-linecap=\'round\'/%3E%3C/svg%3E")',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 12px center',
                  paddingRight: 32,
                }}>
                  {mesesOpcoes.map(m => (
                    <option key={m} value={m}>
                      {mesLabel(m)}{m === calcMesAtual() ? ' ← atual' : ''}
                    </option>
                  ))}
                </select>
              )}

              {/* Modo Período: dois inputs de data */}
              {modoPeriodo && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, marginBottom: 3, letterSpacing: 0.5 }}>DE</p>
                    <input type="date"
                      value={dataIni}
                      onChange={e => setDataIni(e.target.value)}
                      style={{ ...INPUT_STYLE, padding: '0 10px', fontSize: 12, cursor: 'pointer' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, marginBottom: 3, letterSpacing: 0.5 }}>ATÉ</p>
                    <input type="date"
                      value={dataFim}
                      min={dataIni}
                      onChange={e => setDataFim(e.target.value)}
                      style={{ ...INPUT_STYLE, padding: '0 10px', fontSize: 12, cursor: 'pointer' }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ── Grupo 2: Supervisor Operacional ── */}
            <div>
              <label style={LABEL_STYLE}>Supervisor Operacional</label>
              <MultiSelect
                opcoes={supervOps}
                selecionados={selSupOp}
                onChange={setSelSupOp}
                placeholder="Todos"
              />
            </div>

            {/* ── Grupo 3: Supervisor de Campo ── */}
            <div>
              <label style={LABEL_STYLE}>
                Supervisor de Campo
                {selSupOp.length > 0 && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, color: '#2563eb',
                    background: '#dbeafe', padding: '2px 6px', borderRadius: 5,
                    marginLeft: 6, textTransform: 'none', letterSpacing: 0,
                  }}>
                    cascata ativa
                  </span>
                )}
              </label>
              <MultiSelect
                opcoes={supervCamposVisiveis}
                selecionados={selSupCampo}
                onChange={setSelSupCampo}
                placeholder="Todos"
              />
            </div>
          </div>

          {/* Indicador do filtro de período ativo */}
          {modoPeriodo && (
            <div style={{
              fontSize: 11, color: dataIni ? '#1d4ed8' : '#d97706',
              fontWeight: 700, marginTop: 10, textAlign: 'right',
            }}>
              {dataIni ? `📆 Filtrando: ${periodoLabel}` : '⚠️ Selecione a data inicial para aplicar'}
            </div>
          )}
        </div>

        {/* ── Abas ── */}
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
                    Meta diária baseada em {diasUteis} dias úteis em {mesLabel(mesAno)}
                    {feriadosDoMes.length > 0 && ` (${feriadosDoMes.length} feriado(s) descontado(s))`}
                  </p>
                </div>

                {dadosFiscais.filter(f => f.meta > 0).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
                    <p>{filtroSupervisorAtivo
                      ? 'Nenhum fiscal com auditorias para os supervisores selecionados.'
                      : `Nenhuma meta cadastrada para ${mesLabel(mesAno)}.`}</p>
                    {!filtroSupervisorAtivo && <p style={{ fontSize: 12, marginTop: 8 }}>Acesse <strong>Metas por Fiscal</strong> para cadastrar.</p>}
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
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Progresso — {periodoLabel}</span>
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
                    <p style={{ marginBottom: 8 }}>{filtroSupervisorAtivo
                      ? 'Nenhum fiscal com auditorias para os supervisores selecionados.'
                      : `Nenhuma meta cadastrada para ${mesLabel(mesAno)}.`}</p>
                    {!filtroSupervisorAtivo && <p style={{ fontSize: 12 }}>Acesse <strong>Metas por Fiscal</strong> para cadastrar.</p>}
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
                    <p style={{ fontSize: 16, marginBottom: 8 }}>Nenhuma auditoria em {periodoLabel}{filtroSupervisorAtivo ? ' para os filtros selecionados' : ''}.</p>
                    <p style={{ fontSize: 13 }}>Ajuste os filtros ou aguarde as auditorias serem realizadas.</p>
                  </div>
                ) : (
                  <>
                    {/* KPIs */}
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

                    {/* Distribuição de resultados */}
                    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '18px', marginBottom: 20 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12 }}>
                        📈 Distribuição de Resultados — {periodoLabel}
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

                    {/* Evolução semanal + Tipo de serviço (só na aba equipes) */}
                    {abaAtiva === 'equipes' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                        {/* ── Evolução Semanal (LAYOUT CORRIGIDO) ── */}
                        {/* Antes: container height=100 com [número, barra, sem, n aud.] todos na mesma flex column
                             → barras "vazavam" pra cima do título.
                           Agora: SEPARADO em (a) área do gráfico com altura fixa e (b) labels embaixo, fora dele.
                           Os números (média) ficam DENTRO do gráfico (em cima da barra), e os labels (S2, n aud)
                           ficam abaixo como uma linha de legenda. */}
                        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '18px' }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 16 }}>📅 Evolução Semanal</p>
                          {dados.evolucao.length === 0 ? (
                            <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: '40px 0' }}>Sem dados</p>
                          ) : (
                            <>
                              {/* Área do gráfico */}
                              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 130 }}>
                                {dados.evolucao.map(s => {
                                  const media = Number(s.media)
                                  const alturaBarra = Math.max(8, (media / 100) * 100) // 0-100px
                                  const cor = media >= 90 ? '#16a34a' : media >= 80 ? '#d97706' : '#dc2626'
                                  return (
                                    <div key={s.sem} style={{
                                      flex: 1, display: 'flex', flexDirection: 'column',
                                      alignItems: 'center', justifyContent: 'flex-end',
                                    }}>
                                      <span style={{ fontSize: 11, color: '#475569', fontWeight: 700, marginBottom: 4 }}>
                                        {s.media}
                                      </span>
                                      <div style={{
                                        width: '100%', height: alturaBarra,
                                        background: cor, borderRadius: '6px 6px 0 0',
                                        transition: 'height 0.5s',
                                      }} />
                                    </div>
                                  )
                                })}
                              </div>
                              {/* Labels (fora do container do gráfico) */}
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

                    {/* Lista de ranking */}
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

            {/* Rodapé */}
            <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>
              VérticeGP · Atualizado em {new Date().toLocaleString('pt-BR')}
            </div>

          </>
        )}
      </div>
    </div>
  )
}
