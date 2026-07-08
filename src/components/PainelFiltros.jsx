// src/components/PainelFiltros.jsx
//
// Componente reutilizável de filtros operacionais (Período + Supervisor Operacional
// + Supervisor de Campo + Prefixo) usado em todas as telas que precisam filtrar
// dados por hierarquia/equipe.
//
// Uso:
//   import { useFiltrosOperacionais, PainelFiltros } from '../components/PainelFiltros.jsx'
//   const filtros = useFiltrosOperacionais()
//   <PainelFiltros filtros={filtros} titulo="🔍 Filtros" />
//
// Para passar filtros extras específicos de uma tela (ex: Tipo, Resultado),
// use a prop `extras` (React node):
//   <PainelFiltros filtros={filtros} extras={<MeuFiltroExtra />} />

import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'

// ─── Helpers de data (exportados para uso nas telas) ────────────────────────
export function calcHoje() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function calcMesAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function mesLabel(mesAno) {
  const [ano, mes] = mesAno.split('-')
  const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${nomes[parseInt(mes) - 1]}/${ano}`
}

export function fmtData(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// ─── Estilos padronizados (exportados para uso em extras) ───────────────────
export const FIELD_HEIGHT = 38
export const LABEL_STYLE = {
  display: 'block',
  fontSize: 11,
  fontWeight: 800,
  color: '#475569',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 6,
}
export const INPUT_STYLE = {
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

// ─── MultiSelect com checkboxes + busca interna ─────────────────────────────
// Exportado para uso em filtros extras nas telas.
export function MultiSelect({ opcoes, selecionados, onChange, placeholder = 'Todos', disabled = false, formatOption }) {
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

  const display = formatOption || ((o) => o)
  const opcoesFiltradas = busca
    ? opcoes.filter(o => display(o).toLowerCase().includes(busca.toLowerCase()))
    : opcoes

  const textoBotao =
    selecionados.length === 0 ? placeholder
    : selecionados.length === 1 ? display(selecionados[0])
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
        }}>{textoBotao}</span>
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
              type="text" autoFocus placeholder="Buscar..." value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{
                width: '100%', padding: '6px 10px', fontSize: 12,
                border: '1px solid #e2e8f0', borderRadius: 8, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {selecionados.length > 0 && (
              <button type="button" onClick={() => onChange([])} style={{
                marginTop: 6, width: '100%', padding: '4px 8px',
                fontSize: 11, fontWeight: 700, color: '#dc2626',
                background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: 6, cursor: 'pointer',
              }}>✕ Limpar seleção ({selecionados.length})</button>
            )}
          </div>

          {opcoesFiltradas.length === 0 ? (
            <p style={{ padding: 14, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Nenhum resultado</p>
          ) : opcoesFiltradas.map(op => {
            const sel = selecionados.includes(op)
            return (
              <button key={op} type="button" onClick={() => toggle(op)}
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
                <span style={{ fontSize: 12, color: '#1e293b', fontWeight: sel ? 700 : 500 }}>{display(op)}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Helpers internos: matching de nomes pra cruzar usuário ↔ estrutura ──────
function normalizarNome(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .trim()
}

// Compara nomes considerando que a estrutura pode ter nome abreviado
// (ex: usuario "CHRISLEY MARK PEREIRA" deve bater com estrutura "CHRISLEY").
function matchNomes(nomeUsuario, nomeEstrutura) {
  if (!nomeUsuario || !nomeEstrutura) return false
  const u = normalizarNome(nomeUsuario)
  const e = normalizarNome(nomeEstrutura)
  if (!u || !e || u.length < 3 || e.length < 3) return false

  if (u === e) return true
  // Um nome é prefixo do outro delimitado por espaço
  if ((u + ' ').startsWith(e + ' ')) return true
  if ((e + ' ').startsWith(u + ' ')) return true
  return false
}

// ─── Helpers de processo (exportados pra UI usar) ───────────────────────────
// Converte "LIGAÇÃO NOVA" → "processo_LIGACAO_NOVA" (chave da permissão).
// Normalização: maiúscula + remove acentos + qualquer não-alfanumérico → underscore.
export function processoToKey(processo) {
  const norm = (processo || '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return norm ? `processo_${norm}` : ''
}

export function regionalToKey(regional) {
  const norm = (regional || '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return norm ? `regional_${norm}` : ''
}

// Calcula quais prefixos o usuário tem acesso baseado em:
//   1. Cruzamento com estrutura_equipes (hierarquia natural)
//   2. Processos liberados via permissões (chaves processo_XXX)
//
// Retorna null = sem restrição (vê tudo). Array = restrição ativa.
function calcularPrefixosPermitidos(estruturaData, usuarioLogado) {
  // Sem usuário → não restringe (uso público/anônimo)
  if (!usuarioLogado) return null
  // ADMIN sempre vê tudo
  if (usuarioLogado.perfil === 'ADMIN') return null

  const perms = usuarioLogado.permissoes || []

  const regionaisLiberadas = new Set(
    perms.filter(p => typeof p === 'string' && p.startsWith('regional_'))
  )
  const filtrarPorRegionais = linhas => {
    if (regionaisLiberadas.size === 0) return linhas
    return (linhas || []).filter(r => regionaisLiberadas.has(regionalToKey(r.regional)))
  }

  // Override total. Se houver regional marcada, ela limita o acesso total.
  if (perms.includes('acesso_todos_processos')) {
    if (regionaisLiberadas.size === 0) return null
    return [...new Set(filtrarPorRegionais(estruturaData || []).map(r => r.prefixo).filter(Boolean))]
  }

  // ─── 1. Hierarquia natural (regra que já existia) ───
  const nome      = usuarioLogado.nome || ''
  const matricula = String(usuarioLogado.matricula || '')

  const linhasMinhas = (estruturaData || []).filter(r => {
    if (matricula && String(r.matricula || '') === matricula) return true
    if (matchNomes(nome, r.superv_campo))    return true
    if (matchNomes(nome, r.superv_operacao)) return true
    if (matchNomes(nome, r.coordenador))     return true
    return false
  })

  // ─── 2. Processos liberados via permissão (processo_XXX) ───
  // Set com as chaves processo_XXX que o usuário tem. Comparação por chave
  // (normalizada) pra ser tolerante a acentos/espaços/case.
  const processosLiberados = new Set(
    perms.filter(p => typeof p === 'string' && p.startsWith('processo_'))
  )

  // Regra cumulativa do manual: hierarquia natural + processos marcados.
  // Se não houver cruzamento natural nem processo marcado, mantém o padrão liberal.
  if (linhasMinhas.length === 0 && processosLiberados.size === 0 && regionaisLiberadas.size === 0) return null

  const linhasDosProcessos = processosLiberados.size > 0
    ? (estruturaData || []).filter(r => processosLiberados.has(processoToKey(r.processo_equipe)))
    : []

  const base = (linhasMinhas.length || linhasDosProcessos.length)
    ? [...linhasMinhas, ...linhasDosProcessos]
    : (estruturaData || [])

  const todosPrefixos = new Set()
  ;filtrarPorRegionais(base).forEach(r => {
    if (r.prefixo) todosPrefixos.add(r.prefixo)
  })

  return [...todosPrefixos]
}




// Carrega a estrutura_equipes uma vez e gerencia todos os estados de filtro.
// Retorna estados + setters + helpers (getDatasQuery, filtrar, limparTodos).
//
// SEGREGAÇÃO POR PROCESSO/ESTRUTURA (passando `usuarioLogado`):
//   • ADMIN ou permissão 'acesso_todos_processos' → vê tudo (prefixosPermitidos = null)
//   • Se o usuário cruza com a estrutura, vê os prefixos da hierarquia natural
//   • Processos marcados no cadastro do usuário somam todos os prefixos daquele processo
//   • Com hierarquia + processos, vê a união das duas regras
//   • Sem cruzamento natural e sem processos marcados → padrão liberal (sem restrição)
//
// O hook FILTRA automaticamente supervOps, supervCampos e prefixosTodos pelos
// prefixos permitidos, então o painel já reflete a segregação sem mudanças nas telas.
// Telas devem usar `prefixosPermitidos` para filtrar suas queries de dados.
export function useFiltrosOperacionais({ inicializarMes = true, usuarioLogado = null, periodoPadrao = null } = {}) {
  const periodoInicial = periodoPadrao || (inicializarMes ? 'mes' : 'todos')
  const [tipoPeriodo, setTipoPeriodo] = useState(periodoInicial)
  const [mesAno,      setMesAno]      = useState(inicializarMes ? calcMesAtual() : '')
  const [dataIni,     setDataIni]     = useState('')
  const [dataFim,     setDataFim]     = useState('')
  const [selRegional, setSelRegional] = useState([])
  const [selSupOp,    setSelSupOp]    = useState([])
  const [selSupCampo, setSelSupCampo] = useState([])
  const [selPrefixos, setSelPrefixos] = useState([])

  const modoPeriodo = tipoPeriodo === 'periodo'
  const setModoPeriodo = (ativo) => {
    setTipoPeriodo(ativo ? 'periodo' : (inicializarMes ? 'mes' : 'todos'))
    if (!ativo) {
      setDataIni('')
      setDataFim('')
    }
  }

  const [estrutura, setEstrutura] = useState({
    regionais: [],
    supervOps: [],
    supervCampos: [],
    prefixosTodos: [],
    mapPrefixo: {},    // { prefixo: { regional, op, campo } }
    mapOpToCampo: {},  // { op: Set<campo> }
    prefixosPermitidos: null,  // null = sem restrição; array = lista de prefixos permitidos
    carregado: false,
  })

  // ── Carrega estrutura_equipes 1x (todos os filtros derivam daqui) ──
  // Quando `usuarioLogado` é passado, aplica segregação por estrutura/processos:
  // os filtros visíveis são limitados aos prefixos permitidos pela regra cumulativa.
  useEffect(() => {
    supabase.from('estrutura_equipes')
      .select('regional, prefixo, superv_campo, superv_operacao, coordenador, matricula, colaborador, processo_equipe')
      .then(({ data }) => {
        // ─── 1) Calcula prefixos permitidos pelo usuário logado ───
        const prefixosPermitidos = calcularPrefixosPermitidos(data, usuarioLogado)
        const setPermitidos      = prefixosPermitidos ? new Set(prefixosPermitidos) : null

        // ─── 2) Processa estrutura aplicando segregação ───
        const regionalSet = new Set()
        const opSet    = new Set()
        const campoSet = new Set()
        const prefSet  = new Set()
        const mp       = {}
        const op2c     = {}
        ;(data || []).forEach(r => {
          const pref = r.prefixo?.trim() || ''
          if (!pref) return
          // Se há restrição e o prefixo NÃO está permitido, ignora a linha inteira
          if (setPermitidos && !setPermitidos.has(pref)) return

          const regional = r.regional?.trim() || ''
          const op    = r.superv_operacao?.trim() || ''
          const campo = r.superv_campo?.trim()    || ''
          if (regional) regionalSet.add(regional)
          if (op)    opSet.add(op)
          if (campo) campoSet.add(campo)
          prefSet.add(pref)
          mp[pref] = { regional, op, campo }
          if (op && campo) {
            if (!op2c[op]) op2c[op] = new Set()
            op2c[op].add(campo)
          }
        })
        setEstrutura({
          regionais:          [...regionalSet].sort(),
          supervOps:          [...opSet].sort(),
          supervCampos:       [...campoSet].sort(),
          prefixosTodos:      [...prefSet].sort(),
          mapPrefixo:         mp,
          mapOpToCampo:       op2c,
          prefixosPermitidos,
          carregado:          true,
        })
      })
  }, [usuarioLogado?.id])  // recarrega se usuário mudar

  // ── Cascata 1: Sup. Op → limita Sup. Campo selecionados ──
  useEffect(() => {
    if (selRegional.length === 0) return
    const validOps = new Set()
    const validCampos = new Set()
    const validPrefs = new Set()

    Object.entries(estrutura.mapPrefixo).forEach(([pref, info]) => {
      if (!selRegional.includes(info.regional)) return
      if (info.op) validOps.add(info.op)
      if (info.campo) validCampos.add(info.campo)
      validPrefs.add(pref)
    })

    setSelSupOp(prev => prev.filter(op => validOps.has(op)))
    setSelSupCampo(prev => prev.filter(campo => validCampos.has(campo)))
    setSelPrefixos(prev => prev.filter(pref => validPrefs.has(pref)))
  }, [selRegional, estrutura.mapPrefixo])

  useEffect(() => {
    if (selRegional.length === 0 && selSupOp.length === 0) return
    const validos = new Set()
    Object.values(estrutura.mapPrefixo).forEach(info => {
      if (selRegional.length > 0 && !selRegional.includes(info.regional)) return
      if (selSupOp.length > 0 && !selSupOp.includes(info.op)) return
      if (info.campo) validos.add(info.campo)
    })
    setSelSupCampo(prev => prev.filter(c => validos.has(c)))
  }, [selRegional, selSupOp, estrutura.mapPrefixo])

  // ── Cascata 2: Sup. Op/Campo → limita Prefixos selecionados ──
  useEffect(() => {
    if (selRegional.length === 0 && selSupOp.length === 0 && selSupCampo.length === 0) return
    setSelPrefixos(prev => prev.filter(p => {
      const info = estrutura.mapPrefixo[p]
      if (!info) return false
      if (selRegional.length > 0 && !selRegional.includes(info.regional)) return false
      if (selSupOp.length    > 0 && !selSupOp.includes(info.op))       return false
      if (selSupCampo.length > 0 && !selSupCampo.includes(info.campo)) return false
      return true
    }))
  }, [selRegional, selSupOp, selSupCampo, estrutura.mapPrefixo])

  // ── Opções visíveis (cascata aplicada) ──
  const supervOpsVisiveis = useMemo(() => {
    if (selRegional.length === 0) return estrutura.supervOps
    const validos = new Set()
    Object.values(estrutura.mapPrefixo).forEach(info => {
      if (selRegional.includes(info.regional) && info.op) validos.add(info.op)
    })
    return estrutura.supervOps.filter(op => validos.has(op))
  }, [selRegional, estrutura.mapPrefixo, estrutura.supervOps])

  const supervCamposVisiveis = useMemo(() => {
    if (selRegional.length === 0 && selSupOp.length === 0) return estrutura.supervCampos
    return estrutura.supervCampos.filter(campo =>
      Object.values(estrutura.mapPrefixo).some(info => {
        if (info.campo !== campo) return false
        if (selRegional.length > 0 && !selRegional.includes(info.regional)) return false
        if (selSupOp.length > 0 && !selSupOp.includes(info.op)) return false
        return true
      })
    )
  }, [selRegional, selSupOp, estrutura.mapPrefixo, estrutura.supervCampos])

  const prefixosVisiveis = useMemo(() => {
    if (selRegional.length === 0 && selSupOp.length === 0 && selSupCampo.length === 0) return estrutura.prefixosTodos
    return estrutura.prefixosTodos.filter(p => {
      const info = estrutura.mapPrefixo[p]
      if (!info) return false
      if (selRegional.length > 0 && !selRegional.includes(info.regional)) return false
      if (selSupOp.length    > 0 && !selSupOp.includes(info.op))       return false
      if (selSupCampo.length > 0 && !selSupCampo.includes(info.campo)) return false
      return true
    })
  }, [selRegional, selSupOp, selSupCampo, estrutura.prefixosTodos, estrutura.mapPrefixo])

  // ── Datas para uso em queries (.gte/.lte) ──
  const getDatasQuery = () => {
    if (tipoPeriodo === 'hoje') {
      const hoje = calcHoje()
      return { ini: hoje, fim: hoje }
    }
    if (tipoPeriodo === 'periodo' && dataIni) {
      return { ini: dataIni, fim: dataFim || dataIni }
    }
    if (tipoPeriodo === 'mes' && mesAno) {
      const [ano, mes] = mesAno.split('-')
      return {
        ini: `${ano}-${mes}-01`,
        fim: new Date(parseInt(ano), parseInt(mes), 0).toISOString().split('T')[0],
      }
    }
    return { ini: null, fim: null }
  }

  // ── Label legível do período ativo ──
  const periodoLabel = tipoPeriodo === 'hoje'
    ? `Hoje (${fmtData(calcHoje())})`
    : tipoPeriodo === 'periodo' && dataIni
      ? (dataFim && dataFim !== dataIni ? `${fmtData(dataIni)} → ${fmtData(dataFim)}` : fmtData(dataIni))
      : tipoPeriodo === 'mes' && mesAno ? mesLabel(mesAno) : 'Todos'

  // ── Filtra uma lista em memória por supervisor/prefixo ──
  // Cada item precisa ter um campo de prefixo (default: 'prefixo').
  // ATENÇÃO: também aplica SEGREGAÇÃO POR ESTRUTURA automaticamente —
  // se o usuário tem restrição (estrutura.prefixosPermitidos != null),
  // filtra a lista pra incluir só itens com prefixo permitido, mesmo
  // sem nenhum filtro hierárquico ativo no painel.
  const filtrar = (lista, { prefixoField = 'prefixo' } = {}) => {
    const temFiltro = selRegional.length > 0 || selSupOp.length > 0 || selSupCampo.length > 0 || selPrefixos.length > 0
    const setPermitidos = estrutura.prefixosPermitidos
      ? new Set(estrutura.prefixosPermitidos)
      : null

    if (!temFiltro && !setPermitidos) return lista

    return lista.filter(item => {
      const pref = item[prefixoField]
      if (!pref) return false

      // Segregação por estrutura (sempre aplicada quando há restrição)
      if (setPermitidos && !setPermitidos.has(pref)) return false

      // Sem filtros do painel → já passou na segregação, libera
      if (!temFiltro) return true

      // Filtros do painel
      const info = estrutura.mapPrefixo[pref]
      if (selRegional.length > 0 && (!info || !selRegional.includes(info.regional))) return false
      if (selPrefixos.length > 0 && !selPrefixos.includes(pref)) return false
      if (selSupOp.length    > 0 && (!info || !selSupOp.includes(info.op)))       return false
      if (selSupCampo.length > 0 && (!info || !selSupCampo.includes(info.campo))) return false
      return true
    })
  }

  // ── Limpar todos os filtros ──
  const limparTodos = () => {
    setSelRegional([])
    setSelSupOp([])
    setSelSupCampo([])
    setSelPrefixos([])
    setDataIni('')
    setDataFim('')
    setTipoPeriodo(periodoInicial)
    if (inicializarMes) setMesAno(calcMesAtual())
  }

  // ── Algum filtro está ativo? ──
  const temFiltrosAtivos = (
    selRegional.length > 0 ||
    selSupOp.length    > 0 ||
    selSupCampo.length > 0 ||
    selPrefixos.length > 0 ||
    tipoPeriodo !== periodoInicial ||
    (tipoPeriodo === 'mes' && inicializarMes && mesAno !== calcMesAtual()) ||
    (tipoPeriodo === 'periodo' && (dataIni || dataFim))
  )

  return {
    // estados controlados
    tipoPeriodo, setTipoPeriodo,
    modoPeriodo, setModoPeriodo,
    mesAno,      setMesAno,
    dataIni,     setDataIni,
    dataFim,     setDataFim,
    selRegional, setSelRegional,
    selSupOp,    setSelSupOp,
    selSupCampo, setSelSupCampo,
    selPrefixos, setSelPrefixos,
    // dados derivados de estrutura_equipes
    regionais:           estrutura.regionais,
    supervOps:           estrutura.supervOps,
    supervOpsVisiveis,
    supervCamposVisiveis,
    prefixosVisiveis,
    mapPrefixo:          estrutura.mapPrefixo,
    estruturaCarregada:  estrutura.carregado,
    // segregação por estrutura (null = sem restrição, array = restrito)
    prefixosPermitidos:  estrutura.prefixosPermitidos,
    temSegregacao:       estrutura.prefixosPermitidos !== null,
    // utilitários
    periodoLabel,
    getDatasQuery,
    filtrar,
    limparTodos,
    temFiltrosAtivos,
  }
}

// ─── Componente: PainelFiltros ──────────────────────────────────────────────
// Renderiza o card de filtros completo (Período + Sup. Operacional + Sup. Campo + Prefixo).
// Aceita "extras" como React node para filtros específicos da tela (ex: Tipo, Resultado).
export function PainelFiltros({
  filtros,
  titulo = '🔍 Filtros',
  badge  = 'aplica em todos os dados',
  extras = null,
  mesesOpcoesCount = 6,
  mostrarMesPeriodo = true,
  mostrarPrefixo = true,
}) {
  const {
    tipoPeriodo, setTipoPeriodo,
    modoPeriodo, setModoPeriodo,
    mesAno,      setMesAno,
    dataIni,     setDataIni,
    dataFim,     setDataFim,
    selRegional, setSelRegional,
    selSupOp,    setSelSupOp,
    selSupCampo, setSelSupCampo,
    selPrefixos, setSelPrefixos,
    regionais, supervOpsVisiveis, supervCamposVisiveis, prefixosVisiveis,
    periodoLabel, limparTodos, temFiltrosAtivos,
  } = filtros

  const selecionarHoje = () => {
    setTipoPeriodo('hoje')
    setDataIni('')
    setDataFim('')
  }

  const selecionarMes = () => {
    setTipoPeriodo('mes')
    setDataIni('')
    setDataFim('')
    if (!mesAno && mesesOpcoesCount > 0) setMesAno(calcMesAtual())
  }

  const selecionarPeriodo = () => {
    setTipoPeriodo('periodo')
    if (!dataIni) {
      const hoje = calcHoje()
      setDataIni(hoje)
      setDataFim(hoje)
    }
  }

  const botaoPeriodoStyle = (ativo) => ({
    flex: 1, borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: 700, transition: 'all 0.2s',
    background: ativo ? '#fff' : 'transparent',
    color:      ativo ? '#1e3a5f' : '#64748b',
    boxShadow:  ativo ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
    whiteSpace: 'nowrap',
  })

  const mesesOpcoes = Array.from({ length: mesesOpcoesCount }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - (mesesOpcoesCount - 1) + i)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  return (
    <div style={{
      background: '#fff', borderRadius: 14, border: '1.5px solid #e2e8f0',
      padding: '16px 18px', marginBottom: 16,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #f1f5f9',
        flexWrap: 'wrap', gap: 8,
      }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {titulo}
          {badge && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: '#64748b',
              background: '#f1f5f9', padding: '2px 8px', borderRadius: 6,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>{badge}</span>
          )}
        </p>
        {temFiltrosAtivos && (
          <button onClick={limparTodos} style={{
            fontSize: 11, fontWeight: 700, color: '#dc2626',
            background: '#fef2f2', border: '1px solid #fecaca',
            padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
          }}>✕ Limpar filtros</button>
        )}
      </div>

      {/* Grid de campos */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 14,
        alignItems: 'flex-start',
      }}>

        {/* Período */}
        {mostrarMesPeriodo && (
          <div>
            <label style={LABEL_STYLE}>Período</label>

            {/* Toggle Hoje / Mês / Período */}
            <div style={{
              display: 'flex', background: '#f1f5f9', borderRadius: 10,
              padding: 3, gap: 2, marginBottom: 8, height: FIELD_HEIGHT, boxSizing: 'border-box',
            }}>
              <button type="button" onClick={selecionarHoje} style={botaoPeriodoStyle(tipoPeriodo === 'hoje')}>📍 Hoje</button>
              <button type="button" onClick={selecionarMes} style={botaoPeriodoStyle(tipoPeriodo === 'mes')}>📅 Mês</button>
              <button type="button" onClick={selecionarPeriodo} style={botaoPeriodoStyle(tipoPeriodo === 'periodo')}>📆 Período</button>
            </div>

            {/* Modo Hoje */}
            {tipoPeriodo === 'hoje' && (
              <div style={{
                ...INPUT_STYLE,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#eff6ff', color: '#1e3a5f', borderColor: '#bfdbfe',
              }}>
                <span>Hoje</span>
                <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 800 }}>{fmtData(calcHoje())}</span>
              </div>
            )}

            {/* Modo Mês: dropdown de mês */}
            {tipoPeriodo === 'mes' && (
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
            {tipoPeriodo === 'periodo' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, marginBottom: 3, letterSpacing: 0.5 }}>DE</p>
                  <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)}
                    style={{ ...INPUT_STYLE, padding: '0 10px', fontSize: 12, cursor: 'pointer' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, marginBottom: 3, letterSpacing: 0.5 }}>ATÉ</p>
                  <input type="date" value={dataFim} min={dataIni} onChange={e => setDataFim(e.target.value)}
                    style={{ ...INPUT_STYLE, padding: '0 10px', fontSize: 12, cursor: 'pointer' }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Regional */}
        <div>
          <label style={LABEL_STYLE}>Regional</label>
          <MultiSelect
            opcoes={regionais}
            selecionados={selRegional}
            onChange={setSelRegional}
            placeholder="Todas"
          />
        </div>

        {/* Supervisor Operacional */}
        <div>
          <label style={LABEL_STYLE}>
            Supervisor Operacional
            {selRegional.length > 0 && (
              <span style={{
                fontSize: 9, fontWeight: 700, color: '#2563eb',
                background: '#dbeafe', padding: '2px 6px', borderRadius: 5,
                marginLeft: 6, textTransform: 'none', letterSpacing: 0,
              }}>cascata ativa</span>
            )}
          </label>
          <MultiSelect
            opcoes={supervOpsVisiveis}
            selecionados={selSupOp}
            onChange={setSelSupOp}
            placeholder="Todos"
          />
        </div>

        {/* Supervisor de Campo (com cascata) */}
        <div>
          <label style={LABEL_STYLE}>
            Supervisor de Campo
            {(selRegional.length > 0 || selSupOp.length > 0) && (
              <span style={{
                fontSize: 9, fontWeight: 700, color: '#2563eb',
                background: '#dbeafe', padding: '2px 6px', borderRadius: 5,
                marginLeft: 6, textTransform: 'none', letterSpacing: 0,
              }}>cascata ativa</span>
            )}
          </label>
          <MultiSelect
            opcoes={supervCamposVisiveis}
            selecionados={selSupCampo}
            onChange={setSelSupCampo}
            placeholder="Todos"
          />
        </div>

        {/* Prefixo (com cascata) */}
        {mostrarPrefixo && (
          <div>
            <label style={LABEL_STYLE}>
              Prefixo
              {(selRegional.length > 0 || selSupOp.length > 0 || selSupCampo.length > 0) && (
                <span style={{
                  fontSize: 9, fontWeight: 700, color: '#2563eb',
                  background: '#dbeafe', padding: '2px 6px', borderRadius: 5,
                  marginLeft: 6, textTransform: 'none', letterSpacing: 0,
                }}>cascata ativa</span>
              )}
            </label>
            <MultiSelect
              opcoes={prefixosVisiveis}
              selecionados={selPrefixos}
              onChange={setSelPrefixos}
              placeholder="Todos"
            />
          </div>
        )}

        {/* Extras específicos da tela (Tipo, Resultado, etc) */}
        {extras}
      </div>

      {/* Indicador do filtro de período ativo */}
      {(tipoPeriodo === 'hoje' || tipoPeriodo === 'periodo') && (
        <div style={{
          fontSize: 11, color: tipoPeriodo === 'periodo' && !dataIni ? '#d97706' : '#1d4ed8',
          fontWeight: 700, marginTop: 10, textAlign: 'right',
        }}>
          {tipoPeriodo === 'periodo' && !dataIni ? '⚠️ Selecione a data inicial para aplicar' : `📆 Filtrando: ${periodoLabel}`}
        </div>
      )}
    </div>
  )
}
