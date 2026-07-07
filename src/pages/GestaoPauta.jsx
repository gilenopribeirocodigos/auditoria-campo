import { useState, useEffect, useRef, useMemo } from 'react'
import { listarPautas, criarPauta, atualizarPauta, deletarPauta } from '../lib/pautas.js'
import { supabase } from '../lib/supabase.js'
import { gerarNumeroAS, numeroASDaPauta } from '../lib/numeroAS.js'
import * as XLSX from 'xlsx'
import {
  useFiltrosOperacionais,
  PainelFiltros,
  LABEL_STYLE,
  INPUT_STYLE,
} from '../components/PainelFiltros.jsx'

const TIPOS_SERVICO     = ['CORTE', 'ANEXO', 'RELIGA', 'EMERGENCIAL']
const RECORRENCIAS      = ['UNICA', 'DIARIA', 'SEMANAL']
const RECORRENCIA_LABEL = { UNICA: 'Única', DIARIA: 'Diária', SEMANAL: 'Semanal' }

const MOTIVOS_AUDITORIA = [
  'MATERIAL APLICADO EM CAMPO',
  'RELIGA VINCULADA',
]
const MOTIVO_MATERIAL_APLICADO = 'MATERIAL APLICADO EM CAMPO'

const FORM_VAZIO = {
  prefixo: '', fiscal_login: '', data_prevista: new Date().toISOString().split('T')[0],
  tipo_servico: 'CORTE', tipo_auditoria: 'DESEMPENHO',
  recorrencia: 'UNICA', observacao: '', os: '', uc: '',
  motivo_auditoria: '', qtde_cabos_os: '',
  matricula_eletricista1: '', matricula_eletricista2: '',
  nome_eletricista: '', nome_eletricista2: '',
  numero_as: '',
}

function normalizarDecimalTexto(valor) {
  const texto = String(valor ?? '').replace(',', '.').replace(/[^\d.]/g, '')
  const [inteiro, ...decimais] = texto.split('.')
  return decimais.length > 0 ? `${inteiro}.${decimais.join('')}` : inteiro
}

function decimalOuNull(valor) {
  const texto = normalizarDecimalTexto(valor)
  if (!texto) return null
  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : null
}

function limparTexto(texto) {
  if (texto === null || texto === undefined) return ''
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—−]/g, '-')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
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

function statusConclusaoPauta(pauta, auditoria) {
  const status = String(pauta?.status || '').toUpperCase()
  if (status === 'CANCELADA') return 'CANCELADA'
  if (status === 'CONCLUIDA' || pauta?.auditoria_id || auditoria?.id) return 'CONCLUIDA'
  const dataPrevista = pauta?.data_prevista || auditoria?.data_auditoria || ''
  if (!dataPrevista) return ''
  const hoje = new Date().toISOString().split('T')[0]
  return dataPrevista < hoje ? 'PENDENTE VENCIDA' : 'PENDENTE NO PRAZO'
}

function separarDataHora(valor) {
  if (!valor) return { data: '', hora: '' }
  const texto = String(valor)
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return { data: texto, hora: '' }
  const data = new Date(texto)
  if (!Number.isNaN(data.getTime())) {
    const partes = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Fortaleza',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(data)
    const valorParte = tipo => partes.find(p => p.type === tipo)?.value || ''
    return {
      data: `${valorParte('year')}-${valorParte('month')}-${valorParte('day')}`,
      hora: `${valorParte('hour')}:${valorParte('minute')}:${valorParte('second')}`,
    }
  }
  const [dataTexto, horaTexto = ''] = texto.split(/[T ]/)
  return { data: dataTexto || '', hora: horaTexto.slice(0, 8) }
}

function parseCsvLinhas(texto) {
  const linhas = texto.trim().split('\n').filter(l => l.trim())
  if (linhas.length < 2) return []
  const header = linhas[0]
  const sep = header.includes(';') ? ';' : header.includes('\t') ? '\t' : ','
  const cols = header.split(sep).map(c => c.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
  )
  return linhas.slice(1).map(row => {
    const vals = row.split(sep)
    return cols.reduce((a, c, i) => ({ ...a, [c]: (vals[i] || '').trim() }), {})
  })
}

function normalizarPauta(obj) {
  const c = Object.fromEntries(
    Object.entries(obj || {}).map(([k, v]) => [k, limparTexto(v)])
  )
  const ts = (c.tipo_servico || '').toUpperCase()
  const tipoServico = TIPOS_SERVICO.includes(ts) ? ts : 'CORTE'
  const ta = (c.tipo_auditoria || '').toUpperCase()
  const tipoAuditoria = ta.includes('POS') ? 'POS_SERVICO' : 'DESEMPENHO'
  const rc = (c.recorrencia || '').toUpperCase()
  const recorrencia = ['UNICA','DIARIA','SEMANAL'].includes(rc) ? rc : 'UNICA'
  const ma = (c.motivo_auditoria || '').toUpperCase()
  const motivoAuditoria = MOTIVOS_AUDITORIA.includes(ma) ? ma : ''
  let data = c.data_prevista || ''
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) {
    const [d, m, a] = data.split('/')
    data = `${a}-${m}-${d}`
  }
  if (!data) data = new Date().toISOString().split('T')[0]
  return {
    prefixo:                (c.prefixo || '').toUpperCase(),
    fiscal_login:           (c.fiscal_login || c.fiscal || '').toLowerCase(),
    data_prevista:          data,
    tipo_servico:           tipoServico,
    tipo_auditoria:         tipoAuditoria,
    recorrencia,
    observacao:             c.observacao || '',
    motivo_auditoria:       motivoAuditoria,
    qtde_cabos_os:          motivoAuditoria === MOTIVO_MATERIAL_APLICADO
      ? decimalOuNull(c.qtde_cabos_os || c.qtde_cabo_os || c.qtd_cabos_os || c.qtd_cabo_os)
      : null,
    os:                     c.os || '',
    uc:                     c.uc || '',
    matricula_eletricista1: (c.matricula_eletricista1 || c.matricula_eletricista || '').replace(/\D/g, ''),
    matricula_eletricista2: (c.matricula_eletricista2 || '').replace(/\D/g, ''),
    nome_eletricista:       '',
    nome_eletricista2:      '',
    status:                 'PENDENTE',
  }
}

// ── Campo de Prefixo com validação online/offline ─────────────────────────────
// Online  → só aceita prefixo escolhido da lista (busca em estrutura_equipes)
// Offline → digitação livre (sem internet não dá pra validar)
function PrefixoInputValidado({ value, onChange, onValidChange }) {
  const [sugestoes,    setSugestoes]    = useState([])
  const [aberto,       setAberto]       = useState(false)
  const [valido,       setValido]       = useState(false)
  const [buscando,     setBuscando]     = useState(false)
  const [semResultado, setSemResultado] = useState(false)
  const offline = !navigator.onLine
  const ref = useRef(null)

  // Avisa o pai sempre que o estado de validade muda
  useEffect(() => { onValidChange(valido || offline) }, [valido, offline])

  // Se o modal abrir com um prefixo já preenchido (modo editar), valida silenciosamente
  useEffect(() => {
    if (!value) return
    if (offline) { setValido(true); return }
    supabase.from('estrutura_equipes')
      .select('prefixo').eq('prefixo', value).limit(1)
      .then(({ data }) => setValido(!!(data && data.length > 0)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // só na montagem do modal

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleChange = async (v) => {
    const upper = v.toUpperCase()
    onChange(upper)
    setValido(false)
    setSemResultado(false)

    if (offline) {
      setValido(true)
      setSugestoes([])
      setAberto(false)
      return
    }

    if (upper.length < 2) { setSugestoes([]); setAberto(false); return }

    setBuscando(true)
    const { data } = await supabase
      .from('estrutura_equipes').select('prefixo')
      .ilike('prefixo', `%${upper}%`).order('prefixo').limit(10)
    setBuscando(false)
    const lista = [...new Set((data || []).map(r => r.prefixo))]
    setSugestoes(lista)
    setAberto(lista.length > 0)
    setSemResultado(lista.length === 0 && upper.length >= 2)
  }

  const handleSelect = (v) => {
    onChange(v)
    setValido(true)
    setSugestoes([])
    setAberto(false)
    setSemResultado(false)
  }

  const borderColor = valido ? '#16a34a' : (value && !offline) ? '#dc2626' : '#e2e8f0'
  const bgColor     = valido ? '#f0fdf4' : (value && !offline && !valido) ? '#fef2f2' : '#fff'

  return (
    <div className="form-group" style={{ position: 'relative' }} ref={ref}>
      <label className="form-label">Prefixo da Equipe *</label>
      <div style={{ position: 'relative' }}>
        <input
          className="form-input"
          value={value}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => sugestoes.length > 0 && setAberto(true)}
          placeholder={offline ? 'Offline — digite o prefixo manualmente' : 'Digite para buscar (ex: PI-THE-C001M)'}
          autoComplete="off"
          style={{
            borderColor,
            background: bgColor,
            paddingRight: 36,
            transition: 'border-color 0.2s, background 0.2s',
          }}
        />
        <span style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          fontSize: 16, pointerEvents: 'none',
        }}>
          {offline     ? '📵'
           : buscando  ? '⏳'
           : valido    ? '✅'
           : value && value.length >= 2 ? '❌' : '🔍'}
        </span>
      </div>

      {/* Dropdown */}
      {aberto && sugestoes.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
          background: '#fff', border: '1.5px solid #bfdbfe', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)', maxHeight: 220, overflowY: 'auto',
        }}>
          {sugestoes.map((s, i) => (
            <button key={i} onMouseDown={() => handleSelect(s)} style={{
              display: 'block', width: '100%', padding: '11px 14px', textAlign: 'left',
              background: 'none', border: 'none',
              borderBottom: i < sugestoes.length - 1 ? '1px solid #f1f5f9' : 'none',
              fontSize: 13, fontWeight: 700, color: '#1e293b', cursor: 'pointer',
              fontFamily: '"Courier New", monospace', letterSpacing: 0.5,
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >{s}</button>
          ))}
        </div>
      )}

      {/* Feedback */}
      {offline && (
        <p style={{ fontSize: 11, color: '#92400e', marginTop: 4, fontWeight: 600 }}>
          📵 Offline — prefixo salvo sem validação. Use o padrão correto (ex: PI-THE-C001M).
        </p>
      )}
      {!offline && valido && (
        <p style={{ fontSize: 11, color: '#16a34a', marginTop: 4, fontWeight: 600 }}>
          ✅ Prefixo encontrado na base de dados.
        </p>
      )}
      {!offline && semResultado && value && value.length >= 2 && (
        <p style={{ fontSize: 11, color: '#dc2626', marginTop: 4, fontWeight: 600 }}>
          ❌ Prefixo não encontrado. Verifique o padrão (ex: PI-THE-C001M).
        </p>
      )}
      {!offline && !valido && value && value.length >= 2 && !semResultado && !buscando && sugestoes.length > 0 && (
        <p style={{ fontSize: 11, color: '#d97706', marginTop: 4, fontWeight: 600 }}>
          ☝️ Selecione um prefixo da lista para salvar.
        </p>
      )}
    </div>
  )
}

export default function GestaoPauta({ usuarioLogado, onVoltar }) {
  const filtros = useFiltrosOperacionais({ inicializarMes: true, usuarioLogado })

  const [pautas,       setPautas]       = useState([])
  const [fiscais,      setFiscais]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [modal,        setModal]        = useState(false)
  const [editando,     setEditando]     = useState(null)
  const [formData,     setFormData]     = useState(FORM_VAZIO)
  const [salvando,     setSalvando]     = useState(false)
  const [erro,         setErro]         = useState('')
  const [statusTab,    setStatusTab]    = useState('TODOS')
  const [csvModal,     setCsvModal]     = useState(false)
  const [csvTexto,     setCsvTexto]     = useState('')
  const [csvStatus,    setCsvStatus]    = useState('')
  const [csvPreview,   setCsvPreview]   = useState([])
  const [baixandoNcs,  setBaixandoNcs]  = useState(false)
  const [numeroASFiltro, setNumeroASFiltro] = useState('')
  // ── Novo estado: prefixo validado no modal ──
  const [prefixoValido, setPrefixoValido] = useState(false)

  const intervalRef = useRef(null)
  const fileRef     = useRef(null)

  const dadosCriacaoPauta = () => {
    const createdAt = new Date().toISOString()
    const geracao = separarDataHora(createdAt)
    return {
      usuario_criacao: usuarioLogado?.login || usuarioLogado?.nome || usuarioLogado?.matricula || '',
      data_geracao: geracao.data,
      hora_geracao: geracao.hora,
      created_at: createdAt,
      numero_as: gerarNumeroAS(),
    }
  }

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

  useEffect(() => {
    intervalRef.current = setInterval(() => { carregar() }, 20000)
    return () => clearInterval(intervalRef.current)
  }, [])

  const upd       = (k, v) => setFormData(f => ({ ...f, [k]: v }))
  const abrirNovo = () => {
    setEditando(null)
    setFormData({ ...FORM_VAZIO })
    setPrefixoValido(false)
    setErro('')
    setModal(true)
  }
  const abrirEditar = p => {
    setEditando(p)
    setFormData({
      ...FORM_VAZIO,
      ...p,
      os: p.os || '', uc: p.uc || '',
      motivo_auditoria: p.motivo_auditoria || '',
      qtde_cabos_os: p.qtde_cabos_os ?? '',
    })
    // Ao editar, o prefixo já existe — será validado silenciosamente pelo componente
    setPrefixoValido(false)
    setErro('')
    setModal(true)
  }
  const fechar = () => { setModal(false); setErro(''); setPrefixoValido(false) }

  const salvar = async () => {
    if (!formData.prefixo || !formData.fiscal_login || !formData.data_prevista) {
      setErro('Prefixo, fiscal e data são obrigatórios.'); return
    }
    // Bloqueia se prefixo não foi validado e há internet
    if (!prefixoValido && navigator.onLine) {
      setErro('Selecione um prefixo válido da lista. O prefixo deve existir na base de dados.'); return
    }
    setSalvando(true); setErro('')
    try {
      const baseLimpo = {
        ...formData,
        prefixo:                limparTexto(formData.prefixo).toUpperCase(),
        observacao:             limparTexto(formData.observacao),
        os:                     limparTexto(formData.os),
        uc:                     limparTexto(formData.uc),
        qtde_cabos_os:          formData.motivo_auditoria === MOTIVO_MATERIAL_APLICADO
          ? decimalOuNull(formData.qtde_cabos_os)
          : null,
        matricula_eletricista1: (formData.matricula_eletricista1 || '').replace(/\D/g, ''),
        matricula_eletricista2: (formData.matricula_eletricista2 || '').replace(/\D/g, ''),
      }
      const [enriquecido] = await enriquecerComEletricistas([baseLimpo])
      const payload = enriquecido
      if (editando) {
        await atualizarPauta(editando.id, payload)
      } else {
        await criarPauta({ ...payload, status: 'PENDENTE', ...dadosCriacaoPauta() })
        setStatusTab('PENDENTE')
      }
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

  const pautasFiltradasPainel = useMemo(() => {
    const { ini, fim } = filtros.getDatasQuery()
    const setPermitidos = filtros.prefixosPermitidos
      ? new Set(filtros.prefixosPermitidos)
      : null
    const buscaAS = numeroASFiltro.trim().toUpperCase()
    return pautas.filter(p => {
      if (setPermitidos && !setPermitidos.has(p.prefixo)) return false
      if (ini && p.data_prevista < ini) return false
      if (fim && p.data_prevista > fim) return false
      if (buscaAS && !String(p.numero_as || '').toUpperCase().includes(buscaAS)) return false
      const filtroAtivo =
        filtros.selRegional.length > 0 ||
        filtros.selSupOp.length    > 0 ||
        filtros.selSupCampo.length > 0 ||
        filtros.selPrefixos.length > 0
      if (!filtroAtivo) return true
      const info = filtros.mapPrefixo[p.prefixo]
      if (!info) return false
      if (filtros.selRegional.length > 0 && !filtros.selRegional.includes(info.regional)) return false
      if (filtros.selPrefixos.length > 0 && !filtros.selPrefixos.includes(p.prefixo)) return false
      if (filtros.selSupOp.length    > 0 && !filtros.selSupOp.includes(info.op))      return false
      if (filtros.selSupCampo.length > 0 && !filtros.selSupCampo.includes(info.campo)) return false
      return true
    })
  }, [pautas, numeroASFiltro, filtros.modoPeriodo, filtros.mesAno, filtros.dataIni, filtros.dataFim,
      filtros.selRegional, filtros.selSupOp, filtros.selSupCampo, filtros.selPrefixos, filtros.mapPrefixo,
      filtros.prefixosPermitidos])

  const dataGeracaoPautaMs = p => {
    const valor = p.created_at || p.criado_em || (p.data_geracao ? `${p.data_geracao}T${p.hora_geracao || '00:00:00'}` : '')
    const ts = valor ? new Date(valor).getTime() : 0
    return Number.isFinite(ts) ? ts : 0
  }

  const pautasExibidas = pautasFiltradasPainel
    .filter(p => {
      const s = calcStatus(p)
      if (statusTab === 'TODOS')   return true
      if (statusTab === 'VENCIDA') return s === 'VENCIDA'
      return p.status === statusTab
    })
    .sort((a, b) => dataGeracaoPautaMs(b) - dataGeracaoPautaMs(a) || (Number(b.id) || 0) - (Number(a.id) || 0))

  const counts = {
    PENDENTE:  pautasFiltradasPainel.filter(p => p.status === 'PENDENTE' && calcStatus(p) === 'PENDENTE').length,
    VENCIDA:   pautasFiltradasPainel.filter(p => calcStatus(p) === 'VENCIDA').length,
    CONCLUIDA: pautasFiltradasPainel.filter(p => p.status === 'CONCLUIDA').length,
    CANCELADA: pautasFiltradasPainel.filter(p => p.status === 'CANCELADA').length,
  }

  const whatsappVencidas = () => {
    const vencidas = pautasFiltradasPainel.filter(p => calcStatus(p) === 'VENCIDA')
    if (vencidas.length === 0) { alert('Não há pautas vencidas!'); return }
    const linhas = vencidas.map(p =>
      `▪️ ${p.prefixo} | Fiscal: ${p.fiscal_login} | Data: ${p.data_prevista}${p.os ? ` | OS: ${p.os}` : ''}${p.uc ? ` | UC: ${p.uc}` : ''}${p.motivo_auditoria ? ` | Motivo: ${p.motivo_auditoria}` : ''}`
    ).join('\n')
    const msg = encodeURIComponent(
      `🚨 *PAUTAS DE FISCALIZAÇÃO VENCIDAS — DPL CONSTRUÇÕES*\n\n${linhas}\n\nFavor regularizar!`
    )
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  const LIMITE_DIAS_NCS = 90

  const baixarRelatorioNCs = async () => {
    setBaixandoNcs(true)
    try {
      const { ini, fim } = filtros.getDatasQuery()
      if (!ini || !fim) {
        alert(`⚠️ Selecione um período válido no filtro (início e fim) com no máximo ${LIMITE_DIAS_NCS} dias.`)
        return
      }
      const diffDias = Math.ceil((new Date(fim) - new Date(ini)) / (1000 * 60 * 60 * 24)) + 1
      if (diffDias > LIMITE_DIAS_NCS) {
        alert(
          `⚠️ Período de ${diffDias} dias é grande demais.\n\n` +
          `Limite máximo: ${LIMITE_DIAS_NCS} dias (3 meses).\n\n` +
          `Reduza o período no filtro e tente novamente.`
        )
        return
      }
  
      const prefixosBase = filtros.prefixosPermitidos
        ? new Set(filtros.prefixosPermitidos)
        : null
      const filtroHierarquicoAtivo =
        filtros.selRegional.length > 0 ||
        filtros.selSupOp.length    > 0 ||
        filtros.selSupCampo.length > 0 ||
        filtros.selPrefixos.length > 0
      let prefixosPermitidos = prefixosBase ? [...prefixosBase] : null
  
      if (filtroHierarquicoAtivo) {
        prefixosPermitidos = Object.entries(filtros.mapPrefixo)
          .filter(([pref, info]) => {
            if (prefixosBase && !prefixosBase.has(pref)) return false
            if (filtros.selRegional.length > 0 && !filtros.selRegional.includes(info.regional)) return false
            if (filtros.selPrefixos.length > 0 && !filtros.selPrefixos.includes(pref)) return false
            if (filtros.selSupOp.length    > 0 && !filtros.selSupOp.includes(info.op)) return false
            if (filtros.selSupCampo.length > 0 && !filtros.selSupCampo.includes(info.campo)) return false
            return true
          })
          .map(([pref]) => pref)
      }
  
      if (prefixosPermitidos !== null && prefixosPermitidos.length === 0) {
        alert('Nenhum prefixo bate com os filtros selecionados.')
        return
      }
  
      let qP = supabase.from('pautas').select('*')
        .gte('data_prevista', ini)
        .lte('data_prevista', fim)
      if (prefixosPermitidos !== null) qP = qP.in('prefixo', prefixosPermitidos)
      const { data: pautasRel, error: pErr } = await qP
      if (pErr) throw pErr
      if (!pautasRel || pautasRel.length === 0) {
        alert('Nenhuma pauta encontrada no período/filtros selecionados.')
        return
      }
  
      const auditoriaIds = [...new Set((pautasRel || []).map(p => p.auditoria_id).filter(Boolean))]
      let auditorias = []
      if (auditoriaIds.length > 0) {
        const { data, error } = await supabase
          .from('auditorias')
          .select('*')
          .in('id', auditoriaIds)
        if (error) throw error
        auditorias = data || []
      }
      const mapAuditorias = {}
      auditorias.forEach(a => { mapAuditorias[a.id] = a })
  
      let ncs = []
      if (auditoriaIds.length > 0) {
        const { data, error } = await supabase
          .from('auditorias_nao_conformes')
          .select('*')
          .in('auditoria_id', auditoriaIds)
        if (error) throw error
        ncs = data || []
      }
      const ncsPorAuditoria = {}
      ncs.forEach(nc => {
        if (!ncsPorAuditoria[nc.auditoria_id]) ncsPorAuditoria[nc.auditoria_id] = []
        ncsPorAuditoria[nc.auditoria_id].push(nc)
      })
  
      const linhas = pautasRel.flatMap(p => {
        const a = p.auditoria_id ? (mapAuditorias[p.auditoria_id] || {}) : {}
        const numeroAS = numeroASDaPauta(p) || a.numero_as || ''
        const listaNcs = a.id ? (ncsPorAuditoria[a.id] || []) : []
        const registros = listaNcs.length > 0 ? listaNcs : [null]
        const geracaoOrigem = p.data_geracao
          ? `${p.data_geracao}T${p.hora_geracao || '00:00:00'}`
          : p.created_at || p.criado_em
        const execucaoOrigem = (p.data_execucao || a.data_execucao)
          ? `${p.data_execucao || a.data_execucao}T${p.hora_execucao || a.hora_execucao || a.hora_auditoria || '00:00:00'}`
          : a.created_at || a.criado_em
        const geracao = separarDataHora(geracaoOrigem)
        const execucao = separarDataHora(execucaoOrigem)
        const dataExecucao = p.data_execucao || a.data_execucao || a.data_auditoria || execucao.data
        const horaExecucao = p.hora_execucao || a.hora_execucao || a.hora_auditoria || execucao.hora
        return registros.map(nc => ({
          pauta_id:                   p.id || '',
          'No. AS':                   numeroAS,
          usuario_criacao:            p.usuario_criacao || p.usuario_criador || p.criado_por || p.created_by || p.usuario_registro || '',
          data_geracao:               p.data_geracao || geracao.data,
          hora_geracao:               p.hora_geracao || geracao.hora,
          auditoria_id:               p.auditoria_id || a.id || '',
          fiscal:                     a.fiscal || p.fiscal_login || '',
          matricula:                  a.matricula || '',
          prefixo:                    p.prefixo || a.prefixo || '',
          os:                         p.os || a.os || '',
          uc:                         p.uc || a.uc || '',
          data_prevista:              p.data_prevista || a.data_prevista || '',
          data_execucao:              dataExecucao,
          hora_execucao:              horaExecucao,
          tipo_servico:               p.tipo_servico || a.tipo_servico || '',
          produtivo:                  typeof a.produtivo === 'boolean' ? (a.produtivo ? 'PRODUTIVO' : 'IMPRODUTIVO') : '',
          status:                     p.status || '',
          Status_Conclusao_Pauta:     statusConclusaoPauta(p, a),
          feedback:                   a.feedback || '',
          observacao_pauta:           p.observacao || '',
          observacao_auditoria:       a.observacao || a.observacoes || '',
          nome_eletricista:           p.nome_eletricista || a.nome_eletricista || '',
          nome_eletricista2:          p.nome_eletricista2 || a.nome_eletricista2 || '',
          tipo_auditoria:             p.tipo_auditoria || a.tipo_auditoria || '',
          qtde_cabos_os:              p.qtde_cabos_os ?? a.qtde_cabos_os ?? '',
          qtde_cabos_em_campo:        a.qtde_cabos_em_campo ?? p.qtde_cabos_em_campo ?? '',
          reaberta:                   a.reaberta ? 'SIM' : (a.id ? 'NAO' : ''),
          motivo_auditoria:           p.motivo_auditoria || a.motivo_auditoria || '',
          avaliacao_motivo_auditoria: a.avaliacao_motivo_auditoria || p.avaliacao_motivo_auditoria || nc?.avaliacao_motivo_auditoria || '',
          item_id:                    nc?.item_id || '',
          item_nao_conforme:          nc?.item_texto || '',
          status_tratamento:          nc?.status_tratamento || '',
        }))
      })
  
      linhas.sort((x, y) => {
        if (x.data_prevista !== y.data_prevista) return y.data_prevista.localeCompare(x.data_prevista)
        if ((x.prefixo || '') !== (y.prefixo || '')) return (x.prefixo || '').localeCompare(y.prefixo || '')
        return String(x.pauta_id || '').localeCompare(String(y.pauta_id || ''))
      })
      const colNames = [
        'pauta_id',
        'No. AS',
        'usuario_criacao',
        'data_geracao',
        'hora_geracao',
        'auditoria_id',
        'fiscal',
        'matricula',
        'prefixo',
        'os',
        'uc',
        'data_prevista',
        'data_execucao',
        'hora_execucao',
        'tipo_servico',
        'produtivo',
        'status',
        'Status_Conclusao_Pauta',
        'feedback',
        'observacao_pauta',
        'observacao_auditoria',
        'nome_eletricista',
        'nome_eletricista2',
        'tipo_auditoria',
        'qtde_cabos_os',
        'qtde_cabos_em_campo',
        'reaberta',
        'motivo_auditoria',
        'avaliacao_motivo_auditoria',
        'item_id',
        'item_nao_conforme',
        'status_tratamento',
      ]
      const ws = XLSX.utils.json_to_sheet(linhas, { header: colNames })
      ws['!cols'] = colNames.map(col => {
        const maxLen = Math.max(col.length, ...linhas.map(r => String(r[col] ?? '').length))
        return { wch: Math.min(maxLen + 2, 60) }
      })
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Acompanhamento Pautas')
      const hoje = new Date().toISOString().split('T')[0]
      XLSX.writeFile(wb, `acompanhamento_pautas_${ini}_a_${fim}_gerado_${hoje}.xlsx`)
      const pautasComAuditoria = pautasRel.filter(p => p.auditoria_id).length
      alert(
        `✅ Relatório gerado: ${linhas.length} linha(s), ${pautasRel.length} pauta(s), ` +
        `${pautasComAuditoria} concluída(s) vinculada(s) e ${ncs.length} não conformidade(s).`
      )
    } catch (e) {
      alert('❌ Erro ao gerar relatório: ' + e.message)
    } finally {
      setBaixandoNcs(false)
    }
  }

  const enriquecerComEletricistas = async (pautas) => {
    const matriculas = [...new Set(
      pautas.flatMap(p => [p.matricula_eletricista1, p.matricula_eletricista2])
        .filter(m => m && m.length > 0)
    )]
    if (matriculas.length === 0) return pautas
    const { data: eletricistas, error } = await supabase
      .from('estrutura_equipes')
      .select('matricula, colaborador')
      .in('matricula', matriculas)
    if (error) { console.warn('⚠️ Erro ao buscar eletricistas:', error.message); return pautas }
    const mapNomes = {}
    ;(eletricistas || []).forEach(e => {
      if (!mapNomes[String(e.matricula)]) mapNomes[String(e.matricula)] = (e.colaborador || '').trim().toUpperCase()
    })
    return pautas.map(p => {
      const nome1 = p.matricula_eletricista1 ? mapNomes[p.matricula_eletricista1] : ''
      const nome2 = p.matricula_eletricista2 ? mapNomes[p.matricula_eletricista2] : ''
      return {
        ...p,
        matricula_eletricista1: nome1 ? p.matricula_eletricista1 : '',
        matricula_eletricista2: nome2 ? p.matricula_eletricista2 : '',
        nome_eletricista:       nome1 || '',
        nome_eletricista2:      nome2 || '',
      }
    })
  }

  const lerArquivo = (file) => {
    setCsvStatus(''); setCsvPreview([])
    const ext = file.name.split('.').pop().toLowerCase()
    if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const wb    = XLSX.read(e.target.result, { type: 'array' })
          const ws    = wb.Sheets[wb.SheetNames[0]]
          const dados = XLSX.utils.sheet_to_json(ws, { defval: '' })
          if (dados.length === 0) { setCsvStatus('❌ Planilha vazia.'); return }
          const cols = Object.keys(dados[0])
          const linhas = [cols.join(';'), ...dados.map(row => cols.map(c => String(row[c] ?? '')).join(';'))]
          setCsvTexto(linhas.join('\n'))
          const preview = dados.slice(0, 3).map(r => normalizarPauta(
            Object.fromEntries(Object.entries(r).map(([k, v]) => [
              k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_'), v
            ]))
          ))
          setCsvPreview(preview)
          setCsvStatus(`✅ Arquivo lido: ${dados.length} linha(s) encontrada(s). Clique em Importar para salvar.`)
        } catch (err) { setCsvStatus('❌ Erro ao ler Excel: ' + err.message) }
      }
      reader.readAsArrayBuffer(file)
    } else {
      const reader = new FileReader()
      reader.onload = e => {
        const buffer = e.target.result
        let texto, encoding
        try { texto = new TextDecoder('utf-8', { fatal: true }).decode(buffer); encoding = 'UTF-8' }
        catch { texto = new TextDecoder('windows-1252').decode(buffer); encoding = 'Windows-1252' }
        setCsvTexto(texto)
        const objs = parseCsvLinhas(texto)
        if (objs.length === 0) { setCsvStatus('❌ Nenhuma linha encontrada.'); return }
        setCsvPreview(objs.slice(0, 3).map(normalizarPauta))
        setCsvStatus(`✅ Arquivo lido (${encoding}): ${objs.length} linha(s). Clique em Importar para salvar.`)
      }
      reader.readAsArrayBuffer(file)
    }
  }

  const onFileChange = e => { const file = e.target.files?.[0]; if (file) lerArquivo(file); e.target.value = '' }

  const importarCsv = async () => {
    if (!csvTexto.trim()) { setCsvStatus('❌ Nenhum dado para importar.'); return }
    setCsvStatus('importando')
    try {
      const objs = parseCsvLinhas(csvTexto)
      let pautasNovas = objs.map(normalizarPauta).filter(p => p.prefixo && p.fiscal_login)
      if (pautasNovas.length === 0) {
        setCsvStatus('❌ Nenhuma linha válida. Verifique se prefixo e fiscal_login estão preenchidos.')
        return
      }
      pautasNovas = await enriquecerComEletricistas(pautasNovas)
      for (const p of pautasNovas) await criarPauta({ ...p, ...dadosCriacaoPauta() })
      const comEletricistas = pautasNovas.filter(p => p.nome_eletricista || p.nome_eletricista2).length
      setCsvStatus(`✅ ${pautasNovas.length} pauta(s) importada(s)!${comEletricistas > 0 ? ` ${comEletricistas} com eletricistas.` : ''}`)
      setStatusTab('PENDENTE')
      await carregar()
      setTimeout(() => { setCsvModal(false); setCsvTexto(''); setCsvStatus(''); setCsvPreview([]) }, 2500)
    } catch (e) { setCsvStatus('❌ Erro: ' + e.message) }
  }

  const fecharCsvModal = () => { setCsvModal(false); setCsvTexto(''); setCsvStatus(''); setCsvPreview([]) }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>

      {/* Header */}
      <div style={{ background: '#d97706', padding: '18px 20px', color: '#fff' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14,
          }}>← Voltar para Home</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800 }}>📋 Pauta de Fiscalização</h1>
              <p style={{ fontSize: 12, opacity: 0.8, marginTop: 3 }}>
                Equipes obrigatórias para fiscalização
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
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['PENDENTE','VENCIDA','CONCLUIDA'].map(s => (
                <div key={s} style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '6px 10px', textAlign: 'center', minWidth: 50 }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{counts[s]}</div>
                  <div style={{ fontSize: 9, opacity: 0.8 }}>{s}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 16px 80px' }}>

        <PainelFiltros
          filtros={filtros}
          titulo="🔍 Filtros das Pautas"
          badge="período por data prevista"
          extras={
            <div>
              <label style={LABEL_STYLE}>No. AS</label>
              <input
                value={numeroASFiltro}
                onChange={e => setNumeroASFiltro(e.target.value.toUpperCase())}
                placeholder="AS-..."
                style={INPUT_STYLE}
              />
            </div>
          }
        />

        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={abrirNovo} style={{
            background: '#d97706', color: '#fff', border: 'none',
            padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>+ Nova Pauta</button>
          <button onClick={() => setCsvModal(true)} style={{
            background: '#0f766e', color: '#fff', border: 'none',
            padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>📥 Importar CSV</button>
          <button onClick={baixarRelatorioNCs} disabled={baixandoNcs} style={{
            background: baixandoNcs ? '#94a3b8' : '#dc2626', color: '#fff', border: 'none',
            padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700,
            cursor: baixandoNcs ? 'not-allowed' : 'pointer',
          }}>{baixandoNcs ? '⏳ Gerando...' : '📊 Relatório de NCs (Excel)'}</button>
          {counts.VENCIDA > 0 && (
            <button onClick={whatsappVencidas} style={{
              background: '#25d366', color: '#fff', border: 'none',
              padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>📲 WhatsApp Vencidas ({counts.VENCIDA})</button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {['TODOS','PENDENTE','VENCIDA','CONCLUIDA','CANCELADA'].map(f => (
            <button key={f} onClick={() => setStatusTab(f)} style={{
              padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
              background: statusTab === f ? '#d97706' : '#e2e8f0',
              color: statusTab === f ? '#fff' : '#374151',
            }}>{f}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Carregando...</div>
        ) : pautasExibidas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
            <p>Nenhuma pauta encontrada para os filtros selecionados</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pautasExibidas.map(p => {
              const s  = calcStatus(p)
              const sc = statusCor(s)
              return (
                <div key={p.id} style={{
                  background: '#fff', borderRadius: 14,
                  border: `1.5px solid ${s === 'VENCIDA' ? '#fca5a5' : s === 'CONCLUIDA' ? '#86efac' : '#e2e8f0'}`,
                  padding: '14px 16px', opacity: p.status === 'CANCELADA' ? 0.6 : 1,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>{p.prefixo}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.color }}>{sc.label}</span>
                        <span style={{ fontSize: 10, background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 20 }}>🔁 {RECORRENCIA_LABEL[p.recorrencia]}</span>
                      </div>
                      {p.numero_as && (
                        <div style={{ fontSize: 12, color: '#475569', fontWeight: 600, lineHeight: 1.6, marginBottom: 2 }}>
                          No. AS: {p.numero_as}
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
                        <span>👤 {p.fiscal_login}</span>
                        <span style={{ margin: '0 8px' }}>·</span>
                        <span>📅 {p.data_prevista}</span>
                        <span style={{ margin: '0 8px' }}>·</span>
                        <span>🔧 {p.tipo_servico} — {p.tipo_auditoria === 'DESEMPENHO' ? 'Desempenho' : 'Pós Serviço'}</span>
                      </div>
                      {(p.os || p.uc) && (
                        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6, marginTop: 2 }}>
                          {p.os && <span>📄 OS: <strong>{p.os}</strong></span>}
                          {p.os && p.uc && <span style={{ margin: '0 8px' }}>·</span>}
                          {p.uc && <span>🏠 UC: <strong>{p.uc}</strong></span>}
                        </div>
                      )}
                      {(p.nome_eletricista || p.nome_eletricista2) && (
                        <div style={{ fontSize: 12, color: '#0c4a6e', lineHeight: 1.6, marginTop: 2, fontWeight: 600 }}>
                          👷 {[p.nome_eletricista, p.nome_eletricista2].filter(Boolean).join(' | ')}
                        </div>
                      )}
                      {p.motivo_auditoria && (
                        <div style={{ marginTop: 8, display: 'inline-block', background: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c', fontWeight: 700, fontSize: 12, padding: '4px 10px', borderRadius: 6 }}>
                          🎯 Motivo: {p.motivo_auditoria}
                        </div>
                      )}
                      {p.qtde_cabos_os && (
                        <div style={{ marginTop: 6, fontSize: 12, color: '#92400e', fontWeight: 700 }}>
                          Cabos OS: {p.qtde_cabos_os}m
                        </div>
                      )}
                      {p.observacao && (
                        <div style={{ marginTop: 6, background: '#f0f9ff', border: '1px solid #bae6fd', padding: '8px 12px', borderRadius: 8, lineHeight: 1.5 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: 0.5 }}>💬 Observação:</span>
                          <p style={{ fontSize: 12, color: '#0c4a6e', margin: '3px 0 0', wordBreak: 'break-word' }}>{p.observacao}</p>
                        </div>
                      )}
                    </div>
                    {p.status === 'PENDENTE' && (
                      <div style={{ display: 'flex', gap: 6, marginLeft: 10 }}>
                        <button onClick={() => abrirEditar(p)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#fef3c7', color: '#92400e', cursor: 'pointer', fontSize: 14 }}>✏️</button>
                        <button onClick={() => cancelar(p)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: 14 }}>✕</button>
                      </div>
                    )}
                    {(p.status === 'CONCLUIDA' || p.status === 'CANCELADA') && (
                      <button onClick={() => excluir(p)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', marginLeft: 10, background: '#f1f5f9', color: '#7c3aed', cursor: 'pointer', fontSize: 14 }}>🗑️</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Modal manual ── */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700 }}>{editando ? '✏️ Editar Pauta' : '+ Nova Pauta'}</h3>
              <button onClick={fechar} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#64748b' }}>×</button>
            </div>

            {/* ── Prefixo com validação online/offline ── */}
            <PrefixoInputValidado
              value={formData.prefixo}
              onChange={v => upd('prefixo', v)}
              onValidChange={setPrefixoValido}
            />

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
                <label className="form-label">Nº da OS</label>
                <input className="form-input" value={formData.os} onChange={e => upd('os', e.target.value)} placeholder="Ordem de Serviço" />
              </div>
              <div className="form-group">
                <label className="form-label">Nº da UC</label>
                <input className="form-input" value={formData.uc} onChange={e => upd('uc', e.target.value)} placeholder="Unidade Consumidora" />
              </div>
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
              <label className="form-label">🎯 Motivo da Auditoria</label>
              <select
                className="form-input"
                value={formData.motivo_auditoria}
                onChange={e => setFormData(f => ({
                  ...f,
                  motivo_auditoria: e.target.value,
                  qtde_cabos_os: e.target.value === MOTIVO_MATERIAL_APLICADO ? f.qtde_cabos_os : '',
                }))}
              >
                <option value="">— Sem motivo específico —</option>
                {MOTIVOS_AUDITORIA.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {formData.motivo_auditoria === MOTIVO_MATERIAL_APLICADO && (
              <div className="form-group">
                <label className="form-label">QTDE CABOS OS (Em metros)</label>
                <input
                  className="form-input"
                  value={formData.qtde_cabos_os ?? ''}
                  onChange={e => upd('qtde_cabos_os', normalizarDecimalTexto(e.target.value))}
                  placeholder="Ex: 22 ou 22.5"
                  inputMode="decimal"
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">
                💬 Observação
                <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, marginLeft: 6 }}>
                  (acentos e caracteres especiais serão removidos)
                </span>
              </label>
              <textarea
                className="form-textarea"
                value={formData.observacao}
                onChange={e => upd('observacao', e.target.value)}
                placeholder="Texto livre — aparecerá para o fiscal na hora da auditoria..."
                rows={3}
                style={{ resize: 'vertical', minHeight: 72, fontFamily: 'inherit' }}
              />
            </div>

            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                👷 Eletricistas da Equipe (opcional)
              </p>
              <p style={{ fontSize: 11, color: '#475569', marginBottom: 10, lineHeight: 1.4 }}>
                Informe as matrículas. O sistema busca os nomes automaticamente em <strong>estrutura_equipes</strong>.
                Se a matrícula não existir, será ignorada.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Matrícula 1</label>
                  <input className="form-input" value={formData.matricula_eletricista1}
                    onChange={e => upd('matricula_eletricista1', e.target.value.replace(/\D/g, ''))}
                    placeholder="Ex: 74894" inputMode="numeric" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Matrícula 2</label>
                  <input className="form-input" value={formData.matricula_eletricista2}
                    onChange={e => upd('matricula_eletricista2', e.target.value.replace(/\D/g, ''))}
                    placeholder="Ex: 12345" inputMode="numeric" />
                </div>
              </div>
              {(formData.nome_eletricista || formData.nome_eletricista2) && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#0c4a6e', fontWeight: 600 }}>
                  ✅ Vinculados: {[formData.nome_eletricista, formData.nome_eletricista2].filter(Boolean).join(' | ')}
                </div>
              )}
            </div>

            {erro && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b91c1c', marginBottom: 14 }}>
                ❌ {erro}
              </div>
            )}

            <button className="btn-primary" onClick={salvar} disabled={salvando} style={{ background: salvando ? '#64748b' : '#d97706' }}>
              {salvando ? '⏳ Salvando...' : '💾 Salvar Pauta'}
            </button>
          </div>
        </div>
      )}

      {/* ── Modal CSV ── */}
      {csvModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700 }}>📥 Importar Pautas</h3>
              <button onClick={fecharCsvModal} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#64748b' }}>×</button>
            </div>
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: 12, color: '#15803d' }}>
              <strong>Colunas obrigatórias:</strong> prefixo · fiscal_login · data_prevista<br />
              <strong>Colunas opcionais:</strong> tipo_servico · tipo_auditoria · recorrencia · observacao · <strong>motivo_auditoria</strong> · <strong>qtde_cabos_os</strong> · os · uc · <strong>matricula_eletricista1</strong> · <strong>matricula_eletricista2</strong><br /><br />
              <strong>Motivos válidos:</strong> {MOTIVOS_AUDITORIA.join(' | ')}<br /><br />
              <strong>Formatos aceitos:</strong> .xlsx · .xls · .csv (separador ; , ou Tab)<br />
              <strong>Data:</strong> DD/MM/AAAA ou AAAA-MM-DD<br />
              <strong>No. AS:</strong> gerado automaticamente para cada pauta importada
            </div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.txt" onChange={onFileChange} style={{ display: 'none' }} />
            <button onClick={() => fileRef.current?.click()} style={{
              width: '100%', padding: '14px', borderRadius: 12, border: '2px dashed #0f766e',
              background: '#f0fdfa', color: '#0f766e', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>📂 Selecionar arquivo CSV ou Excel</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>ou cole o conteúdo abaixo</span>
              <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
            </div>
            <div className="form-group">
              <textarea className="form-textarea" value={csvTexto}
                onChange={e => { setCsvTexto(e.target.value); setCsvPreview([]); setCsvStatus('') }}
                placeholder={`prefixo;fiscal_login;data_prevista;motivo_auditoria;qtde_cabos_os\nPI-THE-C001M;gileno.ribeiro;2026-06-19;MATERIAL APLICADO EM CAMPO;22`}
                rows={6} style={{ fontFamily: 'monospace', fontSize: 12 }} />
            </div>
            {csvPreview.length > 0 && (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 11 }}>
                <p style={{ fontWeight: 700, color: '#374151', marginBottom: 6 }}>👁️ Preview (primeiras linhas):</p>
                {csvPreview.map((p, i) => (
                  <div key={i} style={{ color: '#475569', marginBottom: 4, lineHeight: 1.5 }}>
                    <strong>{p.prefixo}</strong> · {p.fiscal_login} · {p.data_prevista} · {p.tipo_servico}
                    {p.motivo_auditoria ? ` · 🎯 ${p.motivo_auditoria}` : ''}
                    {p.qtde_cabos_os ? ` · Cabos OS: ${p.qtde_cabos_os}m` : ''}
                    {p.os ? ` · OS:${p.os}` : ''}{p.uc ? ` · UC:${p.uc}` : ''}
                  </div>
                ))}
              </div>
            )}
            {csvStatus && csvStatus !== 'importando' && (
              <div style={{
                marginBottom: 14, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: csvStatus.startsWith('✅') ? '#f0fdf4' : '#fef2f2',
                color: csvStatus.startsWith('✅') ? '#15803d' : '#b91c1c',
                border: `1px solid ${csvStatus.startsWith('✅') ? '#86efac' : '#fecaca'}`,
              }}>{csvStatus}</div>
            )}
            <button onClick={importarCsv} disabled={!csvTexto.trim() || csvStatus === 'importando'} style={{
              width: '100%', padding: '14px', borderRadius: 12, border: 'none',
              background: !csvTexto.trim() || csvStatus === 'importando' ? '#94a3b8' : '#0f766e',
              color: '#fff', fontSize: 15, fontWeight: 700, cursor: !csvTexto.trim() ? 'not-allowed' : 'pointer',
            }}>{csvStatus === 'importando' ? '⏳ Importando...' : '📥 Importar Pautas'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
