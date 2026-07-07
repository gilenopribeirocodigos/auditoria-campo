import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase.js'
import { temPermissao } from '../lib/auth.js'

const SITUACOES_PERMITIDAS = ['ATIVO', 'RESERVA']

const COLUNAS_ESPERADAS = [
  'regional', 'polo', 'base', 'prefixo', 'matricula', 'colaborador',
  'descr_secao', 'descr_situacao', 'placas', 'tipo_equipe', 'processo_equipe',
  'superv_campo', 'superv_operacao', 'coordenador',
]

const MOTIVOS_PADRAO = [
  { descricao: 'ATIVO', cor_fundo: '#dcfce7', cor_texto: '#166534', permite_importar_estrutura: true, ordem_exibicao: 1, ativo: true },
  { descricao: 'RESERVA', cor_fundo: '#dbeafe', cor_texto: '#1e40af', permite_importar_estrutura: true, ordem_exibicao: 2, ativo: true },
  { descricao: 'TRANSFERIDO', cor_fundo: '#f3e8ff', cor_texto: '#6b21a8', permite_importar_estrutura: false, ordem_exibicao: 10, ativo: true },
  { descricao: 'AF.PREVIDENCIA', cor_fundo: '#fef3c7', cor_texto: '#92400e', permite_importar_estrutura: false, ordem_exibicao: 11, ativo: true },
  { descricao: 'DESLIGADO', cor_fundo: '#fee2e2', cor_texto: '#991b1b', permite_importar_estrutura: false, ordem_exibicao: 12, ativo: true },
  { descricao: 'DESAPARECIDO', cor_fundo: '#bbf7d0', cor_texto: '#166534', permite_importar_estrutura: false, ordem_exibicao: 13, ativo: true },
  { descricao: 'BLOQUEADO', cor_fundo: '#ffedd5', cor_texto: '#9a3412', permite_importar_estrutura: false, ordem_exibicao: 14, ativo: true },
  { descricao: 'NAO APRESENTADO', cor_fundo: '#ffffff', cor_texto: '#334155', permite_importar_estrutura: false, ordem_exibicao: 15, ativo: true },
]

const PROCESSOS_EQUIPE_PADRAO = [
  { descricao: 'CORTE', ordem_exibicao: 1, ativo: true },
  { descricao: 'LIGACAO NOVA', ordem_exibicao: 2, ativo: true },
  { descricao: 'EMERGENCIAL', ordem_exibicao: 3, ativo: true },
  { descricao: 'PLANTAO', ordem_exibicao: 4, ativo: true },
]

const CORES_MOTIVO = [
  { nome: 'Verde', fundo: '#dcfce7', texto: '#166534' },
  { nome: 'Azul', fundo: '#dbeafe', texto: '#1e40af' },
  { nome: 'Lilas', fundo: '#f3e8ff', texto: '#6b21a8' },
  { nome: 'Amarelo', fundo: '#fef3c7', texto: '#92400e' },
  { nome: 'Vermelho', fundo: '#fee2e2', texto: '#991b1b' },
  { nome: 'Laranja', fundo: '#ffedd5', texto: '#9a3412' },
  { nome: 'Branco', fundo: '#ffffff', texto: '#334155' },
  { nome: 'Cinza', fundo: '#f1f5f9', texto: '#334155' },
]

const norm = s => (s || '').trim()
const hojeISO = () => new Date().toISOString().split('T')[0]
const formatBR = d => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Nunca'
const nomeArquivoSeguro = s => limparTexto(s || 'estrutura').replace(/[^A-Z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'estrutura'

function limparTexto(valor) {
  if (valor === null || valor === undefined) return ''
  return String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—−]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
}

function limparTextoEdicao(valor) {
  if (valor === null || valor === undefined) return ''
  return String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[â€“â€”âˆ’]/g, '-')
    .replace(/[â€œâ€]/g, '"')
    .replace(/[â€˜â€™]/g, "'")
    .replace(/[^\x20-\x7E]/g, '')
    .toUpperCase()
}

function normalizarValorCelula(coluna, valor) {
  if (coluna === 'matricula') return norm(valor).toUpperCase()
  return limparTextoEdicao(valor)
}

function gerarIdTemporario() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}_${Math.random()}`
}

function novaLinha() {
  return {
    _tmpId: gerarIdTemporario(),
    regional: '', polo: '', base: '', prefixo: '', matricula: '', colaborador: '',
    descr_secao: '', descr_situacao: 'ATIVO', placas: '', tipo_equipe: '', processo_equipe: '',
    superv_campo: '', superv_operacao: '', coordenador: '',
  }
}

function linhaVazia(linha) {
  return COLUNAS_ESPERADAS.every(c => !norm(linha?.[c]))
}

function normalizarLinha(linha) {
  const out = {}
  COLUNAS_ESPERADAS.forEach(c => {
    out[c] = c === 'matricula' ? norm(linha?.[c]).toUpperCase() : limparTexto(linha?.[c]).toUpperCase()
  })
  out.descr_situacao = limparTexto(out.descr_situacao).toUpperCase()
  return out
}

function dadosParaLinha(dados) {
  return { ...novaLinha(), ...(dados || {}) }
}

function mapaMotivos(motivos) {
  return new Map((motivos || []).map(m => [normalizarSituacao(m.descricao), m]))
}

function normalizarSituacao(valor) {
  return limparTexto(valor).toUpperCase()
}

function normalizarProcesso(valor) {
  return limparTexto(valor).toUpperCase()
}

function situacaoPermitida(s) {
  return SITUACOES_PERMITIDAS.includes(normalizarSituacao(s))
}

function infoSituacao(situacao, motivos) {
  const map = mapaMotivos(motivos)
  const chave = normalizarSituacao(situacao)
  return map.get(chave) || {
    descricao: chave || 'SEM SITUACAO',
    cor_fundo: '#f8fafc',
    cor_texto: '#334155',
    permite_importar_estrutura: false,
    ordem_exibicao: 999,
  }
}

function compararValores(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'pt-BR', { numeric: true, sensitivity: 'base' })
}

function ordenarPorSituacao(linhas, motivos, ordenacao = null) {
  return [...(linhas || [])].sort((a, b) => {
    const ia = infoSituacao(a.descr_situacao, motivos)
    const ib = infoSituacao(b.descr_situacao, motivos)
    const ca = ia.permite_importar_estrutura ? 0 : 1
    const cb = ib.permite_importar_estrutura ? 0 : 1
    if (ca !== cb) return ca - cb
    if (ordenacao?.coluna) {
      const resultado = compararValores(a[ordenacao.coluna], b[ordenacao.coluna])
      if (resultado !== 0) return ordenacao.direcao === 'desc' ? -resultado : resultado
    }
    if ((ia.ordem_exibicao || 999) !== (ib.ordem_exibicao || 999)) return (ia.ordem_exibicao || 999) - (ib.ordem_exibicao || 999)
    return String(a.colaborador || '').localeCompare(String(b.colaborador || ''))
  })
}

function resumirSituacoes(linhas, motivos) {
  const map = new Map()
  ;(linhas || []).forEach(l => {
    if (linhaVazia(l)) return
    const info = infoSituacao(l.descr_situacao, motivos)
    const desc = normalizarSituacao(info.descricao)
    map.set(desc, { info, total: (map.get(desc)?.total || 0) + 1 })
  })
  return [...map.values()].sort((a, b) => (a.info.ordem_exibicao || 999) - (b.info.ordem_exibicao || 999))
}

function montarRegistro(r, idEletricista, timestamp) {
  return {
    id_eletricista: idEletricista,
    regional: limparTexto(r.regional),
    polo: limparTexto(r.polo),
    base: limparTexto(r.base),
    prefixo: limparTexto(r.prefixo),
    matricula: norm(r.matricula),
    colaborador: limparTexto(r.colaborador),
    descr_secao: limparTexto(r.descr_secao),
    descr_situacao: limparTexto(r.descr_situacao),
    placas: limparTexto(r.placas),
    tipo_equipe: limparTexto(r.tipo_equipe),
    processo_equipe: limparTexto(r.processo_equipe),
    superv_campo: limparTexto(r.superv_campo),
    superv_operacao: limparTexto(r.superv_operacao),
    coordenador: limparTexto(r.coordenador),
    carregado_em: timestamp,
  }
}

function montarHistorico(linhaAtual, dataHoje, motivo) {
  return {
    id_eletricista: linhaAtual.id_eletricista,
    regional: linhaAtual.regional,
    polo: linhaAtual.polo,
    base: linhaAtual.base,
    prefixo: linhaAtual.prefixo,
    matricula: linhaAtual.matricula,
    colaborador: linhaAtual.colaborador,
    descr_secao: linhaAtual.descr_secao,
    descr_situacao: linhaAtual.descr_situacao,
    placas: linhaAtual.placas,
    tipo_equipe: linhaAtual.tipo_equipe,
    processo_equipe: linhaAtual.processo_equipe,
    superv_campo: linhaAtual.superv_campo,
    superv_operacao: linhaAtual.superv_operacao,
    coordenador: linhaAtual.coordenador,
    vigencia_inicio: linhaAtual.carregado_em ? linhaAtual.carregado_em.split('T')[0] : null,
    vigencia_fim: dataHoje,
    motivo_saida: motivo,
  }
}

function configMudou(atual, novo) {
  const campos = ['regional', 'polo', 'base', 'prefixo', 'placas', 'tipo_equipe', 'processo_equipe', 'superv_campo', 'superv_operacao', 'coordenador', 'descr_secao', 'descr_situacao']
  return campos.some(c => norm(atual[c]) !== norm(novo[c]))
}

async function importarEstrutura(rows) {
  const rowsLimpos = (rows || []).map(normalizarLinha)
  const ignoradas = []
  const validas = []

  for (const r of rowsLimpos) {
    if (!norm(r.matricula) || !norm(r.colaborador)) {
      ignoradas.push({ ...r, _motivo: !norm(r.matricula) ? 'sem matricula' : 'sem colaborador' })
    } else if (!situacaoPermitida(r.descr_situacao)) {
      ignoradas.push({ ...r, _motivo: `situacao "${r.descr_situacao || 'em branco'}" nao importavel` })
    } else {
      validas.push(r)
    }
  }

  if (validas.length === 0) {
    throw new Error('Nenhuma linha valida para importar. O Total precisa ter ao menos uma linha ATIVO ou RESERVA com matricula e colaborador.')
  }

  const matriculasCount = {}
  const matriculaNomes = {}
  for (const r of validas) {
    matriculasCount[r.matricula] = (matriculasCount[r.matricula] || 0) + 1
    if (!matriculaNomes[r.matricula]) matriculaNomes[r.matricula] = new Set()
    matriculaNomes[r.matricula].add(r.colaborador)
  }

  const dups = Object.entries(matriculasCount)
    .filter(([, c]) => c > 1)
    .map(([m, c]) => ({ matricula: m, quantidade: c, nomes: Array.from(matriculaNomes[m]) }))

  if (dups.length > 0) {
    throw new Error(`${dups.length} matricula(s) duplicada(s) no Total Consolidado. Corrija antes de importar.`)
  }

  const { data: atualData, error: errAtual } = await supabase.from('estrutura_equipes').select('*')
  if (errAtual) throw errAtual
  const { data: mestreData, error: errMestre } = await supabase.from('eletricistas_cadastro').select('id_eletricista, matricula, nome')
  if (errMestre) throw errMestre
  const { data: histData, error: errHist } = await supabase.from('historico_estrutura_equipes').select('matricula')
  if (errHist) throw errHist

  const atualMap = new Map((atualData || []).map(a => [a.matricula, a]))
  const mestreMap = new Map((mestreData || []).map(m => [m.matricula, m]))
  const historicoSet = new Set((histData || []).map(h => h.matricula))

  const novos = []
  const voltaram = []
  const mantidos = []
  const movimentados = []

  for (const r of validas) {
    const noAtual = atualMap.get(r.matricula)
    const noMestre = mestreMap.get(r.matricula)
    const noHist = historicoSet.has(r.matricula)
    if (noAtual) {
      if (configMudou(noAtual, r)) movimentados.push({ atual: noAtual, novo: r, idEletricista: noMestre?.id_eletricista })
      else mantidos.push({ atual: noAtual, novo: r, idEletricista: noMestre?.id_eletricista })
    } else {
      if (noMestre || noHist) voltaram.push({ novo: r, idEletricista: noMestre?.id_eletricista })
      else novos.push({ novo: r })
    }
  }

  const matriculasCsv = new Set(validas.map(r => r.matricula))
  const removidos = (atualData || []).filter(a => a.matricula && !matriculasCsv.has(a.matricula))
  const agora = new Date().toISOString()

  const upsertPayload = validas.map(r => ({
    matricula: r.matricula,
    nome: limparTexto(r.colaborador),
    atualizado_em: agora,
  }))
  for (let i = 0; i < upsertPayload.length; i += 100) {
    const { error } = await supabase.from('eletricistas_cadastro').upsert(upsertPayload.slice(i, i + 100), { onConflict: 'matricula' })
    if (error) throw error
  }

  const matriculas = validas.map(r => r.matricula)
  const idsAtuais = []
  for (let i = 0; i < matriculas.length; i += 200) {
    const { data, error } = await supabase.from('eletricistas_cadastro').select('id_eletricista, matricula').in('matricula', matriculas.slice(i, i + 200))
    if (error) throw error
    idsAtuais.push(...(data || []))
  }
  const idMap = new Map(idsAtuais.map(i => [i.matricula, i.id_eletricista]))

  const dataHoje = hojeISO()
  const linhasHistorico = []
  movimentados.forEach(m => linhasHistorico.push(montarHistorico(m.atual, dataHoje, `Alteracao de configuracao na carga online de ${dataHoje}`)))
  removidos.forEach(r => linhasHistorico.push(montarHistorico(r, dataHoje, `Removido da estrutura na carga online de ${dataHoje}`)))
  const linhasHistoricoValidas = linhasHistorico.filter(h => h.id_eletricista)
  if (linhasHistoricoValidas.length > 0) {
    for (let i = 0; i < linhasHistoricoValidas.length; i += 100) {
      const { error } = await supabase.from('historico_estrutura_equipes').insert(linhasHistoricoValidas.slice(i, i + 100))
      if (error) throw error
    }
  }

  const { error: errDelete } = await supabase.from('estrutura_equipes').delete().neq('id', 0)
  if (errDelete) throw errDelete

  const novaEstrutura = []
  novos.forEach(n => { const id = idMap.get(n.novo.matricula); if (id) novaEstrutura.push(montarRegistro(n.novo, id, agora)) })
  voltaram.forEach(v => { const id = idMap.get(v.novo.matricula); if (id) novaEstrutura.push(montarRegistro(v.novo, id, agora)) })
  mantidos.forEach(m => { const id = idMap.get(m.novo.matricula); if (id) novaEstrutura.push(montarRegistro(m.novo, id, agora)) })
  movimentados.forEach(m => { const id = idMap.get(m.novo.matricula); if (id) novaEstrutura.push(montarRegistro(m.novo, id, agora)) })

  for (let i = 0; i < novaEstrutura.length; i += 100) {
    const { error } = await supabase.from('estrutura_equipes').insert(novaEstrutura.slice(i, i + 100))
    if (error) throw error
  }

  return {
    novos: novos.length,
    voltaram: voltaram.length,
    mantidos: mantidos.length,
    movimentados: movimentados.length,
    removidos: removidos.length,
    ignoradas: ignoradas.length,
    total: novaEstrutura.length,
  }
}

const cardStyle = {
  background: '#fff',
  border: '1px solid #dbe3ef',
  borderRadius: 12,
  padding: 12,
}

const LARGURAS_PADRAO = {
  regional: 130,
  polo: 120,
  base: 140,
  prefixo: 135,
  matricula: 105,
  colaborador: 250,
  descr_secao: 150,
  descr_situacao: 170,
  placas: 120,
  tipo_equipe: 190,
  processo_equipe: 190,
  superv_campo: 160,
  superv_operacao: 170,
  coordenador: 160,
}

function larguraPadraoColuna(coluna) {
  return LARGURAS_PADRAO[coluna] || 130
}

function larguraAutomaticaColuna(coluna, linhas) {
  const textos = [coluna, ...(linhas || []).slice(0, 120).map(l => l?.[coluna] || '')]
  const maior = textos.reduce((max, valor) => Math.max(max, String(valor || '').length), 0)
  const estimada = Math.round(maior * 7.5 + 42)
  return Math.max(95, Math.min(420, estimada))
}

export default function EstruturaOnline({ usuarioLogado }) {
  const [planilhas, setPlanilhas] = useState([])
  const [linhasPorAba, setLinhasPorAba] = useState({})
  const [abaAtiva, setAbaAtiva] = useState(null)
  const [editando, setEditando] = useState(null)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [motivos, setMotivos] = useState(MOTIVOS_PADRAO)
  const [processosEquipe, setProcessosEquipe] = useState(PROCESSOS_EQUIPE_PADRAO)
  const [mostrarMotivos, setMostrarMotivos] = useState(false)
  const [abaPadroes, setAbaPadroes] = useState('situacoes')
  const [motivoForm, setMotivoForm] = useState({ descricao: '', cor_fundo: '#f1f5f9', cor_texto: '#334155', permite_importar_estrutura: false })
  const [processoForm, setProcessoForm] = useState({ descricao: '' })
  const [motivoRapido, setMotivoRapido] = useState('')
  const [processoRapido, setProcessoRapido] = useState('')
  const [tabelaAmpliada, setTabelaAmpliada] = useState(false)
  const [largurasColunas, setLargurasColunas] = useState({})
  const [ordenacao, setOrdenacao] = useState({ coluna: '', direcao: 'asc' })
  const [confirmacao, setConfirmacao] = useState('')
  const [relatorioImportacao, setRelatorioImportacao] = useState(null)

  const isAdmin = usuarioLogado?.perfil === 'ADMIN'
  const podeVisualizar = isAdmin || temPermissao(usuarioLogado, 'estrutura_online_visualizar') || temPermissao(usuarioLogado, 'importar_equipes')
  const podeEditar = isAdmin || temPermissao(usuarioLogado, 'estrutura_online_editar')
  const podeImportar = isAdmin || temPermissao(usuarioLogado, 'estrutura_online_importar') || temPermissao(usuarioLogado, 'importar_equipes')
  const podeConfigurarMotivos = isAdmin || temPermissao(usuarioLogado, 'estrutura_online_motivos')

  const linhasAtuais = linhasPorAba[abaAtiva] || []
  const abaAtual = planilhas.find(p => p.id === abaAtiva)
  const estaEditando = editando === abaAtiva

  const linhasTotal = useMemo(() => {
    return planilhas.flatMap(p => (linhasPorAba[p.id] || [])
      .filter(l => !linhaVazia(l))
      .map(l => ({ ...l, origem_aba: p.nome })))
  }, [planilhas, linhasPorAba])

  const linhasTotalImportaveis = useMemo(() => {
    return linhasTotal.filter(l => situacaoPermitida(l.descr_situacao) && norm(l.matricula) && norm(l.colaborador))
  }, [linhasTotal])

  const matriculasDuplicadas = useMemo(() => {
    const contagem = {}
    linhasTotalImportaveis.forEach(l => { contagem[l.matricula] = (contagem[l.matricula] || 0) + 1 })
    return Object.entries(contagem).filter(([, qtd]) => qtd > 1).map(([matricula]) => matricula)
  }, [linhasTotalImportaveis])

  const carregar = async () => {
    setLoading(true)
    setErro('')
    try {
      const { data: motivosData, error: motivosError } = await supabase
        .from('motivos_situacao_estrutura')
        .select('*')
        .eq('ativo', true)
        .order('ordem_exibicao')
      if (!motivosError && motivosData?.length) setMotivos(motivosData)

      const { data: processosData, error: processosError } = await supabase
        .from('processos_equipe_estrutura')
        .select('*')
        .eq('ativo', true)
        .order('ordem_exibicao')
      if (!processosError && processosData?.length) setProcessosEquipe(processosData)

      const { data: abas, error: abasError } = await supabase
        .from('estrutura_planilhas')
        .select('*')
        .eq('ativo', true)
        .order('ordem')
      if (abasError) throw abasError

      const listaAbas = abas || []
      setPlanilhas(listaAbas)
      if (!abaAtiva && listaAbas[0]) setAbaAtiva(listaAbas[0].id)

      if (listaAbas.length > 0) {
        const ids = listaAbas.map(a => a.id)
        const { data: linhas, error: linhasError } = await supabase
          .from('estrutura_planilha_linhas')
          .select('*')
          .in('planilha_id', ids)
          .order('ordem')
        if (linhasError) throw linhasError
        const mapa = {}
        listaAbas.forEach(a => { mapa[a.id] = [] })
        ;(linhas || []).forEach(l => {
          if (!mapa[l.planilha_id]) mapa[l.planilha_id] = []
          mapa[l.planilha_id].push(dadosParaLinha(l.dados))
        })
        Object.keys(mapa).forEach(k => {
          if (mapa[k].length === 0) mapa[k] = [novaLinha(), novaLinha(), novaLinha()]
        })
        setLinhasPorAba(mapa)
      } else {
        setLinhasPorAba({})
      }
    } catch (e) {
      setErro('Erro ao carregar Estrutura Online: ' + (e.message || String(e)))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, [])

  const criarAbasIniciais = async () => {
    if (!podeEditar) return
    setSalvando(true)
    try {
      const payload = [
        { nome: 'Plantao', ordem: 1, criado_por: usuarioLogado?.login, atualizado_por: usuarioLogado?.login },
        { nome: 'Comercial', ordem: 2, criado_por: usuarioLogado?.login, atualizado_por: usuarioLogado?.login },
      ]
      const { error } = await supabase.from('estrutura_planilhas').insert(payload)
      if (error) throw error
      await carregar()
      setMsg('Abas iniciais criadas.')
    } catch (e) {
      setErro(e.message || String(e))
    } finally {
      setSalvando(false)
    }
  }

  const criarAba = async () => {
    if (!podeEditar) return
    if (planilhas.length >= 8) { setErro('Limite inicial de 8 abas atingido.'); return }
    const nome = window.prompt('Nome da nova aba:', `Tabela ${planilhas.length + 1}`)
    if (!nome) return
    setSalvando(true)
    try {
      const { data, error } = await supabase.from('estrutura_planilhas')
        .insert({
          nome: limparTexto(nome),
          ordem: planilhas.length + 1,
          criado_por: usuarioLogado?.login,
          atualizado_por: usuarioLogado?.login,
        })
        .select()
        .single()
      if (error) throw error
      setPlanilhas(prev => [...prev, data])
      setLinhasPorAba(prev => ({ ...prev, [data.id]: [novaLinha(), novaLinha(), novaLinha()] }))
      setAbaAtiva(data.id)
      setEditando(data.id)
    } catch (e) {
      setErro(e.message || String(e))
    } finally {
      setSalvando(false)
    }
  }

  const renomearAba = async () => {
    if (!podeEditar || !abaAtual) return
    const nome = window.prompt('Novo nome da aba:', abaAtual.nome)
    if (!nome) return
    try {
      const atualizado = { nome: limparTexto(nome), atualizado_por: usuarioLogado?.login, atualizado_em: new Date().toISOString() }
      const { error } = await supabase.from('estrutura_planilhas').update(atualizado).eq('id', abaAtual.id)
      if (error) throw error
      setPlanilhas(prev => prev.map(p => p.id === abaAtual.id ? { ...p, ...atualizado } : p))
      setMsg('Nome da aba atualizado.')
    } catch (e) { setErro(e.message || String(e)) }
  }

  const atualizarCelula = (linhaId, coluna, valor) => {
    setLinhasPorAba(prev => ({
      ...prev,
      [abaAtiva]: (prev[abaAtiva] || []).map(l => l._tmpId === linhaId ? { ...l, [coluna]: normalizarValorCelula(coluna, valor) } : l),
    }))
  }

  const colarExcel = (linhaId, colunaInicial, evento) => {
    if (!estaEditando) return
    const texto = evento.clipboardData?.getData('text/plain') || ''
    if (!texto.includes('\t') && !texto.includes('\n')) return
    evento.preventDefault()

    const linhasTexto = texto.replace(/\r/g, '').split('\n').filter(l => l.length > 0)
    const colInicio = COLUNAS_ESPERADAS.indexOf(colunaInicial)
    const linhasBase = [...linhasAtuais]
    let rowIndex = linhasBase.findIndex(l => l._tmpId === linhaId)
    if (rowIndex < 0) rowIndex = 0

    linhasTexto.forEach((txt, offsetLinha) => {
      const valores = txt.split('\t')
      const destino = rowIndex + offsetLinha
      while (linhasBase.length <= destino) linhasBase.push(novaLinha())
      valores.forEach((valor, offsetCol) => {
        const col = COLUNAS_ESPERADAS[colInicio + offsetCol]
        if (col) linhasBase[destino][col] = normalizarValorCelula(col, valor)
      })
    })

    setLinhasPorAba(prev => ({ ...prev, [abaAtiva]: linhasBase }))
    setMsg('Dados colados. Confira e clique em Salvar.')
  }

  const adicionarLinha = () => {
    setLinhasPorAba(prev => ({ ...prev, [abaAtiva]: [...(prev[abaAtiva] || []), novaLinha()] }))
  }

  const removerLinha = (linhaId) => {
    setLinhasPorAba(prev => ({
      ...prev,
      [abaAtiva]: (prev[abaAtiva] || []).filter(l => l._tmpId !== linhaId),
    }))
  }

  const limparTabelaAtual = () => {
    if (!podeEditar || !abaAtiva || abaAtiva === 'TOTAL') return
    const ok = window.confirm(
      'Limpar todas as linhas desta aba?\n\n' +
      'A alteracao so sera gravada no banco depois que voce clicar em Salvar.'
    )
    if (!ok) return
    setLinhasPorAba(prev => ({ ...prev, [abaAtiva]: [novaLinha(), novaLinha(), novaLinha()] }))
    setEditando(abaAtiva)
    setMsg('Tabela limpa. Clique em Salvar para gravar a limpeza desta aba.')
  }

  const salvarAba = async () => {
    if (!podeEditar || !abaAtiva) return
    setSalvando(true)
    setErro('')
    try {
      const normalizadas = linhasAtuais.map(normalizarLinha).filter(l => !linhaVazia(l))
      await supabase.from('estrutura_planilha_linhas').delete().eq('planilha_id', abaAtiva)
      if (normalizadas.length > 0) {
        const payload = normalizadas.map((l, i) => ({
          planilha_id: abaAtiva,
          ordem: i + 1,
          dados: l,
          criado_por: usuarioLogado?.login,
          atualizado_por: usuarioLogado?.login,
        }))
        const { error } = await supabase.from('estrutura_planilha_linhas').insert(payload)
        if (error) throw error
      }
      const agora = new Date().toISOString()
      const { error: errAba } = await supabase.from('estrutura_planilhas')
        .update({ status: 'SALVO', atualizado_por: usuarioLogado?.login, atualizado_em: agora })
        .eq('id', abaAtiva)
      if (errAba) throw errAba
      setPlanilhas(prev => prev.map(p => p.id === abaAtiva ? { ...p, atualizado_por: usuarioLogado?.login, atualizado_em: agora } : p))
      setLinhasPorAba(prev => ({ ...prev, [abaAtiva]: normalizadas.length ? normalizadas.map(dadosParaLinha) : [novaLinha(), novaLinha(), novaLinha()] }))
      setEditando(null)
      setMsg('Aba salva com sucesso.')
    } catch (e) {
      setErro(e.message || String(e))
    } finally {
      setSalvando(false)
    }
  }

  const salvarMotivo = async () => {
    if (!podeConfigurarMotivos) return
    const descricao = normalizarSituacao(motivoForm.descricao)
    if (!descricao) { setErro('Informe a descricao do motivo.'); return }
    try {
      const { error } = await supabase.from('motivos_situacao_estrutura').upsert({
        descricao,
        cor_fundo: motivoForm.cor_fundo,
        cor_texto: motivoForm.cor_texto,
        permite_importar_estrutura: motivoForm.permite_importar_estrutura,
        ativo: true,
        ordem_exibicao: motivoForm.permite_importar_estrutura ? 3 : 50,
        criado_por: usuarioLogado?.login,
        atualizado_por: usuarioLogado?.login,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'descricao' })
      if (error) throw error
      setMotivoForm({ descricao: '', cor_fundo: '#f1f5f9', cor_texto: '#334155', permite_importar_estrutura: false })
      await carregar()
      setMsg('Motivo salvo.')
    } catch (e) {
      setErro(e.message || String(e))
    }
  }

  const excluirMotivo = async (motivo) => {
    if (!podeConfigurarMotivos) return
    const descricao = normalizarSituacao(motivo?.descricao)
    if (!descricao) return
    if (motivo?.permite_importar_estrutura) {
      setErro('Motivos que permitem importar para a estrutura nao podem ser excluidos por seguranca.')
      return
    }
    if (!window.confirm(`Excluir o motivo ${descricao}? Ele sera removido da lista de escolha, mas registros ja preenchidos permanecem com o texto salvo.`)) return
    try {
      const { error } = await supabase.from('motivos_situacao_estrutura')
        .update({
          ativo: false,
          atualizado_por: usuarioLogado?.login,
          atualizado_em: new Date().toISOString(),
        })
        .eq('descricao', descricao)
      if (error) throw error
      setMotivos(prev => prev.filter(m => normalizarSituacao(m.descricao) !== descricao))
      if (motivoRapido === descricao) setMotivoRapido('')
      setMsg(`Motivo ${descricao} excluido da lista.`)
    } catch (e) {
      setErro(e.message || String(e))
    }
  }

  const salvarProcessoEquipe = async () => {
    if (!podeConfigurarMotivos) return
    const descricao = normalizarProcesso(processoForm.descricao)
    if (!descricao) { setErro('Informe a descricao do processo.'); return }
    try {
      const { error } = await supabase.from('processos_equipe_estrutura').upsert({
        descricao,
        ativo: true,
        ordem_exibicao: (processosEquipe?.length || 0) + 1,
        criado_por: usuarioLogado?.login,
        atualizado_por: usuarioLogado?.login,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'descricao' })
      if (error) throw error
      setProcessoForm({ descricao: '' })
      await carregar()
      setMsg('Processo salvo.')
    } catch (e) {
      setErro(e.message || String(e))
    }
  }

  const excluirProcessoEquipe = async (processo) => {
    if (!podeConfigurarMotivos) return
    const descricao = normalizarProcesso(processo?.descricao)
    if (!descricao) return
    if (!window.confirm(`Excluir o processo ${descricao}? Ele sera removido da lista de escolha, mas registros ja preenchidos permanecem com o texto salvo.`)) return
    try {
      const { error } = await supabase.from('processos_equipe_estrutura')
        .update({
          ativo: false,
          atualizado_por: usuarioLogado?.login,
          atualizado_em: new Date().toISOString(),
        })
        .eq('descricao', descricao)
      if (error) throw error
      setProcessosEquipe(prev => prev.filter(p => normalizarProcesso(p.descricao) !== descricao))
      if (processoRapido === descricao) setProcessoRapido('')
      setMsg(`Processo ${descricao} excluido da lista.`)
    } catch (e) {
      setErro(e.message || String(e))
    }
  }

  const importarTotal = async () => {
    if (!podeImportar) return
    if (confirmacao !== 'CONFIRMAR CARGA') {
      setErro('Digite CONFIRMAR CARGA antes de importar o Total para o banco.')
      return
    }
    if (matriculasDuplicadas.length > 0) {
      setErro(`Existem matriculas duplicadas no Total: ${matriculasDuplicadas.join(', ')}`)
      return
    }
    setSalvando(true)
    setErro('')
    setRelatorioImportacao(null)
    try {
      const resumo = await importarEstrutura(linhasTotal)
      await supabase.from('estrutura_planilha_importacoes').insert({
        usuario_login: usuarioLogado?.login,
        usuario_nome: usuarioLogado?.nome,
        total_linhas: linhasTotal.length,
        linhas_importadas: resumo.total,
        resumo,
        status: 'CONCLUIDA',
      })
      setRelatorioImportacao(resumo)
      setConfirmacao('')
      setMsg(`Importacao online concluida: ${resumo.total} linha(s) na estrutura atual.`)
    } catch (e) {
      setErro(e.message || String(e))
    } finally {
      setSalvando(false)
    }
  }

  if (!podeVisualizar) {
    return <div style={cardStyle}>Seu perfil nao tem permissao para visualizar a Estrutura Online.</div>
  }

  if (loading) {
    return <div style={cardStyle}>Carregando Estrutura Online...</div>
  }

  const linhasRender = abaAtiva === 'TOTAL'
    ? ordenarPorSituacao(linhasTotal, motivos, ordenacao)
    : ordenarPorSituacao(linhasAtuais, motivos, ordenacao)

  const alternarOrdenacao = (coluna) => {
    setOrdenacao(prev => ({
      coluna,
      direcao: prev.coluna === coluna && prev.direcao === 'asc' ? 'desc' : 'asc',
    }))
  }

  const redimensionarColuna = (coluna, largura) => {
    setLargurasColunas(prev => ({ ...prev, [coluna]: Math.max(80, Math.min(520, Math.round(largura))) }))
  }

  const autoAjustarColunas = () => {
    const proximas = {}
    COLUNAS_ESPERADAS.forEach(coluna => {
      proximas[coluna] = larguraAutomaticaColuna(coluna, linhasRender)
    })
    setLargurasColunas(prev => ({ ...prev, ...proximas }))
    setMsg('Largura das colunas ajustada ao conteudo visivel.')
  }

  const exportarExcel = () => {
    const linhas = linhasRender.filter(l => !linhaVazia(l))
    if (linhas.length === 0) {
      setErro('Nao ha linhas para exportar nesta aba.')
      return
    }

    const incluirAba = abaAtiva === 'TOTAL'
    const colunas = incluirAba ? ['aba', ...COLUNAS_ESPERADAS] : COLUNAS_ESPERADAS
    const dados = linhas.map(linha => {
      const item = {}
      if (incluirAba) item.aba = linha.origem_aba || ''
      COLUNAS_ESPERADAS.forEach(coluna => {
        item[coluna] = linha[coluna] || ''
      })
      return item
    })

    const ws = XLSX.utils.json_to_sheet(dados, { header: colunas })
    ws['!cols'] = colunas.map(coluna => ({
      wch: Math.max(12, Math.min(45, Math.round((largurasColunas[coluna] || larguraPadraoColuna(coluna)) / 7))),
    }))
    const wb = XLSX.utils.book_new()
    const nomeAba = (abaAtiva === 'TOTAL' ? 'Total Consolidado' : abaAtual?.nome || 'Estrutura').slice(0, 31)
    XLSX.utils.book_append_sheet(wb, ws, nomeAba)
    XLSX.writeFile(wb, `${nomeArquivoSeguro(nomeAba)}_${hojeISO()}.xlsx`)
    setMsg(`Excel da aba ${nomeAba} gerado com sucesso.`)
  }

  return (
    <div>
      {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13, fontWeight: 700 }}>{erro}</div>}
      {msg && <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13, fontWeight: 700 }}>{msg}</div>}

      <div style={{ ...cardStyle, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', margin: 0 }}>Estrutura Online</h2>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Cole dados do Excel, salve por aba e importe o Total consolidado com seguranca.</p>
          </div>
          {podeEditar && planilhas.length === 0 && <button onClick={criarAbasIniciais} disabled={salvando} style={botao('#0f766e')}>Criar Plantao e Comercial</button>}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {planilhas.map(p => (
            <button key={p.id} onClick={() => setAbaAtiva(p.id)} style={abaBtn(abaAtiva === p.id)}>
              {p.nome}
              <span style={{ display: 'block', fontSize: 10, opacity: 0.7 }}>Atualizado: {formatBR(p.atualizado_em)}</span>
            </button>
          ))}
          {podeEditar && planilhas.length < 8 && <button onClick={criarAba} style={abaBtn(false)}>+ Nova aba</button>}
          <button onClick={() => setAbaAtiva('TOTAL')} style={abaBtn(abaAtiva === 'TOTAL')}>Total Consolidado<span style={{ display: 'block', fontSize: 10, opacity: 0.7 }}>{linhasTotal.length} linha(s)</span></button>
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', margin: 0 }}>
              {abaAtiva === 'TOTAL' ? 'Total Consolidado' : (abaAtual?.nome || 'Selecione uma aba')}
            </p>
            <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
              {abaAtiva === 'TOTAL'
                ? 'Somente leitura. Apenas ATIVO e RESERVA entram no banco.'
                : estaEditando ? 'Modo edicao liberado. Cole do Excel e salve para travar a aba.' : 'Modo leitura. Clique em Editar para alterar.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {abaAtiva !== 'TOTAL' && podeEditar && !estaEditando && abaAtual && <button onClick={() => setEditando(abaAtiva)} style={botao('#1e40af')}>Editar</button>}
            {abaAtiva !== 'TOTAL' && podeEditar && estaEditando && <button onClick={salvarAba} disabled={salvando} style={botao('#0f766e')}>Salvar</button>}
            {abaAtiva !== 'TOTAL' && podeEditar && estaEditando && <button onClick={adicionarLinha} style={botao('#475569')}>Adicionar linha</button>}
            {abaAtiva !== 'TOTAL' && podeEditar && estaEditando && <button onClick={limparTabelaAtual} style={botao('#b91c1c')}>Limpar tabela</button>}
            {planilhas.length > 0 && <button onClick={autoAjustarColunas} style={botao('#0369a1')}>Ajustar colunas</button>}
            {planilhas.length > 0 && <button onClick={exportarExcel} style={botao('#16a34a')}>Exportar Excel</button>}
            {planilhas.length > 0 && <button onClick={() => setTabelaAmpliada(true)} style={botao('#0f172a')}>Tela cheia</button>}
            {abaAtiva !== 'TOTAL' && podeEditar && abaAtual && <button onClick={renomearAba} style={botao('#64748b')}>Renomear</button>}
            {podeConfigurarMotivos && <button onClick={() => setMostrarMotivos(m => !m)} style={botao(mostrarMotivos ? '#334155' : '#7c3aed')}>{mostrarMotivos ? 'Fechar padroes' : 'Padroes'}</button>}
          </div>
        </div>

        <ResumoSituacoes linhas={abaAtiva === 'TOTAL' ? linhasTotal : linhasAtuais} motivos={motivos} />

        {planilhas.length === 0 ? (
          <div style={{ background: '#f8fafc', borderRadius: 12, padding: 24, textAlign: 'center', color: '#64748b', fontWeight: 800 }}>
            Nenhuma aba criada ainda.
          </div>
        ) : (
          <TabelaEstrutura
            linhas={linhasRender}
            motivos={motivos}
            processosEquipe={processosEquipe}
            motivoRapido={motivoRapido}
            processoRapido={processoRapido}
            editando={estaEditando && abaAtiva !== 'TOTAL'}
            onChange={atualizarCelula}
            onPaste={colarExcel}
            onRemove={removerLinha}
            total={abaAtiva === 'TOTAL'}
            largurasColunas={largurasColunas}
            onResizeColuna={redimensionarColuna}
            ordenacao={ordenacao}
            onOrdenar={alternarOrdenacao}
          />
        )}
      </div>

      {tabelaAmpliada && planilhas.length > 0 && (
        <div style={overlayStyle}>
          <div style={fullPanelStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', margin: 0 }}>
                  {abaAtiva === 'TOTAL' ? 'Total Consolidado' : (abaAtual?.nome || 'Estrutura Online')}
                </h3>
                <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  Visualizacao ampliada em formato de planilha. {estaEditando && abaAtiva !== 'TOTAL' ? 'Modo edicao ativo.' : 'Modo leitura.'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {abaAtiva !== 'TOTAL' && podeEditar && !estaEditando && abaAtual && <button onClick={() => setEditando(abaAtiva)} style={botao('#1e40af')}>Editar</button>}
                {abaAtiva !== 'TOTAL' && podeEditar && estaEditando && <button onClick={salvarAba} disabled={salvando} style={botao('#0f766e')}>Salvar</button>}
                {abaAtiva !== 'TOTAL' && podeEditar && estaEditando && <button onClick={adicionarLinha} style={botao('#475569')}>Adicionar linha</button>}
                {abaAtiva !== 'TOTAL' && podeEditar && estaEditando && <button onClick={limparTabelaAtual} style={botao('#b91c1c')}>Limpar tabela</button>}
                <button onClick={autoAjustarColunas} style={botao('#0369a1')}>Ajustar colunas</button>
                <button onClick={exportarExcel} style={botao('#16a34a')}>Exportar Excel</button>
                <button onClick={() => setTabelaAmpliada(false)} style={botao('#334155')}>Fechar</button>
              </div>
            </div>
            <ResumoSituacoes linhas={abaAtiva === 'TOTAL' ? linhasTotal : linhasAtuais} motivos={motivos} />
            <TabelaEstrutura
              linhas={linhasRender}
              motivos={motivos}
              processosEquipe={processosEquipe}
              motivoRapido={motivoRapido}
              processoRapido={processoRapido}
              editando={estaEditando && abaAtiva !== 'TOTAL'}
              onChange={atualizarCelula}
              onPaste={colarExcel}
              onRemove={removerLinha}
              total={abaAtiva === 'TOTAL'}
              altura="calc(100vh - 170px)"
              largurasColunas={largurasColunas}
              onResizeColuna={redimensionarColuna}
              ordenacao={ordenacao}
              onOrdenar={alternarOrdenacao}
            />
          </div>
        </div>
      )}

      {mostrarMotivos && podeConfigurarMotivos && (
        <div style={{ ...cardStyle, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 900, margin: 0 }}>Padroes da Estrutura Online</h3>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#64748b', fontWeight: 700 }}>Cadastre listas oficiais para as colunas DESCR_SITUACAO e PROCESSO_EQUIPE.</p>
            </div>
            <button onClick={() => setMostrarMotivos(false)} style={botao('#334155')}>Fechar</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <button onClick={() => setAbaPadroes('situacoes')} style={botao(abaPadroes === 'situacoes' ? '#1e40af' : '#e2e8f0', abaPadroes === 'situacoes' ? '#fff' : '#0f172a')}>DESCR_SITUACAO</button>
            <button onClick={() => setAbaPadroes('processos')} style={botao(abaPadroes === 'processos' ? '#1e40af' : '#e2e8f0', abaPadroes === 'processos' ? '#fff' : '#0f172a')}>PROCESSO_EQUIPE</button>
          </div>

          {abaPadroes === 'situacoes' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr auto auto', gap: 8, alignItems: 'end', marginBottom: 12 }}>
                <Campo label="Descricao"><input style={inputStyle} value={motivoForm.descricao} onChange={e => setMotivoForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: AFASTADO" /></Campo>
                <Campo label="Cor"><select style={inputStyle} value={`${motivoForm.cor_fundo}|${motivoForm.cor_texto}`} onChange={e => { const [fundo, texto] = e.target.value.split('|'); setMotivoForm(f => ({ ...f, cor_fundo: fundo, cor_texto: texto })) }}>{CORES_MOTIVO.map(c => <option key={c.nome} value={`${c.fundo}|${c.texto}`}>{c.nome}</option>)}</select></Campo>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: '#334155' }}>
                  <input type="checkbox" checked={motivoForm.permite_importar_estrutura} onChange={e => setMotivoForm(f => ({ ...f, permite_importar_estrutura: e.target.checked }))} />
                  Permite importar
                </label>
                <button onClick={salvarMotivo} style={botao('#7c3aed')}>Salvar situacao</button>
              </div>
              <ResumoSituacoes linhas={motivos.map(m => ({ descr_situacao: m.descricao, matricula: '1', colaborador: 'x' }))} motivos={motivos} />
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640, background: '#fff' }}>
                  <thead>
                    <tr>
                      <Th>usar</Th>
                      <Th>situacao</Th>
                      <Th>importa</Th>
                      <Th>cor</Th>
                      <Th>excluir</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {motivos.map(m => (
                      <tr key={m.descricao}>
                        <Td>
                          <button
                            onClick={() => {
                              setMotivoRapido(normalizarSituacao(m.descricao))
                              setMsg(`Situacao ${normalizarSituacao(m.descricao)} selecionada para ajuste manual na coluna DESCR_SITUACAO.`)
                            }}
                            style={botao(motivoRapido === normalizarSituacao(m.descricao) ? '#0f766e' : '#64748b')}
                          >
                            {motivoRapido === normalizarSituacao(m.descricao) ? 'Selecionada' : 'Selecionar'}
                          </button>
                        </Td>
                        <Td>
                          <span style={{ borderRadius: 999, padding: '5px 10px', fontSize: 11, fontWeight: 900, background: m.cor_fundo, color: m.cor_texto, border: `1px solid ${m.cor_texto}22` }}>
                            {normalizarSituacao(m.descricao)}
                          </span>
                        </Td>
                        <Td>{m.permite_importar_estrutura ? 'Sim' : 'Nao'}</Td>
                        <Td><span style={{ display: 'inline-block', width: 48, height: 18, borderRadius: 999, background: m.cor_fundo, border: `1px solid ${m.cor_texto}44` }} /></Td>
                        <Td>
                          <button
                            onClick={() => excluirMotivo(m)}
                            disabled={m.permite_importar_estrutura}
                            title={m.permite_importar_estrutura ? 'Situacao protegida porque entra na importacao da estrutura' : 'Excluir situacao da lista'}
                            style={{
                              ...botao(m.permite_importar_estrutura ? '#cbd5e1' : '#dc2626'),
                              color: m.permite_importar_estrutura ? '#64748b' : '#fff',
                              cursor: m.permite_importar_estrutura ? 'not-allowed' : 'pointer',
                            }}
                          >
                            Excluir
                          </button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {abaPadroes === 'processos' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end', marginBottom: 12 }}>
                <Campo label="Processo equipe"><input style={inputStyle} value={processoForm.descricao} onChange={e => setProcessoForm({ descricao: e.target.value })} placeholder="Ex: CORTE" /></Campo>
                <button onClick={salvarProcessoEquipe} style={botao('#7c3aed')}>Salvar processo</button>
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520, background: '#fff' }}>
                  <thead>
                    <tr>
                      <Th>usar</Th>
                      <Th>processo</Th>
                      <Th>ordem</Th>
                      <Th>excluir</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {processosEquipe.map(p => (
                      <tr key={p.descricao}>
                        <Td>
                          <button
                            onClick={() => {
                              setProcessoRapido(normalizarProcesso(p.descricao))
                              setMsg(`Processo ${normalizarProcesso(p.descricao)} selecionado para ajuste manual na coluna PROCESSO_EQUIPE.`)
                            }}
                            style={botao(processoRapido === normalizarProcesso(p.descricao) ? '#0f766e' : '#64748b')}
                          >
                            {processoRapido === normalizarProcesso(p.descricao) ? 'Selecionado' : 'Selecionar'}
                          </button>
                        </Td>
                        <Td><span style={{ borderRadius: 999, padding: '5px 10px', fontSize: 11, fontWeight: 900, background: '#e0f2fe', color: '#075985', border: '1px solid #07598522' }}>{normalizarProcesso(p.descricao)}</span></Td>
                        <Td>{p.ordem_exibicao || '-'}</Td>
                        <Td><button onClick={() => excluirProcessoEquipe(p)} style={botao('#dc2626')}>Excluir</button></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ ...cardStyle, borderColor: '#93c5fd', background: '#eff6ff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 900, color: '#1e3a8a', margin: 0 }}>Importar Total para estrutura_equipes</p>
            <p style={{ fontSize: 12, color: '#1e40af', marginTop: 4 }}>
              Total: {linhasTotal.length} linha(s). Importaveis: {linhasTotalImportaveis.length}. Fora da carga: {linhasTotal.length - linhasTotalImportaveis.length}.
            </p>
            {matriculasDuplicadas.length > 0 && <p style={{ fontSize: 12, color: '#991b1b', marginTop: 4, fontWeight: 800 }}>Duplicadas: {matriculasDuplicadas.join(', ')}</p>}
          </div>
          <div style={{ minWidth: 260 }}>
            <input value={confirmacao} onChange={e => setConfirmacao(e.target.value)} placeholder="Digite CONFIRMAR CARGA" style={{ ...inputStyle, marginBottom: 8 }} />
            <button onClick={importarTotal} disabled={!podeImportar || salvando || confirmacao !== 'CONFIRMAR CARGA'} style={{ ...botao('#0f766e'), width: '100%', opacity: (!podeImportar || salvando || confirmacao !== 'CONFIRMAR CARGA') ? 0.55 : 1 }}>
              Importar Total para o banco
            </button>
          </div>
        </div>
        {relatorioImportacao && (
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
            {Object.entries(relatorioImportacao).map(([k, v]) => (
              <div key={k} style={{ background: '#fff', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                <p style={{ fontSize: 18, fontWeight: 900, color: '#0f766e', margin: 0 }}>{v}</p>
                <p style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 800 }}>{k}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ResumoSituacoes({ linhas, motivos }) {
  const resumo = resumirSituacoes(linhas, motivos)
  if (resumo.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
      {resumo.map(({ info, total }) => (
        <span key={info.descricao} style={{
          borderRadius: 999,
          padding: '5px 10px',
          fontSize: 11,
          fontWeight: 900,
          background: info.cor_fundo,
          color: info.cor_texto,
          border: `1px solid ${info.cor_texto}22`,
        }}>
          {info.descricao}: {total}
        </span>
      ))}
    </div>
  )
}

function TabelaEstrutura({ linhas, motivos, processosEquipe, motivoRapido, processoRapido, editando, onChange, onPaste, onRemove, total, altura = 520, largurasColunas = {}, onResizeColuna, ordenacao, onOrdenar }) {
  const opcoesMotivos = (motivos || []).map(m => normalizarSituacao(m.descricao)).filter(Boolean)
  const opcoesProcessos = (processosEquipe || []).map(p => normalizarProcesso(p.descricao)).filter(Boolean)
  const largura = coluna => largurasColunas[coluna] || larguraPadraoColuna(coluna)
  return (
    <div style={{ overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 12, maxHeight: altura }}>
      <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', background: '#fff' }}>
        <colgroup>
          {total && <col style={{ width: 140 }} />}
          {COLUNAS_ESPERADAS.map(c => <col key={c} style={{ width: largura(c) }} />)}
          {editando && <col style={{ width: 110 }} />}
        </colgroup>
        <thead>
          <tr>
            {total && <Th width={140}>aba</Th>}
            {COLUNAS_ESPERADAS.map(c => (
              <Th
                key={c}
                width={largura(c)}
                onResize={onResizeColuna ? w => onResizeColuna(c, w) : undefined}
                onSort={onOrdenar ? () => onOrdenar(c) : undefined}
                sortDirection={ordenacao?.coluna === c ? ordenacao.direcao : ''}
              >
                {c}
              </Th>
            ))}
            {editando && <Th width={110}>acao</Th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => {
            const info = infoSituacao(linha.descr_situacao, motivos)
            return (
              <tr key={linha._tmpId || `${linha.origem_aba}_${linha.matricula}_${linha.prefixo}`} style={{ background: situacaoPermitida(linha.descr_situacao) ? '#fff' : '#fafafa' }}>
                {total && <Td><span style={{ fontWeight: 800, color: '#0f766e' }}>{linha.origem_aba}</span></Td>}
                {COLUNAS_ESPERADAS.map(c => {
                  const ehSituacao = c === 'descr_situacao'
                  const ehProcesso = c === 'processo_equipe'
                  const opcoesSelect = ehSituacao ? opcoesMotivos : opcoesProcessos
                  const valorSelect = ehSituacao ? normalizarSituacao(linha[c]) : normalizarProcesso(linha[c])
                  const valorRapido = ehSituacao ? motivoRapido : processoRapido
                  const bg = ehSituacao ? info.cor_fundo : undefined
                  const color = ehSituacao ? info.cor_texto : '#0f172a'
                  return (
                    <Td key={c} style={{ background: bg }}>
                      {editando ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {ehSituacao || ehProcesso ? (
                            <select
                              value={valorSelect}
                              onChange={e => onChange(linha._tmpId, c, e.target.value)}
                              onPaste={e => onPaste(linha._tmpId, c, e)}
                              style={{
                                width: '100%',
                                border: 'none',
                                outline: 'none',
                                background: 'transparent',
                                color,
                                fontWeight: 900,
                                fontSize: 12,
                                cursor: 'pointer',
                              }}
                            >
                              <option value="">Selecione...</option>
                              {valorSelect && !opcoesSelect.includes(valorSelect) && (
                                <option value={valorSelect}>{valorSelect}</option>
                              )}
                              {opcoesSelect.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          ) : (
                            <input
                              value={linha[c] || ''}
                              onChange={e => onChange(linha._tmpId, c, e.target.value)}
                              onPaste={e => onPaste(linha._tmpId, c, e)}
                              style={{
                                width: '100%',
                                border: 'none',
                                outline: 'none',
                                background: 'transparent',
                                color,
                                fontWeight: 600,
                                fontSize: 12,
                              }}
                            />
                          )}
                          {(ehSituacao || ehProcesso) && valorRapido && (
                            <button
                              type="button"
                              title={`Aplicar ${valorRapido} nesta linha`}
                              onClick={() => onChange(linha._tmpId, c, valorRapido)}
                              style={{
                                border: '1px solid #99f6e4',
                                background: '#ecfdf5',
                                color: '#0f766e',
                                borderRadius: 6,
                                padding: '3px 6px',
                                fontSize: 10,
                                fontWeight: 900,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Usar
                            </button>
                          )}
                        </div>
                      ) : (
                        <span style={{ color, fontWeight: ehSituacao ? 900 : 600 }}>{linha[c] || ''}</span>
                      )}
                    </Td>
                  )
                })}
                {editando && <Td><button onClick={() => onRemove(linha._tmpId)} style={botao('#dc2626')}>Remover</button></Td>}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children, width, onResize, onSort, sortDirection }) {
  const iniciarResize = (evento) => {
    if (!onResize) return
    evento.preventDefault()
    evento.stopPropagation()
    const inicioX = evento.clientX
    const inicioLargura = width || 120
    const mover = e => onResize(inicioLargura + e.clientX - inicioX)
    const soltar = () => {
      window.removeEventListener('mousemove', mover)
      window.removeEventListener('mouseup', soltar)
    }
    window.addEventListener('mousemove', mover)
    window.addEventListener('mouseup', soltar)
  }

  return (
    <th style={{
      position: 'sticky',
      top: 0,
      background: '#f8fafc',
      color: '#334155',
      fontSize: 11,
      textAlign: 'left',
      padding: onSort ? '8px 48px 8px 10px' : '8px 10px',
      borderBottom: '1px solid #e2e8f0',
      borderRight: '1px solid #e2e8f0',
      whiteSpace: 'nowrap',
      textTransform: 'uppercase',
      width,
      minWidth: width,
      maxWidth: width,
      cursor: onSort ? 'pointer' : 'default',
      userSelect: 'none',
    }}
    onClick={onSort}
    title={onSort ? 'Clique para ordenar esta coluna' : undefined}
    >
      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
      {onSort && (
        <button
          type="button"
          onClick={(evento) => {
            evento.stopPropagation()
            onSort()
          }}
          title={sortDirection === 'desc' ? 'Ordenado Z-A. Clique para A-Z.' : sortDirection === 'asc' ? 'Ordenado A-Z. Clique para Z-A.' : 'Ordenar coluna'}
          style={{
            position: 'absolute',
            top: 5,
            right: onResize ? 12 : 5,
            border: sortDirection ? '1px solid #93c5fd' : '1px solid #cbd5e1',
            background: sortDirection ? '#dbeafe' : '#fff',
            color: sortDirection ? '#1d4ed8' : '#64748b',
            borderRadius: 999,
            padding: '2px 6px',
            fontSize: 9,
            fontWeight: 900,
            cursor: 'pointer',
            lineHeight: 1.2,
          }}
        >
          {sortDirection === 'desc' ? 'Z-A' : 'A-Z'}
        </button>
      )}
      {onResize && (
        <span
          onMouseDown={iniciarResize}
          onClick={evento => evento.stopPropagation()}
          title="Arraste para ajustar a largura da coluna"
          style={{
            position: 'absolute',
            top: 0,
            right: -3,
            width: 7,
            height: '100%',
            cursor: 'col-resize',
          }}
        />
      )}
    </th>
  )
}

function Td({ children, style }) {
  return <td style={{ padding: '7px 10px', borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #f8fafc', fontSize: 12, verticalAlign: 'middle', overflowWrap: 'break-word', ...style }}>{children}</td>
}

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  background: 'rgba(15, 23, 42, 0.58)',
  padding: 16,
  display: 'flex',
  alignItems: 'stretch',
  justifyContent: 'center',
}

const fullPanelStyle = {
  width: '100%',
  maxWidth: 'calc(100vw - 32px)',
  background: '#fff',
  borderRadius: 14,
  padding: 14,
  boxShadow: '0 24px 80px rgba(15, 23, 42, 0.35)',
  overflow: 'hidden',
}

function Campo({ label, children }) {
  return <div><label style={{ display: 'block', fontSize: 10, textTransform: 'uppercase', fontWeight: 900, color: '#334155', marginBottom: 5 }}>{label}</label>{children}</div>
}

function botao(bg, color = '#fff') {
  return {
    background: bg,
    border: 'none',
    color,
    borderRadius: 9,
    padding: '9px 12px',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
  }
}

function abaBtn(ativo) {
  return {
    border: 'none',
    borderRadius: 10,
    padding: '10px 14px',
    background: ativo ? '#0f766e' : '#e2e8f0',
    color: ativo ? '#fff' : '#1e293b',
    fontWeight: 900,
    cursor: 'pointer',
    textAlign: 'left',
  }
}

const inputStyle = {
  width: '100%',
  border: '1px solid #cbd5e1',
  borderRadius: 9,
  padding: '10px 12px',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
}
