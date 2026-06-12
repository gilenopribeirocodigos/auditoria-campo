import { useState, useEffect, useRef, useMemo } from 'react'
import { listarPautas, criarPauta, atualizarPauta, deletarPauta } from '../lib/pautas.js'
import { supabase } from '../lib/supabase.js'
import * as XLSX from 'xlsx'
import {
  useFiltrosOperacionais,
  PainelFiltros,
  FIELD_HEIGHT,
} from '../components/PainelFiltros.jsx'

const TIPOS_SERVICO     = ['CORTE', 'ANEXO', 'RELIGA', 'EMERGENCIAL']
const RECORRENCIAS      = ['UNICA', 'DIARIA', 'SEMANAL']
const RECORRENCIA_LABEL = { UNICA: 'Única', DIARIA: 'Diária', SEMANAL: 'Semanal' }

// ─── Motivos pré-definidos para Motivo Auditoria ──────────────────────────────
// Para adicionar novos motivos no futuro, basta incluir aqui.
const MOTIVOS_AUDITORIA = [
  'MATERIAL APLICADO EM CAMPO',
  'RELIGA VINCULADA',
]

const FORM_VAZIO = {
  prefixo: '', fiscal_login: '', data_prevista: new Date().toISOString().split('T')[0],
  tipo_servico: 'CORTE', tipo_auditoria: 'DESEMPENHO',
  recorrencia: 'UNICA', observacao: '', os: '', uc: '',
  motivo_auditoria: '', // novo campo
}

// ─── Limpa caracteres especiais e acentos ─────────────────────────────────────
// Remove: ç→c, ã→a, ó→o, é→e, caracteres inválidos de encoding (\uFFFD), etc.
// Preserva: letras A-Z, dígitos, espaços, pontuação ASCII básica (- . , ; / etc).
// Usado tanto na importação CSV/Excel quanto no cadastro manual.
function limparTexto(texto) {
  if (texto === null || texto === undefined) return ''
  return String(texto)
    .normalize('NFD')                       // separa letras de acentos
    .replace(/[\u0300-\u036f]/g, '')        // remove diacríticos (acentos)
    .replace(/[–—−]/g, '-')                 // normaliza dashes exóticos → hyphen ASCII
    .replace(/[“”]/g, '"')                  // normaliza aspas exóticas
    .replace(/[‘’]/g, "'")                  // normaliza apóstrofos exóticos
    .replace(/[^\x20-\x7E]/g, '')           // remove qualquer outro caractere não-ASCII
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

// ─── Detecta separador e parseia linhas ────────────────────────────────────────
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
  // Limpa TODOS os campos de uma vez (remove acentos e caracteres inválidos)
  const c = Object.fromEntries(
    Object.entries(obj || {}).map(([k, v]) => [k, limparTexto(v)])
  )

  const ts = (c.tipo_servico || '').toUpperCase()
  const tipoServico = TIPOS_SERVICO.includes(ts) ? ts : 'CORTE'

  const ta = (c.tipo_auditoria || '').toUpperCase()
  // Após limparTexto, "PÓS" virou "POS", então só precisamos checar "POS"
  const tipoAuditoria = ta.includes('POS') ? 'POS_SERVICO' : 'DESEMPENHO'

  const rc = (c.recorrencia || '').toUpperCase()
  const recorrencia = ['UNICA','DIARIA','SEMANAL'].includes(rc) ? rc : 'UNICA'

  // ─── Motivo Auditoria — normaliza/valida ───
  const ma = (c.motivo_auditoria || '').toUpperCase()
  const motivoAuditoria = MOTIVOS_AUDITORIA.includes(ma) ? ma : ''

  let data = c.data_prevista || ''
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) {
    const [d, m, a] = data.split('/')
    data = `${a}-${m}-${d}`
  }
  if (!data) data = new Date().toISOString().split('T')[0]

  return {
    prefixo:          (c.prefixo || '').toUpperCase(),
    fiscal_login:     (c.fiscal_login || c.fiscal || '').toLowerCase(),
    data_prevista:    data,
    tipo_servico:     tipoServico,
    tipo_auditoria:   tipoAuditoria,
    recorrencia,
    observacao:       c.observacao || '',
    motivo_auditoria: motivoAuditoria,
    os:               c.os || '',
    uc:               c.uc || '',
    status:           'PENDENTE',
  }
}

export default function GestaoPauta({ usuarioLogado, onVoltar }) {
  // ─── Hook do painel: Período (data_prevista) + Sup. Op + Sup. Campo + Prefixo ───
  const filtros = useFiltrosOperacionais({ inicializarMes: true })

  const [pautas,      setPautas]      = useState([])
  const [fiscais,     setFiscais]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [modal,       setModal]       = useState(false)
  const [editando,    setEditando]    = useState(null)
  const [formData,    setFormData]    = useState(FORM_VAZIO)
  const [salvando,    setSalvando]    = useState(false)
  const [erro,        setErro]        = useState('')
  const [statusTab,   setStatusTab]   = useState('TODOS')
  const [csvModal,    setCsvModal]    = useState(false)
  const [csvTexto,    setCsvTexto]    = useState('')
  const [csvStatus,   setCsvStatus]   = useState('')
  const [csvPreview,  setCsvPreview]  = useState([])
  const [prefixoSugs, setPrefixoSugs] = useState([])
  const [baixandoNcs, setBaixandoNcs] = useState(false)
  const prefixoRef  = useRef(null)
  const intervalRef = useRef(null)
  const fileRef     = useRef(null)

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

  useEffect(() => {
    const handler = e => {
      if (prefixoRef.current && !prefixoRef.current.contains(e.target)) setPrefixoSugs([])
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const upd         = (k, v) => setFormData(f => ({ ...f, [k]: v }))
  const abrirNovo   = () => { setEditando(null); setFormData(FORM_VAZIO); setErro(''); setPrefixoSugs([]); setModal(true) }
  const abrirEditar = p  => {
    setEditando(p)
    setFormData({
      ...FORM_VAZIO,  // garante todos os campos padrão (inclusive motivo_auditoria)
      ...p,
      os: p.os || '', uc: p.uc || '',
      motivo_auditoria: p.motivo_auditoria || '',
    })
    setErro(''); setPrefixoSugs([]); setModal(true)
  }
  const fechar      = () => { setModal(false); setErro(''); setPrefixoSugs([]) }

  const onPrefixoChange = async v => {
    upd('prefixo', v)
    if (v.length < 2) { setPrefixoSugs([]); return }
    const { data } = await supabase
      .from('estrutura_equipes').select('prefixo')
      .ilike('prefixo', `%${v}%`).order('prefixo').limit(10)
    if (data) setPrefixoSugs([...new Set(data.map(r => r.prefixo))])
  }

  const salvar = async () => {
    if (!formData.prefixo || !formData.fiscal_login || !formData.data_prevista) {
      setErro('Prefixo, fiscal e data são obrigatórios.'); return
    }
    setSalvando(true); setErro('')
    try {
      // ─── Limpa caracteres especiais antes de salvar (digitação manual) ───
      const payload = {
        ...formData,
        prefixo:    limparTexto(formData.prefixo).toUpperCase(),
        observacao: limparTexto(formData.observacao),
        os:         limparTexto(formData.os),
        uc:         limparTexto(formData.uc),
      }
      if (editando) await atualizarPauta(editando.id, payload)
      else          await criarPauta({ ...payload, status: 'PENDENTE' })
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

  // ─── Pautas filtradas pelo PAINEL (período + supervisor + prefixo) ───
  const pautasFiltradasPainel = useMemo(() => {
    const { ini, fim } = filtros.getDatasQuery()
    return pautas.filter(p => {
      if (ini && p.data_prevista < ini) return false
      if (fim && p.data_prevista > fim) return false
      const filtroAtivo =
        filtros.selSupOp.length    > 0 ||
        filtros.selSupCampo.length > 0 ||
        filtros.selPrefixos.length > 0
      if (!filtroAtivo) return true
      const info = filtros.mapPrefixo[p.prefixo]
      if (!info) return false
      if (filtros.selPrefixos.length > 0 && !filtros.selPrefixos.includes(p.prefixo)) return false
      if (filtros.selSupOp.length    > 0 && !filtros.selSupOp.includes(info.op))      return false
      if (filtros.selSupCampo.length > 0 && !filtros.selSupCampo.includes(info.campo)) return false
      return true
    })
  }, [pautas, filtros.modoPeriodo, filtros.mesAno, filtros.dataIni, filtros.dataFim,
      filtros.selSupOp, filtros.selSupCampo, filtros.selPrefixos, filtros.mapPrefixo])

  const pautasExibidas = pautasFiltradasPainel.filter(p => {
    const s = calcStatus(p)
    if (statusTab === 'TODOS')   return true
    if (statusTab === 'VENCIDA') return s === 'VENCIDA'
    return p.status === statusTab
  })

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

  // ═══════════════════════════════════════════════════════════════════════════
  // RELATÓRIO DE NÃO CONFORMIDADES (Excel)
  // ═══════════════════════════════════════════════════════════════════════════
  // Arquitetura atual (refatorada):
  // 1. Valida limite de 90 dias entre data_ini e data_fim
  // 2. Carrega auditorias do período (com filtros hierárquicos do painel)
  // 3. SELECT direto na auditorias_nao_conformes (preenchida automaticamente
  //    ao salvar a auditoria no S6Resultado)
  // 4. JOIN em memória: NCs + auditorias + pautas
  // 5. Gera Excel
  //
  // OBS: não popula mais a tabela aqui — quem popula é o S6Resultado ao salvar.
  // ═══════════════════════════════════════════════════════════════════════════
  const LIMITE_DIAS_NCS = 90  // máximo de 90 dias por exportação

  const baixarRelatorioNCs = async () => {
    setBaixandoNcs(true)
    try {
      const { ini, fim } = filtros.getDatasQuery()

      // ── 1. Validação do período ──
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

      // ── 2. Determina prefixos permitidos pelos filtros hierárquicos ──
      const filtroHierarquicoAtivo =
        filtros.selSupOp.length    > 0 ||
        filtros.selSupCampo.length > 0 ||
        filtros.selPrefixos.length > 0

      let prefixosPermitidos = null
      if (filtroHierarquicoAtivo) {
        prefixosPermitidos = Object.entries(filtros.mapPrefixo)
          .filter(([pref, info]) => {
            if (filtros.selPrefixos.length > 0 && !filtros.selPrefixos.includes(pref))     return false
            if (filtros.selSupOp.length    > 0 && !filtros.selSupOp.includes(info.op))     return false
            if (filtros.selSupCampo.length > 0 && !filtros.selSupCampo.includes(info.campo)) return false
            return true
          })
          .map(([pref]) => pref)

        if (prefixosPermitidos.length === 0) {
          alert('Nenhum prefixo bate com os filtros hierárquicos selecionados.')
          return
        }
      }

      // ── 3. Busca auditorias do período ──
      let qA = supabase.from('auditorias').select('*')
        .gte('data_auditoria', ini)
        .lte('data_auditoria', fim)
      if (prefixosPermitidos !== null) qA = qA.in('prefixo', prefixosPermitidos)

      const { data: auditorias, error: aErr } = await qA
      if (aErr) throw aErr

      if (!auditorias || auditorias.length === 0) {
        alert('Nenhuma auditoria encontrada no período/filtros selecionados.')
        return
      }

      const auditoriaIds = auditorias.map(a => a.id)
      const mapAuditorias = {}
      auditorias.forEach(a => { mapAuditorias[a.id] = a })

      // ── 4. SELECT direto na auditorias_nao_conformes ──
      const { data: ncs, error: ncErr } = await supabase
        .from('auditorias_nao_conformes')
        .select('*')
        .in('auditoria_id', auditoriaIds)
      if (ncErr) throw ncErr

      if (!ncs || ncs.length === 0) {
        alert(
          '🎉 Nenhuma não conformidade encontrada no período!\n\n' +
          'Possíveis razões:\n' +
          '• Todas as auditorias do período foram 100% conformes\n' +
          '• As auditorias antigas (antes do sistema novo) ainda não foram processadas\n' +
          '  → Para processar antigas, simule uma nova auditoria ou peça pra rodar o catch-up manual'
        )
        return
      }

      // ── 5. Busca pautas vinculadas (pra trazer motivo_auditoria e status_2) ──
      const { data: pautasRel, error: pErr } = await supabase
        .from('pautas').select('*')
        .in('auditoria_id', auditoriaIds)
      if (pErr) console.warn('⚠️ Erro ao buscar pautas:', pErr.message)

      const mapPautas = {}
      ;(pautasRel || []).forEach(p => { mapPautas[p.auditoria_id] = p })

      // ── 6. Combina tudo em linhas pra Excel ──
      const linhas = ncs.map(nc => {
        const a = mapAuditorias[nc.auditoria_id] || {}
        const p = mapPautas[nc.auditoria_id] || {}
        return {
          auditoria_id:      nc.auditoria_id,
          fiscal:            a.fiscal || '',
          matricula:         a.matricula || '',
          prefixo:           a.prefixo || '',
          os:                a.os || '',
          uc:                a.uc || '',
          data_auditoria:    a.data_auditoria || '',
          hora_auditoria:    a.hora_auditoria || '',
          tipo_servico:      a.tipo_servico || '',
          produtivo:         a.produtivo ? 'PRODUTIVO' : 'IMPRODUTIVO',
          status:            a.status || '',
          status_2:          p.status || '',
          feedback:          a.feedback || '',
          observacao:        a.observacao || a.observacoes || '',
          nome_eletricista:  a.nome_eletricista || '',
          nome_eletricista2: a.nome_eletricista2 || '',
          tipo_auditoria:    a.tipo_auditoria || '',
          reaberta:          a.reaberta ? 'SIM' : 'NAO',
          motivo_auditoria:  p.motivo_auditoria || '',
          item_id:           nc.item_id || '',
          item_nao_conforme: nc.item_texto || '',
          status_tratamento: nc.status_tratamento || 'PENDENTE',
        }
      })

      // Ordena: data_auditoria DESC, depois prefixo
      linhas.sort((x, y) => {
        if (x.data_auditoria !== y.data_auditoria) return y.data_auditoria.localeCompare(x.data_auditoria)
        return (x.prefixo || '').localeCompare(y.prefixo || '')
      })

      // ── 7. Gera Excel com auto-fit ──
      const ws = XLSX.utils.json_to_sheet(linhas)
      const colNames = Object.keys(linhas[0])
      ws['!cols'] = colNames.map(col => {
        const maxLen = Math.max(
          col.length,
          ...linhas.map(r => String(r[col] ?? '').length)
        )
        return { wch: Math.min(maxLen + 2, 60) }
      })

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Nao Conformidades')

      const hoje = new Date().toISOString().split('T')[0]
      XLSX.writeFile(wb, `nao_conformidades_${ini}_a_${fim}_gerado_${hoje}.xlsx`)

      const auditoriasComNc = new Set(ncs.map(n => n.auditoria_id)).size
      alert(`✅ Relatório gerado: ${linhas.length} não conformidade(s) em ${auditoriasComNc} auditoria(s).`)
    } catch (e) {
      alert('❌ Erro ao gerar relatório: ' + e.message)
    } finally {
      setBaixandoNcs(false)
    }
  }

  // ─── Importação CSV/Excel ────────────────────────────────────────────────
  const lerArquivo = (file) => {
    setCsvStatus('')
    setCsvPreview([])
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
          const linhas = [
            cols.join(';'),
            ...dados.map(row => cols.map(c => String(row[c] ?? '')).join(';'))
          ]
          const texto = linhas.join('\n')
          setCsvTexto(texto)
          const preview = dados.slice(0, 3).map(r => normalizarPauta(
            Object.fromEntries(Object.entries(r).map(([k, v]) => [
              k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_'), v
            ]))
          ))
          setCsvPreview(preview)
          setCsvStatus(`✅ Arquivo lido: ${dados.length} linha(s) encontrada(s). Clique em Importar para salvar.`)
        } catch (err) {
          setCsvStatus('❌ Erro ao ler Excel: ' + err.message)
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      // ─── Leitura inteligente: tenta UTF-8 → se falhar, usa Windows-1252 ───
      // Excel BR normalmente salva CSV em Windows-1252 (Latin-1), não em UTF-8.
      // Isso é o que causava "POS SERVI�O" no preview.
      const reader = new FileReader()
      reader.onload = e => {
        const buffer = e.target.result
        let texto, encoding
        try {
          texto = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
          encoding = 'UTF-8'
        } catch {
          // Bytes não-UTF-8 detectados → cai pra Windows-1252 (Excel BR padrão)
          texto = new TextDecoder('windows-1252').decode(buffer)
          encoding = 'Windows-1252'
        }
        setCsvTexto(texto)
        const objs = parseCsvLinhas(texto)
        if (objs.length === 0) { setCsvStatus('❌ Nenhuma linha encontrada. Verifique o arquivo.'); return }
        const preview = objs.slice(0, 3).map(normalizarPauta)
        setCsvPreview(preview)
        setCsvStatus(`✅ Arquivo lido (${encoding}): ${objs.length} linha(s) encontrada(s). Acentos e caracteres especiais serão tratados automaticamente. Clique em Importar para salvar.`)
      }
      reader.readAsArrayBuffer(file)
    }
  }

  const onFileChange = e => {
    const file = e.target.files?.[0]
    if (file) lerArquivo(file)
    e.target.value = ''
  }

  const importarCsv = async () => {
    if (!csvTexto.trim()) { setCsvStatus('❌ Nenhum dado para importar.'); return }
    setCsvStatus('importando')
    try {
      const objs = parseCsvLinhas(csvTexto)
      const pautasNovas = objs.map(normalizarPauta).filter(p => p.prefixo && p.fiscal_login)

      if (pautasNovas.length === 0) {
        setCsvStatus('❌ Nenhuma linha válida encontrada. Verifique se prefixo e fiscal_login estão preenchidos.')
        return
      }

      for (const p of pautasNovas) await criarPauta(p)

      setCsvStatus(`✅ ${pautasNovas.length} pauta(s) importada(s) com sucesso!`)
      await carregar()
      setTimeout(() => { setCsvModal(false); setCsvTexto(''); setCsvStatus(''); setCsvPreview([]) }, 2000)
    } catch (e) {
      setCsvStatus('❌ Erro: ' + e.message)
    }
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
              <p style={{ fontSize: 12, opacity: 0.8, marginTop: 3 }}>Equipes obrigatórias para fiscalização</p>
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

        {/* PAINEL DE FILTROS */}
        <PainelFiltros
          filtros={filtros}
          titulo="🔍 Filtros das Pautas"
          badge="período por data prevista"
        />

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

        {/* Tabs de status */}
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
                      {(p.os || p.uc) && (
                        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6, marginTop: 2 }}>
                          {p.os && <span>📄 OS: <strong>{p.os}</strong></span>}
                          {p.os && p.uc && <span style={{ margin: '0 8px' }}>·</span>}
                          {p.uc && <span>🏠 UC: <strong>{p.uc}</strong></span>}
                        </div>
                      )}

                      {/* ─── Motivo Auditoria (destacado em laranja) ─── */}
                      {p.motivo_auditoria && (
                        <div style={{
                          marginTop: 8, display: 'inline-block',
                          background: '#fff7ed', border: '1px solid #fed7aa',
                          color: '#c2410c', fontWeight: 700, fontSize: 12,
                          padding: '4px 10px', borderRadius: 6,
                        }}>
                          🎯 Motivo: {p.motivo_auditoria}
                        </div>
                      )}

                      {/* ─── Observação (destacada em azul, texto completo) ─── */}
                      {p.observacao && (
                        <div style={{
                          marginTop: 6, background: '#f0f9ff', border: '1px solid #bae6fd',
                          padding: '8px 12px', borderRadius: 8, lineHeight: 1.5,
                        }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            💬 Observação:
                          </span>
                          <p style={{ fontSize: 12, color: '#0c4a6e', margin: '3px 0 0', wordBreak: 'break-word' }}>
                            {p.observacao}
                          </p>
                        </div>
                      )}
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

      {/* ── Modal manual ── */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700 }}>{editando ? '✏️ Editar Pauta' : '+ Nova Pauta'}</h3>
              <button onClick={fechar} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#64748b' }}>×</button>
            </div>

            <div className="form-group" style={{ position: 'relative' }} ref={prefixoRef}>
              <label className="form-label">Prefixo da Equipe *</label>
              <input className="form-input" value={formData.prefixo} onChange={e => onPrefixoChange(e.target.value)} placeholder="Digite para buscar (ex: PI-THE)" />
              {prefixoSugs.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto' }}>
                  {prefixoSugs.map((s, i) => (
                    <button key={i} onClick={() => { upd('prefixo', s); setPrefixoSugs([]) }} style={{ display: 'block', width: '100%', padding: '11px 14px', textAlign: 'left', background: 'none', border: 'none', borderBottom: i < prefixoSugs.length - 1 ? '1px solid #f1f5f9' : 'none', fontSize: 13, color: '#1e293b', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >{s}</button>
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

            {/* ─── NOVO CAMPO: Motivo da Auditoria ─── */}
            <div className="form-group">
              <label className="form-label">🎯 Motivo da Auditoria</label>
              <select className="form-input" value={formData.motivo_auditoria} onChange={e => upd('motivo_auditoria', e.target.value)}>
                <option value="">— Sem motivo específico —</option>
                {MOTIVOS_AUDITORIA.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {/* ─── Observação como TEXTAREA (espaço pra escrita) ─── */}
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
              <strong>Colunas opcionais:</strong> tipo_servico · tipo_auditoria · recorrencia · observacao · <strong>motivo_auditoria</strong> · os · uc<br /><br />
              <strong>Motivos válidos:</strong> {MOTIVOS_AUDITORIA.join(' | ')}<br /><br />
              <strong>Formatos aceitos:</strong> .xlsx · .xls · .csv (separador ; , ou Tab)<br />
              <strong>Data:</strong> DD/MM/AAAA ou AAAA-MM-DD<br /><br />
              <strong style={{ color: '#0369a1' }}>✨ Tratamento automático:</strong> acentos (ç, ã, õ, é...) e caracteres especiais são removidos automaticamente. Pode escrever normalmente no Excel.
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,.txt"
              onChange={onFileChange}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              style={{
                width: '100%', padding: '14px', borderRadius: 12, border: '2px dashed #0f766e',
                background: '#f0fdfa', color: '#0f766e', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', marginBottom: 14, display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 8,
              }}
            >
              📂 Selecionar arquivo CSV ou Excel
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>ou cole o conteúdo abaixo</span>
              <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
            </div>

            <div className="form-group">
              <textarea
                className="form-textarea"
                value={csvTexto}
                onChange={e => { setCsvTexto(e.target.value); setCsvPreview([]); setCsvStatus('') }}
                placeholder={`prefixo;fiscal_login;data_prevista;tipo_servico;tipo_auditoria;recorrencia;observacao;motivo_auditoria;os;uc\nPI-THE-C001M;gileno.ribeiro;2026-06-19;CORTE;DESEMPENHO;UNICA;Verificar material aplicado;MATERIAL APLICADO EM CAMPO;1234;6789`}
                rows={6}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>

            {csvPreview.length > 0 && (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 11 }}>
                <p style={{ fontWeight: 700, color: '#374151', marginBottom: 6 }}>👁️ Preview (primeiras linhas):</p>
                {csvPreview.map((p, i) => (
                  <div key={i} style={{ color: '#475569', marginBottom: 4, lineHeight: 1.5 }}>
                    <strong>{p.prefixo}</strong> · {p.fiscal_login} · {p.data_prevista} · {p.tipo_servico} · {p.tipo_auditoria} · {p.recorrencia}
                    {p.motivo_auditoria ? ` · 🎯 ${p.motivo_auditoria}` : ''}
                    {p.os ? ` · OS:${p.os}` : ''}{p.uc ? ` · UC:${p.uc}` : ''}
                    {p.observacao ? ` · 💬 ${p.observacao}` : ''}
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
              }}>
                {csvStatus}
              </div>
            )}

            <button
              onClick={importarCsv}
              disabled={!csvTexto.trim() || csvStatus === 'importando'}
              style={{
                width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                background: !csvTexto.trim() || csvStatus === 'importando' ? '#94a3b8' : '#0f766e',
                color: '#fff', fontSize: 15, fontWeight: 700, cursor: !csvTexto.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {csvStatus === 'importando' ? '⏳ Importando...' : '📥 Importar Pautas'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
