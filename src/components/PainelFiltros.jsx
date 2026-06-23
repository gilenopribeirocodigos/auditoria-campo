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

  // Override total
  if (perms.includes('acesso_todos_processos')) return null

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

  // Sem processos marcados, o usuário não vê equipes da estrutura.
  // Para liberar tudo, use a permissão perfil 'acesso_todos_processos'.
  if (processosLiberados.size === 0) return []

  // Quando existe cruzamento natural, o processo restringe dentro da própria estrutura do usuário.
  // Quando não existe cruzamento natural (ex.: analista), o processo libera a visão daquele processo geral.
  const baseProcessos = linhasMinhas.length > 0 ? linhasMinhas : (estruturaData || [])
  const linhasPermitidas = baseProcessos.filter(r => processosLiberados.has(processoToKey(r.processo_equipe)))

  const todosPrefixos = new Set()
  linhasPermitidas.forEach(r => {
    if (r.prefixo) todosPrefixos.add(r.prefixo)
  })

  return [...todosPrefixos]
}




// Carrega a estrutura_equipes uma vez e gerencia todos os estados de filtro.
// Retorna estados + setters + helpers (getDatasQuery, filtrar, limparTodos).
//
// SEGREGAÇÃO POR PROCESSO/ESTRUTURA (passando `usuarioLogado`):
//   • ADMIN ou permissão 'acesso_todos_processos' → vê tudo (prefixosPermitidos = null)
//   • Processos marcados no cadastro do usuário restringem a estrutura visível
//   • Se o usuário cruza com a estrutura, vê somente os próprios prefixos dentro dos processos marcados
//   • Se não cruza com a estrutura, vê os prefixos gerais dos processos marcados
//   • Sem processos marcados → não vê equipes da estrutura
//
// O hook FILTRA automaticamente supervOps, supervCampos e prefixosTodos pelos
// prefixos permitidos, então o painel já reflete a segregação sem mudanças nas telas.
// Telas devem usar `prefixosPermitidos` para filtrar suas queries de dados.
export function useFiltrosOperacionais({ inicializarMes = true, usuarioLogado = null } = {}) {
  const [modoPeriodo, setModoPeriodo] = useState(false)
  const [mesAno,      setMesAno]      = useState(inicializarMes ? calcMesAtual() : '')
  const [dataIni,     setDataIni]     = useState('')
  const [dataFim,     setDataFim]     = useState('')
  const [selSupOp,    setSelSupOp]    = useState([])
  const [selSupCampo, setSelSupCampo] = useState([])
  const [selPrefixos, setSelPrefixos] = useState([])

  const [estrutura, setEstrutura] = useState({
    supervOps: [],
    supervCampos: [],
    prefixosTodos: [],
    mapPrefixo: {},    // { prefixo: { op, campo } }
    mapOpToCampo: {},  // { op: Set<campo> }
    prefixosPermitidos: null,  // null = sem restrição; array = lista de prefixos permitidos
    carregado: false,
  })

  // ── Carrega estrutura_equipes 1x (todos os filtros derivam daqui) ──
  // Quando `usuarioLogado` é passado, aplica segregação por estrutura:
  // os filtros visíveis são limitados aos prefixos onde o usuário aparece.
  useEffect(() => {
    supabase.from('estrutura_equipes')
      .select('prefixo, superv_campo, superv_operacao, coordenador, matricula, colaborador, processo_equipe')
      .then(({ data }) => {
        // ─── 1) Calcula prefixos permitidos pelo usuário logado ───
        const prefixosPermitidos = calcularPrefixosPermitidos(data, usuarioLogado)
        const setPermitidos      = prefixosPermitidos ? new Set(prefixosPermitidos) : null

        // ─── 2) Processa estrutura aplicando segregação ───
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

          const op    = r.superv_operacao?.trim() || ''
          const campo = r.superv_campo?.trim()    || ''
          if (op)    opSet.add(op)
          if (campo) campoSet.add(campo)
          prefSet.add(pref)
          mp[pref] = { op, campo }
          if (op && campo) {
            if (!op2c[op]) op2c[op] = new Set()
            op2c[op].add(campo)
          }
        })
        setEstrutura({
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
    if (selSupOp.length === 0) return
    const validos = new Set()
    selSupOp.forEach(op => estrutura.mapOpToCampo[op]?.forEach(c => validos.add(c)))
    setSelSupCampo(prev => prev.filter(c => validos.has(c)))
  }, [selSupOp, estrutura.mapOpToCampo])

  // ── Cascata 2: Sup. Op/Campo → limita Prefixos selecionados ──
  useEffect(() => {
    if (selSupOp.length === 0 && selSupCampo.length === 0) return
    setSelPrefixos(prev => prev.filter(p => {
      const info = estrutura.mapPrefixo[p]
      if (!info) return false
      if (selSupOp.length    > 0 && !selSupOp.includes(info.op))       return false
      if (selSupCampo.length > 0 && !selSupCampo.includes(info.campo)) return false
      return true
    }))
  }, [selSupOp, selSupCampo, estrutura.mapPrefixo])

  // ── Opções visíveis (cascata aplicada) ──
  const supervCamposVisiveis = useMemo(() => {
    if (selSupOp.length === 0) return estrutura.supervCampos
    const validos = new Set()
    selSupOp.forEach(op => estrutura.mapOpToCampo[op]?.forEach(c => validos.add(c)))
    return estrutura.supervCampos.filter(c => validos.has(c))
  }, [selSupOp, estrutura.mapOpToCampo, estrutura.supervCampos])

  const prefixosVisiveis = useMemo(() => {
    if (selSupOp.length === 0 && selSupCampo.length === 0) return estrutura.prefixosTodos
    return estrutura.prefixosTodos.filter(p => {
      const info = estrutura.mapPrefixo[p]
      if (!info) return false
      if (selSupOp.length    > 0 && !selSupOp.includes(info.op))       return false
      if (selSupCampo.length > 0 && !selSupCampo.includes(info.campo)) return false
      return true
    })
  }, [selSupOp, selSupCampo, estrutura.prefixosTodos, estrutura.mapPrefixo])

  // ── Datas para uso em queries (.gte/.lte) ──
  const getDatasQuery = () => {
    if (modoPeriodo && dataIni) {
      return { ini: dataIni, fim: dataFim || dataIni }
    }
    if (mesAno) {
      const [ano, mes] = mesAno.split('-')
      return {
        ini: `${ano}-${mes}-01`,
        fim: new Date(parseInt(ano), parseInt(mes), 0).toISOString().split('T')[0],
      }
    }
    return { ini: null, fim: null }
  }

  // ── Label legível do período ativo ──
  const periodoLabel = modoPeriodo && dataIni
    ? (dataFim && dataFim !== dataIni ? `${fmtData(dataIni)} → ${fmtData(dataFim)}` : fmtData(dataIni))
    : mesAno ? mesLabel(mesAno) : 'Todos'

  // ── Filtra uma lista em memória por supervisor/prefixo ──
  // Cada item precisa ter um campo de prefixo (default: 'prefixo').
  // ATENÇÃO: também aplica SEGREGAÇÃO POR ESTRUTURA automaticamente —
  // se o usuário tem restrição (estrutura.prefixosPermitidos != null),
  // filtra a lista pra incluir só itens com prefixo permitido, mesmo
  // sem nenhum filtro hierárquico ativo no painel.
  const filtrar = (lista, { prefixoField = 'prefixo' } = {}) => {
    const temFiltro = selSupOp.length > 0 || selSupCampo.length > 0 || selPrefixos.length > 0
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
      if (selPrefixos.length > 0 && !selPrefixos.includes(pref)) return false
      const info = estrutura.mapPrefixo[pref]
      if (selSupOp.length    > 0 && (!info || !selSupOp.includes(info.op)))       return false
      if (selSupCampo.length > 0 && (!info || !selSupCampo.includes(info.campo))) return false
      return true
    })
  }

  // ── Limpar todos os filtros ──
  const limparTodos = () => {
    setSelSupOp([])
    setSelSupCampo([])
    setSelPrefixos([])
    setDataIni('')
    setDataFim('')
    setModoPeriodo(false)
    if (inicializarMes) setMesAno(calcMesAtual())
  }

  // ── Algum filtro está ativo? ──
  const temFiltrosAtivos = (
    selSupOp.length    > 0 ||
    selSupCampo.length > 0 ||
    selPrefixos.length > 0 ||
    modoPeriodo ||
    (inicializarMes && mesAno !== calcMesAtual())
  )

  return {
    // estados controlados
    modoPeriodo, setModoPeriodo,
    mesAno,      setMesAno,
    dataIni,     setDataIni,
    dataFim,     setDataFim,
    selSupOp,    setSelSupOp,
    selSupCampo, setSelSupCampo,
    selPrefixos, setSelPrefixos,
    // dados derivados de estrutura_equipes
    supervOps:           estrutura.supervOps,
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
    modoPeriodo, setModoPeriodo,
    mesAno,      setMesAno,
    dataIni,     setDataIni,
    dataFim,     setDataFim,
    selSupOp,    setSelSupOp,
    selSupCampo, setSelSupCampo,
    selPrefixos, setSelPrefixos,
    supervOps, supervCamposVisiveis, prefixosVisiveis,
    periodoLabel, limparTodos, temFiltrosAtivos,
  } = filtros

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

        {/* Supervisor Operacional */}
        <div>
          <label style={LABEL_STYLE}>Supervisor Operacional</label>
          <MultiSelect
            opcoes={supervOps}
            selecionados={selSupOp}
            onChange={setSelSupOp}
            placeholder="Todos"
          />
        </div>

        {/* Supervisor de Campo (com cascata) */}
        <div>
          <label style={LABEL_STYLE}>
            Supervisor de Campo
            {selSupOp.length > 0 && (
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
              {(selSupOp.length > 0 || selSupCampo.length > 0) && (
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
      {modoPeriodo && (
        <div style={{
          fontSize: 11, color: dataIni ? '#1d4ed8' : '#d97706',
          fontWeight: 700, marginTop: 10, textAlign: 'right',
        }}>
          {dataIni ? `📆 Filtrando: ${periodoLabel}` : '⚠️ Selecione a data inicial para aplicar'}
        </div>
      )}
    </div>
  )
}
