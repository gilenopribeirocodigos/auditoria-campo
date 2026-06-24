import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import { useFiltrosOperacionais, PainelFiltros, LABEL_STYLE, INPUT_STYLE } from '../components/PainelFiltros.jsx'

// ════════════════════════════════════════════════════════════════════════════
// IndisponibilidadePage v8
// ════════════════════════════════════════════════════════════════════════════

// ── Autocomplete genérico (prefixo ou eletricista nos cards) ─────────────────
function AutocompleteCard({ value, onChange, opcoes = [], placeholder = 'Digite para filtrar...',
  renderOpcao, valorDisplay }) {
  const [filtro, setFiltro] = useState(valorDisplay || value || '')
  const [aberto, setAberto] = useState(false)
  const ref = useRef(null)

  useEffect(() => { setFiltro(valorDisplay || value || '') }, [value, valorDisplay])

  useEffect(() => {
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) {
        setAberto(false)
        // Se o texto não bate com nenhuma opção, volta ao valor anterior
        const existe = opcoes.find(o => {
          const label = typeof o === 'string' ? o : o.label
          return label.toLowerCase() === filtro.toLowerCase()
        })
        if (!existe) setFiltro(valorDisplay || value || '')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [filtro, value, valorDisplay, opcoes])

  const opcoesFiltradas = opcoes.filter(o => {
    const label = typeof o === 'string' ? o : o.label
    return !filtro || label.toLowerCase().includes(filtro.toLowerCase())
  })

  const selecionar = o => {
    const val   = typeof o === 'string' ? o : o.value
    const label = typeof o === 'string' ? o : o.label
    onChange(val)
    setFiltro(label)
    setAberto(false)
  }

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <input
        className="form-input"
        value={filtro}
        onChange={e => { setFiltro(e.target.value); setAberto(true) }}
        onFocus={() => setAberto(true)}
        placeholder={placeholder}
        autoComplete="off"
        style={{ paddingRight: 32 }}
      />
      <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none' }}>🔍</span>
      {aberto && opcoesFiltradas.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
          background: '#fff', border: '1.5px solid #bfdbfe', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)', maxHeight: 220, overflowY: 'auto',
        }}>
          {opcoesFiltradas.map((o, i) => (
            <button key={i} type="button" onMouseDown={() => selecionar(o)} style={{
              display: 'block', width: '100%', padding: '9px 14px', textAlign: 'left',
              background: '#fff', border: 'none', cursor: 'pointer',
              borderBottom: i < opcoesFiltradas.length - 1 ? '1px solid #f1f5f9' : 'none',
            }}>
              {renderOpcao ? renderOpcao(o) : (
                <span style={{ fontSize: 13, fontFamily: '"Courier New", monospace', fontWeight: 600, color: '#1e293b' }}>
                  {typeof o === 'string' ? o : o.label}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {aberto && filtro && opcoesFiltradas.length === 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300, background: '#fff', border: '1.5px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#dc2626' }}>
          ❌ Nenhum resultado para "{filtro}"
        </div>
      )}
    </div>
  )
}

export default function IndisponibilidadePage({ usuarioLogado, onVoltar }) {
  console.log('✅ IndisponibilidadePage v8')

  const hoje = new Date().toISOString().split('T')[0]

  // ── Data simples (não usa toggle mês/período do PainelFiltros) ──
  const [data, setData] = useState(hoje)

  // ── Hook de filtros para Supervisor Operacional + Supervisor Campo + Prefixo ──
  const filtros = useFiltrosOperacionais({ inicializarMes: false, usuarioLogado })

  // ── Filtro extra: eletricista ──
  const [filtroEletId,    setFiltroEletId]    = useState('')
  const [buscaEletTexto,  setBuscaEletTexto]  = useState('')
  const [buscaEletAberta, setBuscaEletAberta] = useState(false)
  const eletFiltroRef = useRef(null)

  useEffect(() => {
    const handler = e => {
      if (eletFiltroRef.current && !eletFiltroRef.current.contains(e.target))
        setBuscaEletAberta(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Dados ──
  const [todosEletricistas, setTodosEletricistas] = useState([])
  const [todosEletricistasBase, setTodosEletricistasBase] = useState([])
  const [totalPessoalBase,  setTotalPessoalBase]  = useState(0)
  const [motivos,           setMotivos]           = useState([])
  const [prefixos,          setPrefixos]          = useState([])
  const [loading,           setLoading]           = useState(false)
  const [salvando,          setSalvando]          = useState(false)
  const [erro,              setErro]              = useState('')
  const [sucesso,           setSucesso]           = useState('')

  // registros[eletId] = { status, eletId (pode ser trocado!), prefixo, motivo_id, obs }
  const [registros,         setRegistros]         = useState({})
  const [abaAtiva,          setAbaAtiva]          = useState('frequencia')

  // Remanejamento
  const [buscaReman,        setBuscaReman]        = useState('')
  const [resultadosReman,   setResultadosReman]   = useState([])
  const [buscandoReman,     setBuscandoReman]     = useState(false)
  const [colaboradorRemanSelecionado, setColaboradorRemanSelecionado] = useState(null)
  const [remanejamentosDia, setRemanejamentosDia] = useState([])

  // Indisponibilidade (aba 3)
  const [ausentesHoje,      setAusentesHoje]      = useState([])
  const [formIndisp,        setFormIndisp]        = useState({ eletricista_id: '', prefixo: '', tipo: 'total', motivo_id: '', obs: '' })
  const [salvandoIndisp,    setSalvandoIndisp]    = useState(false)
  const [indispRegistradas, setIndispRegistradas] = useState([])

  // Contadores do dia (total geral, não só filtrado)
  const [contadores, setContadores] = useState({ presentes: 0, ausentes: 0 })
  const [idsRegistroDia, setIdsRegistroDia] = useState({ presentes: [], ausentes: [] })

  const isSupervisor    = usuarioLogado?.perfil !== 'ADMIN'
  const supervisorCampo = usuarioLogado?.nome
  const estruturaCarregada = filtros.estruturaCarregada
  const prefixosPermitidos = filtros.prefixosPermitidos

  const chaveTrocasPendentes = useMemo(() => `indisp_trocas_pendentes_${data}`, [data])

  const lerTrocasPendentes = useCallback(() => {
    try {
      return JSON.parse(localStorage.getItem(chaveTrocasPendentes) || '{}')
    } catch {
      return {}
    }
  }, [chaveTrocasPendentes])

  const gravarTrocasPendentes = useCallback((trocas) => {
    const limpas = Object.fromEntries(Object.entries(trocas).filter(([, prefixo]) => prefixo))
    if (Object.keys(limpas).length) localStorage.setItem(chaveTrocasPendentes, JSON.stringify(limpas))
    else localStorage.removeItem(chaveTrocasPendentes)
  }, [chaveTrocasPendentes])

  const aplicarTrocasPendentes = useCallback((lista) => {
    const trocas = lerTrocasPendentes()
    return lista.map(e => {
      const prefixoPendente = trocas[String(e.id)]
      return prefixoPendente ? { ...e, prefixo: prefixoPendente } : e
    })
  }, [lerTrocasPendentes])

  // ─── Carrega dados ao mudar a data ────────────────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    setRegistros({})
    setFiltroEletId('')
    setBuscaEletTexto('')
    setColaboradorRemanSelecionado(null)
    setResultadosReman([])
    setBuscaReman('')

    try {
      if (!estruturaCarregada) return

      const { data: motivosData } = await supabase
        .from('motivos_indisponibilidade').select('id, descricao').eq('ativo', true).order('descricao')
      setMotivos(motivosData || [])

      const { data: jaRegistrados } = await supabase
        .from('equipes_dia').select('eletricista_id, id_eletricista, id_indisponibilidade').eq('data', data)

      const motivoPresente = (motivosData || []).find(m => m.descricao.toUpperCase() === 'PRESENTE')
      const idsPresentes = new Set((jaRegistrados || []).filter(r => r.id_indisponibilidade === motivoPresente?.id).map(r => r.eletricista_id))
      const idsAusentes  = new Set((jaRegistrados || []).filter(r => r.id_indisponibilidade !== motivoPresente?.id).map(r => r.eletricista_id))
      const idsRegistrados = new Set((jaRegistrados || []).map(p => p.eletricista_id))

      // Contadores do dia
      setContadores({ presentes: idsPresentes.size, ausentes: idsAusentes.size })
      setIdsRegistroDia({ presentes: [...idsPresentes], ausentes: [...idsAusentes] })

      const prefixosRestritos = isSupervisor && Array.isArray(prefixosPermitidos) ? prefixosPermitidos : null
      if (prefixosRestritos && prefixosRestritos.length === 0) {
        setTotalPessoalBase(0)
        setTodosEletricistasBase([])
        setTodosEletricistas([])
        setPrefixos([])
        setAusentesHoje([])
        setRemanejamentosDia([])
        return
      }

      let queryRemanejamentosDia = supabase.from('remanejamentos')
        .select('id, eletricista_id, supervisor_origem, supervisor_destino, data, temporario, usuario_registro, criado_em, observacoes')
        .eq('data', data)
        .order('criado_em', { ascending: false })
      if (isSupervisor && supervisorCampo) queryRemanejamentosDia = queryRemanejamentosDia.eq('supervisor_destino', supervisorCampo)
      const { data: remanDiaData, error: erroRemanDia } = await queryRemanejamentosDia
      if (erroRemanDia) throw erroRemanDia

      const remanDia = remanDiaData || []
      const idsRemanejadosDia = [...new Set(remanDia.map(r => r.eletricista_id).filter(Boolean))]
      let remanejadosComDestino = []
      if (idsRemanejadosDia.length > 0) {
        const { data: eletRemanejados, error: erroEletRemanejados } = await supabase.from('estrutura_equipes')
          .select('id, id_eletricista, colaborador, matricula, prefixo, superv_campo, processo_equipe, base')
          .in('id', idsRemanejadosDia)
        if (erroEletRemanejados) throw erroEletRemanejados

        const remanPorId = new Map(remanDia.map(r => [String(r.eletricista_id), r]))
        remanejadosComDestino = (eletRemanejados || []).map(e => {
          const reman = remanPorId.get(String(e.id))
          return {
            ...e,
            superv_campo: reman?.supervisor_destino || supervisorCampo || e.superv_campo,
            remanejado: true,
            supervisor_origem_reman: reman?.supervisor_origem || e.superv_campo,
            remanejamento_id: reman?.id,
            criado_em_reman: reman?.criado_em,
          }
        })
      }

      const remanejadosPorId = new Map(remanejadosComDestino.map(e => [String(e.id), e]))
      setRemanejamentosDia(remanDia.map(r => {
        const e = remanejadosPorId.get(String(r.eletricista_id))
        return {
          ...r,
          colaborador: e?.colaborador || `Colaborador #${r.eletricista_id}`,
          matricula: e?.matricula || null,
          prefixo: e?.prefixo || null,
          base: e?.base || null,
          processo_equipe: e?.processo_equipe || null,
        }
      }))

      let query = supabase.from('estrutura_equipes')
        .select('id, id_eletricista, colaborador, matricula, prefixo, superv_campo, processo_equipe, base')
        .in('descr_situacao', ['ATIVO', 'RESERVA']).order('colaborador')
      if (prefixosRestritos) query = query.in('prefixo', prefixosRestritos)

      const { data: todosElet } = await query
      const listaBaseOriginal = todosElet || []
      const idsListaOriginal = new Set(listaBaseOriginal.map(e => String(e.id)))
      const listaComRemanejados = [
        ...remanejadosComDestino.filter(e => !idsListaOriginal.has(String(e.id))),
        ...listaBaseOriginal.map(e => remanejadosPorId.get(String(e.id)) || e),
      ]
      const listaBase = aplicarTrocasPendentes(listaComRemanejados)
      setTotalPessoalBase(listaBase.length)
      setTodosEletricistasBase(listaBase)
      const disponiveis = listaBase.filter(e => !idsRegistrados.has(e.id))
      setTodosEletricistas(disponiveis)

      const prefixosUnicos = [...new Set(listaBase.map(e => e.prefixo).filter(Boolean))].sort()
      setPrefixos(prefixosUnicos)

      const { data: indispHoje } = await supabase.from('indisponibilidades')
        .select('id, eletricista_id, prefixo, tipo_indisponibilidade, motivo_id, observacao, motivos_indisponibilidade(descricao)')
        .eq('data', data)
      const registrosIndisp = indispHoje || []
      setIndispRegistradas(registrosIndisp)

      // Ausentes disponiveis para aba 3: remove quem ja teve indisponibilidade justificada.
      const idsComIndisp = new Set(registrosIndisp.map(r => r.eletricista_id))
      const idsAusentesArr = [...idsAusentes].filter(id => !idsComIndisp.has(id))
      if (idsAusentesArr.length > 0) {
        const { data: eletAusentes } = await supabase.from('estrutura_equipes')
          .select('id, id_eletricista, colaborador, matricula, prefixo').in('id', idsAusentesArr).order('colaborador')
        setAusentesHoje(eletAusentes || [])
      } else {
        setAusentesHoje([])
      }

    } catch (e) {
      setErro('Erro ao carregar dados: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [data, supervisorCampo, isSupervisor, aplicarTrocasPendentes, estruturaCarregada, prefixosPermitidos])

  useEffect(() => { carregar() }, [carregar])

  const aplicarFiltroEletricista = useCallback((lista) => {
    let filtrada = filtros.filtrar(lista)
    if (filtroEletId) filtrada = filtrada.filter(e => String(e.id) === filtroEletId)
    return filtrada
  }, [filtros, filtroEletId])

  // ── Lista filtrada pelos filtros do PainelFiltros + eletricista ───────────
  const eletricistas = useMemo(() => aplicarFiltroEletricista(todosEletricistas), [todosEletricistas, aplicarFiltroEletricista])

  const eletricistasBaseFiltrados = useMemo(() =>
    aplicarFiltroEletricista(todosEletricistasBase),
    [todosEletricistasBase, aplicarFiltroEletricista]
  )

  // Opções de eletricista para o dropdown do filtro
  const opcoesEletricista = useMemo(() =>
    filtros.filtrar(todosEletricistas).map(e => ({ id: String(e.id), label: e.colaborador, sub: e.prefixo })),
    [todosEletricistas, filtros]
  )

  // Opções de eletricista para os cards: permite escolher alguem de outro prefixo.
  // Se isso acontecer, o card original recebe o eletricista que saiu daqui.
  const opcoesTodosElet = useMemo(() =>
    todosEletricistas.map(e => ({ value: String(e.id), label: e.colaborador, sub: e.prefixo })),
    [todosEletricistas]
  )

  const contadoresFiltrados = useMemo(() => {
    const idsBase = new Set(eletricistasBaseFiltrados.map(e => e.id))
    return {
      presentes: idsRegistroDia.presentes.filter(id => idsBase.has(id)).length,
      ausentes: idsRegistroDia.ausentes.filter(id => idsBase.has(id)).length,
    }
  }, [eletricistasBaseFiltrados, idsRegistroDia])

  // Contadores do painel (baseados na lista filtrada atual + registros na tela)
  const totalPrefixosFiltrados = useMemo(() =>
    [...new Set(eletricistasBaseFiltrados.map(e => e.prefixo).filter(Boolean))].length,
    [eletricistasBaseFiltrados]
  )
  const totalNomesFiltrados = eletricistasBaseFiltrados.length || totalPessoalBase || eletricistas.length
  const marcadosPresentes   = Object.values(registros).filter(r => r.status === 'presente').length
  const marcadosAusentes    = Object.values(registros).filter(r => r.status === 'ausente').length
  const totalMarcados = marcadosPresentes + marcadosAusentes
  const faltamJustificar    = Math.max(totalNomesFiltrados - contadoresFiltrados.presentes - contadoresFiltrados.ausentes - totalMarcados, 0)

  const trocarEletricistaCard = (cardKey, novoEletId) =>
    setRegistros(prev => {
      const atual = { ...prev[cardKey], eletId: prev[cardKey]?.eletId || cardKey }
      const eletTroca = todosEletricistasBase.find(e => String(e.id) === String(novoEletId)) ||
        todosEletricistas.find(e => String(e.id) === String(novoEletId))
      const chaveTroca = Object.keys(prev).find(key => key !== cardKey && prev[key]?.eletId === novoEletId) ||
        (eletTroca ? String(eletTroca.id) : null)

      if (!chaveTroca || chaveTroca === cardKey) return { ...prev, [cardKey]: { ...atual, eletId: novoEletId } }

      const registroTroca = prev[chaveTroca] || {}
      const proximoRegistroTroca = {
        ...registroTroca,
        eletId: atual.eletId,
        prefixo: registroTroca.prefixo || eletTroca?.prefixo || '',
      }

      if (!registroTroca.status) {
        delete proximoRegistroTroca.status
        delete proximoRegistroTroca.motivo_id
        delete proximoRegistroTroca.obs
      } else if (registroTroca.status === 'ausente') {
        proximoRegistroTroca.motivo_id = registroTroca.motivo_id || ''
      }

      return {
        ...prev,
        [cardKey]: { ...atual, eletId: novoEletId },
        [chaveTroca]: proximoRegistroTroca,
      }
    })

  // ── Atualiza um campo de um card ──────────────────────────────────────────
  const upd = (cardKey, campo, valor) =>
    setRegistros(prev => ({ ...prev, [cardKey]: { ...prev[cardKey], [campo]: valor } }))

  // Ao marcar status, inicializa o registro com o eletricista original do card
  const setStatus = (cardKey, status, elet) =>
    setRegistros(prev => ({
      ...prev,
      [cardKey]: {
        ...prev[cardKey],
        status,
        // eletId pode ser trocado pelo usuário; por padrão é o original
        eletId:  prev[cardKey]?.eletId  || String(elet.id),
        prefixo: prev[cardKey]?.prefixo || elet.prefixo || '',
      },
    }))

  // ─── Salvar Frequência ────────────────────────────────────────────────────
  const salvarFrequencia = async () => {
    const marcados = Object.entries(registros).filter(([, r]) => r.status)
    if (!marcados.length) { setErro('Nenhum eletricista marcado.'); return }
    if (marcados.some(([, r]) => r.status === 'presente' && !r.prefixo))    { setErro('Selecione o prefixo para todos os Presentes.'); return }
    if (marcados.some(([, r]) => r.status === 'ausente'  && !r.motivo_id))  { setErro('Selecione o motivo para todos os Ausentes.'); return }
    if (marcados.some(([, r]) => !r.eletId))                                { setErro('Selecione o eletricista para todos os registros.'); return }

    const buscarEletricistaRegistro = (id) =>
      todosEletricistasBase.find(e => String(e.id) === String(id)) ||
      todosEletricistas.find(e => String(e.id) === String(id))

    if (marcados.some(([, r]) => !buscarEletricistaRegistro(r.eletId)?.id_eletricista)) {
      setErro('ID permanente do eletricista não encontrado. Recarregue a estrutura antes de salvar.')
      return
    }

    setSalvando(true); setErro(''); setSucesso('')
    try {
      const motivoPresente = motivos.find(m => m.descricao.toUpperCase() === 'PRESENTE')
      if (!motivoPresente) throw new Error('Motivo "PRESENTE" não encontrado.')

      const motivoIdsSalvar = [...new Set(marcados.map(([, r]) =>
        r.status === 'presente' ? Number(motivoPresente.id) : Number(r.motivo_id)
      ).filter(Boolean))]

      const { data: motivosSalvar, error: erroMotivosSalvar } = await supabase
        .from('motivos_indisponibilidade')
        .select('id, descricao')
        .in('id', motivoIdsSalvar)
      if (erroMotivosSalvar) throw erroMotivosSalvar

      const descricaoPorMotivo = new Map((motivosSalvar || []).map(m => [String(m.id), m.descricao]))

      const linhas = marcados.map(([, r]) => {
        const isP = r.status === 'presente'
        const eletRegistro = buscarEletricistaRegistro(r.eletId)
        const motivoId = isP ? Number(motivoPresente.id) : Number(r.motivo_id)
        const descricaoMotivo = descricaoPorMotivo.get(String(motivoId)) || null

        return {
          eletricista_id:       Number(r.eletId),
          id_eletricista:       eletRegistro.id_eletricista,
          matricula:            eletRegistro.matricula || null,
          colaborador:          eletRegistro.colaborador || null,
          superv_campo:         eletRegistro.superv_campo || null,
          processo_equipe:      eletRegistro.processo_equipe || null,
          prefixo:              r.prefixo || '',
          data,
          supervisor_registro:  supervisorCampo || 'Administrador',
          usuario_registro:     usuarioLogado?.login || 'admin',
          id_indisponibilidade: motivoId,
          descricao_motivo_indisponibilidade: descricaoMotivo,
          observacoes:          r.obs || null,
        }
      })

      const trocasParaPersistir = {}
      marcados.forEach(([cardKey, r]) => {
        if (!r.eletId || String(r.eletId) === String(cardKey)) return
        const eletSelecionado = todosEletricistasBase.find(e => String(e.id) === String(r.eletId)) ||
          todosEletricistas.find(e => String(e.id) === String(r.eletId))
        if (eletSelecionado?.prefixo) trocasParaPersistir[String(cardKey)] = eletSelecionado.prefixo
      })

      let { error } = await supabase.from('equipes_dia').upsert(linhas, { onConflict: 'eletricista_id,data' })

      // Mantem o salvamento funcionando caso o deploy do app chegue antes da migracao SQL.
      // Depois que as colunas existirem, o upsert completo acima grava o snapshot normalmente.
      if (error && /column .* does not exist/i.test(error.message || '')) {
        const linhasCompat = linhas.map(({
          matricula, colaborador, superv_campo, processo_equipe,
          descricao_motivo_indisponibilidade, ...linha
        }) => linha)
        ;({ error } = await supabase.from('equipes_dia').upsert(linhasCompat, { onConflict: 'eletricista_id,data' }))
      }

      if (error) throw error

      const trocasAtualizadas = { ...lerTrocasPendentes(), ...trocasParaPersistir }
      linhas.forEach(l => { delete trocasAtualizadas[String(l.eletricista_id)] })
      gravarTrocasPendentes(trocasAtualizadas)

      const presentesSalvos = linhas.filter(l => l.id_indisponibilidade === motivoPresente.id).length
      const ausentesSalvos = linhas.length - presentesSalvos
      setSucesso(`✅ ${presentesSalvos} presente(s) e ${ausentesSalvos} ausente(s) registrado(s)!`)
      await carregar()
    } catch (e) { setErro('Erro ao salvar: ' + e.message) }
    finally { setSalvando(false) }
  }

  // ─── Remanejamento ────────────────────────────────────────────────────────
  const buscarRemanejamento = async (texto) => {
    setBuscaReman(texto)
    setColaboradorRemanSelecionado(null)
    const termo = texto.trim()
    if (termo.length < 3) { setResultadosReman([]); return }

    setBuscandoReman(true)
    setErro('')
    try {
      const { data: jaReg, error: erroReg } = await supabase
        .from('equipes_dia')
        .select('eletricista_id, id_eletricista')
        .eq('data', data)
      if (erroReg) throw erroReg

      let queryRemanejados = supabase.from('remanejamentos').select('eletricista_id').eq('data', data)
      if (isSupervisor && supervisorCampo) queryRemanejados = queryRemanejados.eq('supervisor_destino', supervisorCampo)
      const { data: jaRemanejados, error: erroJaRemanejados } = await queryRemanejados
      if (erroJaRemanejados) throw erroJaRemanejados

      const idsEstruturaRegistrados = new Set((jaReg || []).map(r => r.eletricista_id).filter(Boolean))
      const idsPermanentesRegistrados = new Set((jaReg || []).map(r => r.id_eletricista).filter(Boolean))
      const idsJaRemanejados = new Set((jaRemanejados || []).map(r => r.eletricista_id).filter(Boolean))

      const { data: res, error: erroBusca } = await supabase.from('estrutura_equipes')
        .select('id, id_eletricista, colaborador, matricula, prefixo, superv_campo, processo_equipe, base')
        .ilike('colaborador', `%${termo}%`)
        .in('descr_situacao', ['ATIVO', 'RESERVA'])
        .order('colaborador')
        .limit(20)
      if (erroBusca) throw erroBusca

      setResultadosReman((res || []).filter(e =>
        !idsEstruturaRegistrados.has(e.id) &&
        !idsJaRemanejados.has(e.id) &&
        (!e.id_eletricista || !idsPermanentesRegistrados.has(e.id_eletricista))
      ))
    } catch (e) {
      setResultadosReman([])
      setErro('Erro ao buscar colaboradores: ' + e.message)
    } finally {
      setBuscandoReman(false)
    }
  }

  const selecionarRemanejamento = (elet) => {
    setColaboradorRemanSelecionado(elet)
    setResultadosReman([])
    setBuscaReman(elet.colaborador)
    setErro('')
    setSucesso('')
  }

  const cancelarRemanejamento = () => {
    setColaboradorRemanSelecionado(null)
    setResultadosReman([])
    setBuscaReman('')
    setErro('')
  }

  const salvarRemanejamento = async () => {
    if (!colaboradorRemanSelecionado) { setErro('Selecione um colaborador para remanejar.'); return }

    setSalvando(true)
    setErro('')
    setSucesso('')
    try {
      const elet = colaboradorRemanSelecionado
      const { error } = await supabase.from('remanejamentos').upsert({
        eletricista_id: elet.id,
        supervisor_origem: elet.superv_campo,
        supervisor_destino: supervisorCampo || 'Administrador',
        data,
        temporario: true,
        usuario_registro: usuarioLogado?.login || 'admin',
      }, { onConflict: 'eletricista_id,data' })
      if (error) throw error

      await carregar()
      setSucesso(`✅ ${elet.colaborador} remanejado e liberado na frequência de pessoal.`)
    } catch (e) { setErro('Erro no remanejamento: ' + e.message) }
    finally { setSalvando(false) }
  }

  // ─── Indisponibilidade ────────────────────────────────────────────────────
  const onEletristaIndispChange = (eletristaId) => {
    const elet = ausentesHoje.find(e => String(e.id) === String(eletristaId))
    setFormIndisp(f => ({ ...f, eletricista_id: eletristaId, prefixo: elet?.prefixo || '' }))
  }

  const salvarIndisponibilidade = async () => {
    if (!formIndisp.eletricista_id) { setErro('Selecione um eletricista.'); return }
    if (!formIndisp.motivo_id)      { setErro('Selecione o motivo.'); return }
    if (!formIndisp.prefixo)        { setErro('Informe o prefixo da equipe.'); return }
    setSalvandoIndisp(true); setErro(''); setSucesso('')
    try {
      const elet = ausentesHoje.find(e => String(e.id) === String(formIndisp.eletricista_id))
      const { error } = await supabase.from('indisponibilidades').upsert({
        data, eletricista_id: Number(formIndisp.eletricista_id),
        matricula: elet?.matricula || null, prefixo: formIndisp.prefixo,
        tipo_indisponibilidade: formIndisp.tipo, motivo_id: Number(formIndisp.motivo_id),
        observacao: formIndisp.obs || null, usuario_registro: usuarioLogado?.login || 'admin',
      }, { onConflict: 'eletricista_id,data' })
      if (error) throw error
      setSucesso(`✅ Indisponibilidade de ${elet?.colaborador} registrada!`)
      setFormIndisp({ eletricista_id: '', prefixo: '', tipo: 'total', motivo_id: '', obs: '' })
      await carregar()
    } catch (e) { setErro('Erro ao registrar: ' + e.message) }
    finally { setSalvandoIndisp(false) }
  }

  // ── Filtro de eletricista (dropdown com busca interna) ────────────────────
  const eletSelecionado = opcoesEletricista.find(o => o.id === filtroEletId)
  const opcoesFiltElet = opcoesEletricista.filter(o =>
    !buscaEletTexto || o.label.toLowerCase().includes(buscaEletTexto.toLowerCase())
  )

  const FiltroEletricista = (
    <div>
      <label style={LABEL_STYLE}>Eletricista</label>
      <div style={{ position: 'relative' }} ref={eletFiltroRef}>
        <button type="button" onClick={() => setBuscaEletAberta(a => !a)} style={{
          ...INPUT_STYLE, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', textAlign: 'left',
          color: eletSelecionado ? '#1e293b' : '#94a3b8',
          borderColor: buscaEletAberta ? '#3b82f6' : '#e2e8f0',
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: eletSelecionado ? 700 : 500, fontSize: 13 }}>
            {eletSelecionado ? eletSelecionado.label : 'Todos'}
          </span>
          <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 8, flexShrink: 0 }}>▼</span>
        </button>
        {buscaEletAberta && (
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200, background: '#fff', border: '1.5px solid #bfdbfe', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', maxHeight: 300, overflowY: 'auto' }}>
            <div style={{ padding: 8, borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, background: '#fff' }}>
              <input type="text" autoFocus placeholder="Buscar..." value={buscaEletTexto}
                onChange={e => setBuscaEletTexto(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, outline: 'none', boxSizing: 'border-box' }} />
              {filtroEletId && (
                <button type="button" onClick={() => { setFiltroEletId(''); setBuscaEletTexto(''); setBuscaEletAberta(false) }} style={{
                  marginTop: 6, width: '100%', padding: '4px 8px', fontSize: 11, fontWeight: 700,
                  color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer',
                }}>✕ Limpar seleção</button>
              )}
            </div>
            {opcoesFiltElet.length === 0
              ? <p style={{ padding: 14, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Nenhum resultado</p>
              : opcoesFiltElet.map(o => (
                <button key={o.id} type="button"
                  onClick={() => { setFiltroEletId(o.id); setBuscaEletAberta(false); setBuscaEletTexto('') }}
                  style={{ display: 'block', width: '100%', padding: '9px 12px', background: o.id === filtroEletId ? '#eff6ff' : 'none', border: 'none', borderBottom: '1px solid #f8fafc', textAlign: 'left', cursor: 'pointer' }}>
                  <p style={{ fontSize: 12, fontWeight: o.id === filtroEletId ? 700 : 500, color: '#1e293b', margin: 0 }}>{o.label}</p>
                  <p style={{ fontSize: 10, color: '#64748b', fontFamily: '"Courier New", monospace', margin: 0 }}>{o.sub}</p>
                </button>
              ))
            }
          </div>
        )}
      </div>
    </div>
  )

  // ── Painel de contadores (reativo à aba ativa) ───────────────────────────
  // Frequência: mostra eletricistas | Indisponível: mostra prefixos
  const totalPrefixosIndisp = useMemo(() =>
    [...new Set(indispRegistradas.map(r => r.prefixo).filter(Boolean))].length,
    [indispRegistradas]
  )
  const totalPrefixosIndispFiltrados = totalPrefixosFiltrados || prefixos.length
  const faltamPrefixosJustificar = Math.max(totalPrefixosIndispFiltrados - totalPrefixosIndisp, 0)

  const itensContadores = abaAtiva === 'indisponivel'
    ? [
        { label: 'Prefixos na lista',          val: totalPrefixosIndispFiltrados, cor: '#2563eb', bg: '#eff6ff' },
        { label: 'Prefixos indisponíveis',     val: totalPrefixosIndisp,          cor: '#dc2626', bg: '#fef2f2' },
        { label: 'Registros no dia',           val: indispRegistradas.length,     cor: '#7c3aed', bg: '#f5f3ff' },
        { label: 'Faltam prefixos justificar', val: faltamPrefixosJustificar,     cor: '#d97706', bg: '#fef3c7' },
      ]
    : [
        { label: 'Prefixos na lista',  val: totalPrefixosFiltrados, cor: '#2563eb', bg: '#eff6ff' },
        { label: 'Eletricistas',       val: totalNomesFiltrados,    cor: '#7c3aed', bg: '#f5f3ff' },
        { label: 'Presentes hoje',     val: contadoresFiltrados.presentes,   cor: '#16a34a', bg: '#f0fdf4' },
        { label: 'Ausentes hoje',      val: contadoresFiltrados.ausentes,    cor: '#dc2626', bg: '#fef2f2' },
        { label: 'Faltam justificar',  val: faltamJustificar,       cor: '#d97706', bg: '#fef3c7' },
      ]

  const PainelContadores = (
    <div style={{
      background: '#fff', borderRadius: 14, border: '1.5px solid #e2e8f0',
      padding: '12px 18px', marginBottom: 16,
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10,
    }}>
      {itensContadores.map(({ label, val, cor, bg }) => (
        <div key={label} style={{ background: bg, borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
          <p style={{ fontSize: 22, fontWeight: 900, color: cor, margin: 0 }}>{val}</p>
          <p style={{ fontSize: 10, color: '#64748b', fontWeight: 700, margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</p>
        </div>
      ))}
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>

      {/* ── Header ── */}
      <div style={{ background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', padding: '18px 20px', color: '#fff' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14,
          }}>← Voltar para Home</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800 }}>📋 Registrar Indisponibilidade</h1>
              <p style={{ fontSize: 12, opacity: 0.8, marginTop: 3 }}>
                {isSupervisor ? `Supervisor: ${supervisorCampo}` : 'Administrador — todas as equipes'}
              </p>
            </div>
            {/* Data no header */}
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>📅 Data:</span>
              <input
                type="date" value={data}
                onChange={e => setData(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)',
                  color: '#fff', borderRadius: 8, padding: '5px 10px', fontSize: 13, fontWeight: 700,
                  outline: 'none', cursor: 'pointer',
                }}
              />
              {data === hoje
                ? <span style={{ fontSize: 10, background: '#16a34a', color: '#fff', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>HOJE</span>
                : <span style={{ fontSize: 10, background: '#d97706', color: '#fff', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>RETROATIVA</span>
              }
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px 16px 80px' }}>

        {/* ── PainelFiltros: Sup. Operacional + Sup. Campo + Prefixo + Eletricista ── */}
        <PainelFiltros
          filtros={filtros}
          titulo="🔍 Filtros do Registro"
          badge="supervisor · prefixo · eletricista"
          mostrarMesPeriodo={false}
          extras={FiltroEletricista}
        />

        {/* ── Painel de contadores ── */}
        {PainelContadores}

        {/* ── Abas ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { id: 'frequencia',    emoji: '📋', label: 'Frequência de Pessoal' },
            { id: 'remanejamento', emoji: '🔄', label: 'Remanejar Colaborador' },
            { id: 'indisponivel',  emoji: '⚠️', label: 'Indisponível' },
          ].map(aba => (
            <button key={aba.id} onClick={() => { setAbaAtiva(aba.id); setErro(''); setSucesso('') }} style={{
              padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
              background: abaAtiva === aba.id ? '#1e3a5f' : '#e2e8f0',
              color:      abaAtiva === aba.id ? '#fff'    : '#374151',
            }}>{aba.emoji} {aba.label}</button>
          ))}
        </div>

        {/* ── Alertas ── */}
        {erro && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 14, fontSize: 13, color: '#b91c1c', fontWeight: 600 }}>
            ❌ {erro}
            <button onClick={() => setErro('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: 16 }}>×</button>
          </div>
        )}
        {sucesso && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', marginBottom: 14, fontSize: 13, color: '#15803d', fontWeight: 600 }}>
            {sucesso}
            <button onClick={() => setSucesso('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#15803d', fontSize: 16 }}>×</button>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            ABA 1: FREQUÊNCIA
        ══════════════════════════════════════════════ */}
        {abaAtiva === 'frequencia' && (
          <>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>⏳ Carregando eletricistas...</div>
            ) : eletricistas.length === 0 ? (
              <div style={{ background: '#f0fdf4', borderRadius: 14, border: '1px solid #86efac', padding: 30, textAlign: 'center', color: '#15803d' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                <p style={{ fontWeight: 700 }}>
                  {filtros.temFiltrosAtivos || filtroEletId
                    ? 'Nenhum eletricista encontrado para os filtros selecionados.'
                    : 'Todos os eletricistas já foram registrados para esta data!'}
                </p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                  {eletricistas.map(elet => {
                    const cardKey    = String(elet.id)
                    const reg        = registros[cardKey] || {}
                    const isPresente = reg.status === 'presente'
                    const isAusente  = reg.status === 'ausente'

                    // Eletricista atual do card (pode ter sido trocado)
                    const eletAtualBase = reg.eletId
                      ? (todosEletricistasBase.find(e => String(e.id) === reg.eletId) || todosEletricistas.find(e => String(e.id) === reg.eletId) || elet)
                      : elet
                    const eletAtual = reg.prefixo ? { ...eletAtualBase, prefixo: reg.prefixo } : eletAtualBase

                    let cardBg = '#fff', cardBorder = '#e2e8f0'
                    if (isPresente) { cardBg = '#f0fdf4'; cardBorder = '#16a34a' }
                    if (isAusente)  { cardBg = '#fef2f2'; cardBorder = '#dc2626' }

                    return (
                      <div key={cardKey} style={{ background: cardBg, borderRadius: 14, border: `2px solid ${cardBorder}`, padding: '14px 16px', transition: 'all 0.2s' }}>

                        {/* ── Linha superior: ícone + nome + botões ── */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                              background: isPresente ? '#16a34a' : isAusente ? '#dc2626' : '#e2e8f0',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 16, color: (isPresente || isAusente) ? '#fff' : '#64748b',
                            }}>
                              {isPresente ? '✓' : isAusente ? '✗' : '?'}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{eletAtual.colaborador}</p>
                              <p style={{ fontSize: 11, color: '#64748b' }}>Mat: {eletAtual.matricula} · {eletAtual.prefixo || '—'} · {eletAtual.base || elet.base || '—'}</p>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                            <button onClick={() => setStatus(cardKey, isPresente ? null : 'presente', elet)} style={{
                              padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                              border: '2px solid #16a34a', background: isPresente ? '#16a34a' : '#fff', color: isPresente ? '#fff' : '#16a34a',
                            }}>✓ Presente</button>
                            <button onClick={() => setStatus(cardKey, isAusente ? null : 'ausente', elet)} style={{
                              padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                              border: '2px solid #dc2626', background: isAusente ? '#dc2626' : '#fff', color: isAusente ? '#fff' : '#dc2626',
                            }}>✗ Ausente</button>
                          </div>
                        </div>

                        {/* ── Campos após marcar PRESENTE ── */}
                        {isPresente && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px solid #bbf7d0' }}>
                            {/* Trocar eletricista */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: 11 }}>Eletricista *</label>
                              <AutocompleteCard
                                value={reg.eletId || String(elet.id)}
                                valorDisplay={eletAtual.colaborador}
                                onChange={v => trocarEletricistaCard(cardKey, v)}
                                opcoes={opcoesTodosElet}
                                placeholder="Trocar eletricista..."
                                renderOpcao={o => (
                                  <div>
                                    <p style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', margin: 0 }}>{o.label}</p>
                                    <p style={{ fontSize: 10, color: '#64748b', fontFamily: '"Courier New", monospace', margin: 0 }}>{o.sub}</p>
                                  </div>
                                )}
                              />
                            </div>
                            {/* Trocar prefixo */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: 11 }}>Prefixo da Equipe *</label>
                              <AutocompleteCard
                                value={reg.prefixo || elet.prefixo || ''}
                                onChange={v => upd(cardKey, 'prefixo', v)}
                                opcoes={prefixos}
                                placeholder="Trocar prefixo..."
                              />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: 11 }}>Observação (opcional)</label>
                              <input className="form-input" value={reg.obs || ''} onChange={e => upd(cardKey, 'obs', e.target.value)} placeholder="Ex: equipe extra" />
                            </div>
                          </div>
                        )}

                        {/* ── Campos após marcar AUSENTE ── */}
                        {isAusente && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px solid #fecaca' }}>
                            {/* Trocar eletricista */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: 11 }}>Eletricista *</label>
                              <AutocompleteCard
                                value={reg.eletId || String(elet.id)}
                                valorDisplay={eletAtual.colaborador}
                                onChange={v => trocarEletricistaCard(cardKey, v)}
                                opcoes={opcoesTodosElet}
                                placeholder="Trocar eletricista..."
                                renderOpcao={o => (
                                  <div>
                                    <p style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', margin: 0 }}>{o.label}</p>
                                    <p style={{ fontSize: 10, color: '#64748b', fontFamily: '"Courier New", monospace', margin: 0 }}>{o.sub}</p>
                                  </div>
                                )}
                              />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: 11 }}>Motivo da Ausência *</label>
                              <select className="form-input" value={reg.motivo_id || ''} onChange={e => upd(cardKey, 'motivo_id', e.target.value)}>
                                <option value="">Selecione...</option>
                                {motivos.filter(m => m.descricao.toUpperCase() !== 'PRESENTE').map(m => (
                                  <option key={m.id} value={m.id}>{m.descricao}</option>
                                ))}
                              </select>
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: 11 }}>Observação (opcional)</label>
                              <input className="form-input" value={reg.obs || ''} onChange={e => upd(cardKey, 'obs', e.target.value)} placeholder="Detalhe se necessário" />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {totalMarcados > 0 && (
                  <div style={{
                    position: 'sticky', bottom: 16, background: '#fff', borderRadius: 14,
                    border: '1.5px solid #bfdbfe', padding: '14px 20px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                  }}>
                    <div style={{ display: 'flex', gap: 16 }}>
                      {marcadosPresentes > 0 && <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 700 }}>✅ {marcadosPresentes} presente(s)</span>}
                      {marcadosAusentes  > 0 && <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 700 }}>❌ {marcadosAusentes} ausente(s)</span>}
                    </div>
                    <button onClick={salvarFrequencia} disabled={salvando} className="btn-primary"
                      style={{ background: salvando ? '#64748b' : '#1e3a5f', minWidth: 160, marginBottom: 0 }}>
                      {salvando ? '⏳ Salvando...' : `💾 Salvar ${totalMarcados} Registro(s)`}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════
            ABA 2: REMANEJAMENTO
        ══════════════════════════════════════════════ */}
        {abaAtiva === 'remanejamento' && (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '20px' }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>🔄 Remanejar Colaborador</p>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>
              Selecione um colaborador ainda não contabilizado e confirme o salvamento para liberar na frequência de pessoal.
            </p>
            <div style={{ position: 'relative' }}>
              <label className="form-label">Buscar colaborador pelo nome</label>
              <input className="form-input" value={buscaReman} onChange={e => buscarRemanejamento(e.target.value)} placeholder="Digite ao menos 3 letras..." />
              {buscandoReman && <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>⏳ Buscando...</p>}
              {resultadosReman.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: '#fff', border: '1.5px solid #bfdbfe', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 300, overflowY: 'auto' }}>
                  {resultadosReman.map(e => (
                    <div key={e.id} style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{e.colaborador}</p>
                        <p style={{ fontSize: 11, color: '#64748b' }}>Mat: {e.matricula} · Sup: {e.superv_campo} · {e.prefixo || 'sem prefixo'}</p>
                      </div>
                      <button onClick={() => selecionarRemanejamento(e)} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#1e3a5f', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                        Adicionar
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {buscaReman.length >= 3 && !buscandoReman && resultadosReman.length === 0 && !colaboradorRemanSelecionado && (
                <p style={{ fontSize: 12, color: '#dc2626', marginTop: 6, fontWeight: 600 }}>❌ Nenhum colaborador disponível encontrado.</p>
              )}
            </div>

            {colaboradorRemanSelecionado && (
              <div style={{ marginTop: 14, border: '1.5px solid #bfdbfe', borderRadius: 12, padding: '14px 16px', background: '#eff6ff' }}>
                <p style={{ fontSize: 12, color: '#1e40af', fontWeight: 800, marginBottom: 8 }}>Colaborador selecionado para remanejamento</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', margin: 0 }}>{colaboradorRemanSelecionado.colaborador}</p>
                    <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>Mat: {colaboradorRemanSelecionado.matricula} · Origem: {colaboradorRemanSelecionado.superv_campo || '—'} · {colaboradorRemanSelecionado.prefixo || 'sem prefixo'}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={cancelarRemanejamento} disabled={salvando} style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid #cbd5e1', cursor: salvando ? 'not-allowed' : 'pointer', background: '#fff', color: '#475569', fontSize: 12, fontWeight: 800 }}>
                      Cancelar
                    </button>
                    <button onClick={salvarRemanejamento} disabled={salvando} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', cursor: salvando ? 'not-allowed' : 'pointer', background: salvando ? '#64748b' : '#16a34a', color: '#fff', fontSize: 12, fontWeight: 800 }}>
                      {salvando ? 'Salvando...' : 'Salvar Remanejamento'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginTop: 18, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 10 }}>Histórico de Remanejamento do Dia ({remanejamentosDia.length})</p>
              {remanejamentosDia.length === 0 ? (
                <p style={{ fontSize: 12, color: '#94a3b8', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10, padding: '12px 14px', margin: 0 }}>
                  Nenhum colaborador remanejado para esta data.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {remanejamentosDia.map(r => (
                    <div key={r.id || String(r.eletricista_id) + '-' + r.data} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', margin: 0 }}>{r.colaborador}</p>
                        <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>Mat: {r.matricula || '—'} · {r.prefixo || 'sem prefixo'} · Origem: {r.supervisor_origem || '—'} → Destino: {r.supervisor_destino || '—'}</p>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#1e40af', background: '#dbeafe', borderRadius: 999, padding: '4px 8px', alignSelf: 'center' }}>
                        {r.temporario ? 'Temporário' : 'Fixo'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            ABA 3: INDISPONÍVEL
        ══════════════════════════════════════════════ */}
        {abaAtiva === 'indisponivel' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #fed7aa', padding: '20px' }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#9a3412', marginBottom: 4 }}>⚠️ Registrar Indisponibilidade de Equipe</p>
              <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>
                Selecione um eletricista <strong>ausente</strong> e registre qual equipe/prefixo ficou parado.
              </p>
              {ausentesHoje.length === 0 ? (
                <div style={{ background: '#f8fafc', borderRadius: 10, padding: '20px', textAlign: 'center', color: '#64748b' }}>
                  <p style={{ fontWeight: 700 }}>Nenhum eletricista ausente registrado para esta data.</p>
                  <p style={{ fontSize: 12, marginTop: 6 }}>Registre as ausências na aba "Frequência de Pessoal" primeiro.</p>
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label">Eletricista *</label>
                    <select className="form-input" value={formIndisp.eletricista_id} onChange={e => onEletristaIndispChange(e.target.value)}>
                      <option value="">— Selecione o eletricista ausente —</option>
                      {ausentesHoje.map(e => <option key={e.id} value={e.id}>{e.colaborador} (Mat: {e.matricula})</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Prefixo da Equipe * <span style={{ fontSize: 10, color: '#64748b', fontWeight: 400, marginLeft: 6 }}>preenchido automaticamente — editável</span></label>
                    <AutocompleteCard value={formIndisp.prefixo} onChange={v => setFormIndisp(f => ({ ...f, prefixo: v }))} opcoes={prefixos} placeholder="Trocar prefixo..." />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="form-group">
                      <label className="form-label">Tipo de Indisponibilidade *</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {[{ val: 'parcial', label: '⏱ Parcial', sub: 'Apenas um turno' }, { val: 'total', label: '🚫 Total', sub: 'O dia inteiro' }].map(t => (
                          <button key={t.val} onClick={() => setFormIndisp(f => ({ ...f, tipo: t.val }))} style={{
                            flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                            border: `2px solid ${formIndisp.tipo === t.val ? '#1e3a5f' : '#e2e8f0'}`,
                            background: formIndisp.tipo === t.val ? '#eff6ff' : '#fff', textAlign: 'center',
                          }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: formIndisp.tipo === t.val ? '#1e3a5f' : '#374151' }}>{t.label}</p>
                            <p style={{ fontSize: 10, color: '#64748b' }}>{t.sub}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Motivo *</label>
                      <select className="form-input" value={formIndisp.motivo_id} onChange={e => setFormIndisp(f => ({ ...f, motivo_id: e.target.value }))}>
                        <option value="">— Selecione —</option>
                        {motivos.filter(m => m.descricao.toUpperCase() !== 'PRESENTE').map(m => <option key={m.id} value={m.id}>{m.descricao}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Observações (opcional)</label>
                    <textarea className="form-textarea" rows={3} value={formIndisp.obs} onChange={e => setFormIndisp(f => ({ ...f, obs: e.target.value }))} placeholder="Informações adicionais..." />
                  </div>
                  <button onClick={salvarIndisponibilidade} disabled={salvandoIndisp} className="btn-primary" style={{ background: salvandoIndisp ? '#64748b' : '#c2410c' }}>
                    {salvandoIndisp ? '⏳ Salvando...' : '⚠️ Registrar Indisponibilidade'}
                  </button>
                </>
              )}
            </div>
            {indispRegistradas.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '20px' }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 14 }}>📋 Registradas nesta data ({indispRegistradas.length})</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {indispRegistradas.map(r => {
                    const elet = ausentesHoje.find(e => e.id === r.eletricista_id)
                    return (
                      <div key={r.id} style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 700, color: '#9a3412' }}>{elet?.colaborador || `Eletricista #${r.eletricista_id}`}</p>
                            <p style={{ fontSize: 11, color: '#64748b' }}>Prefixo: {r.prefixo} · {r.tipo_indisponibilidade?.toUpperCase()} · {r.motivos_indisponibilidade?.descricao || '—'}</p>
                            {r.observacao && <p style={{ fontSize: 11, color: '#92400e', marginTop: 2 }}>💬 {r.observacao}</p>}
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, alignSelf: 'flex-start', background: r.tipo_indisponibilidade === 'total' ? '#fee2e2' : '#fef3c7', color: r.tipo_indisponibilidade === 'total' ? '#dc2626' : '#d97706' }}>
                            {r.tipo_indisponibilidade?.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
