import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { isAdmin, temPermissao } from '../lib/auth.js'

const hojeISO = () => new Date().toISOString().slice(0, 10)
const agoraISO = () => new Date().toISOString()
const horaAtual = () => new Date().toTimeString().slice(0, 5)

const STATUS = {
  PENDENTE:      { label: 'Pendente',      bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
  ATRASADA:      { label: 'Atrasada',      bg: '#fee2e2', color: '#b91c1c', border: '#fecaca' },
  EM_ANDAMENTO:  { label: 'Em andamento',  bg: '#dbeafe', color: '#1d4ed8', border: '#bfdbfe' },
  CONCLUIDA:     { label: 'Concluída',     bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' },
  CANCELADA:     { label: 'Cancelada',     bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
}

const PRIORIDADES = ['BAIXA', 'NORMAL', 'ALTA', 'CRITICA']
const PERFIS_DESTINO = ['', 'SUPERV. OPERAÇÃO', 'COORD. OPERAÇÃO', 'SUPERV. CAMPO', 'ANALISTA', 'ASSISTENTE']
const RECORRENCIAS = [
  { valor: 'DIARIA', label: 'Diária' },
  { valor: 'SEMANAL', label: 'Semanal' },
  { valor: 'MENSAL', label: 'Mensal' },
]
const DIAS_SEMANA = [
  { valor: 0, label: 'Domingo', alerta: 'todo domingo' },
  { valor: 1, label: 'Segunda-feira', alerta: 'toda segunda-feira' },
  { valor: 2, label: 'Terça-feira', alerta: 'toda terça-feira' },
  { valor: 3, label: 'Quarta-feira', alerta: 'toda quarta-feira' },
  { valor: 4, label: 'Quinta-feira', alerta: 'toda quinta-feira' },
  { valor: 5, label: 'Sexta-feira', alerta: 'toda sexta-feira' },
  { valor: 6, label: 'Sábado', alerta: 'todo sábado' },
]
const DIAS_MES = Array.from({ length: 31 }, (_, i) => i + 1)

const modeloVazio = {
  titulo: '',
  descricao: '',
  ordem_execucao: '',
  horario_previsto: '08:00',
  horario_final: '',
  prioridade: 'NORMAL',
  recorrencia: 'DIARIA',
  dia_semana: '',
  dia_mes: '',
  precisa_ciencia: false,
  responsavel_login: '',
  perfil_responsavel: '',
}

const acaoVazia = {
  titulo: '',
  descricao: '',
  prefixo: '',
  supervisor_campo: '',
  eletricista: '',
}

function normalizar(valor) {
  return (valor || '').toString().trim().toUpperCase()
}

function unicos(lista) {
  return [...new Set(lista.map(v => (v || '').toString().trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

function usuarioNome(usuario) {
  return usuario?.nome || usuario?.login || 'Usuário'
}

function dentroDoEscopo(item, usuario, acessoGeral) {
  if (acessoGeral) return true
  const login = (usuario?.login || '').toLowerCase()
  const perfil = normalizar(usuario?.perfil)
  const responsavel = (item.responsavel_login || '').toLowerCase()
  const perfilResp = normalizar(item.perfil_responsavel)
  if (!responsavel && !perfilResp) return true
  if (responsavel && responsavel === login) return true
  if (perfilResp && perfilResp === perfil) return true
  return false
}

function statusVisual(rotina) {
  if (!rotina) return 'PENDENTE'
  if (rotina.status !== 'PENDENTE') return rotina.status
  if (!rotina.horario_previsto) return rotina.status
  if (rotina.data_execucao < hojeISO()) return 'ATRASADA'
  if (rotina.data_execucao > hojeISO()) return rotina.status
  return rotina.horario_previsto.slice(0, 5) < horaAtual() ? 'ATRASADA' : rotina.status
}

function statusMeta(rotina) {
  return STATUS[statusVisual(rotina)] || STATUS.PENDENTE
}

function fmtData(data) {
  if (!data) return ''
  const [ano, mes, dia] = data.split('-')
  return dia + '/' + mes + '/' + ano
}

function fmtHora(valor) {
  return (valor || '').slice(0, 5)
}

function intervaloHora(item) {
  const inicial = fmtHora(item?.horario_previsto)
  const final = fmtHora(item?.horario_final)
  if (inicial && final) return `${inicial} - ${final}`
  return inicial || final || ''
}

function numeroOuNulo(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : null
}

function valorRecorrenciaOuPadrao(valor, padrao) {
  return valor === null || valor === undefined || valor === '' ? String(padrao) : String(valor)
}

function ordemRotina(rotina) {
  const ordem = numeroOuNulo(rotina?.ordem_execucao)
  return ordem === null ? Number.MAX_SAFE_INTEGER : ordem
}

function rotuloOrdem(rotina) {
  const ordem = numeroOuNulo(rotina?.ordem_execucao)
  return ordem === null ? 'Sem ordem' : `Ordem ${ordem}`
}

function ordenarRotinas(lista) {
  return [...(lista || [])].sort((a, b) =>
    ordemRotina(a) - ordemRotina(b) ||
    fmtHora(a?.horario_previsto).localeCompare(fmtHora(b?.horario_previsto)) ||
    (a?.titulo_snapshot || a?.titulo || '').localeCompare(b?.titulo_snapshot || b?.titulo || '', 'pt-BR')
  )
}

function faixaHorariaRotinas(rotinas) {
  const horarios = rotinas
    .flatMap(r => [fmtHora(r?.horario_previsto), fmtHora(r?.horario_final)])
    .filter(Boolean)
    .sort()
  if (horarios.length === 0) return 'Sem horário'
  const inicio = horarios[0]
  const fim = horarios[horarios.length - 1]
  return inicio === fim ? inicio : inicio + ' às ' + fim
}

function agruparModelosPorResponsavel(lista) {
  const mapa = new Map()

  ordenarRotinas(lista).forEach(modelo => {
    const responsavel = (modelo?.responsavel_login || '').trim()
    const perfil = (modelo?.perfil_responsavel || '').trim()
    const chave = responsavel ? 'usuario:' + responsavel.toLowerCase() : perfil ? 'perfil:' + normalizar(perfil) : 'geral'

    if (!mapa.has(chave)) {
      mapa.set(chave, {
        chave,
        titulo: responsavel || (perfil ? 'Perfil ' + perfil : 'Rotinas gerais'),
        subtitulo: responsavel ? (perfil || 'Responsável por login') : perfil ? 'Liberadas por perfil' : 'Sem responsável específico',
        tipoOrdem: responsavel ? 1 : perfil ? 2 : 3,
        rotinas: [],
      })
    }

    mapa.get(chave).rotinas.push(modelo)
  })

  return Array.from(mapa.values())
    .map(grupo => ({
      ...grupo,
      ativas: grupo.rotinas.filter(r => r.ativa !== false).length,
      inativas: grupo.rotinas.filter(r => r.ativa === false).length,
      exigeCiencia: grupo.rotinas.filter(r => r.precisa_ciencia === true).length,
      faixaHorario: faixaHorariaRotinas(grupo.rotinas),
    }))
    .sort((a, b) => a.tipoOrdem - b.tipoOrdem || a.titulo.localeCompare(b.titulo, 'pt-BR'))
}

function dataReferenciaRotina(rotina) {
  return (rotina?.created_at || rotina?.data_criacao || rotina?.data_execucao || hojeISO()).slice(0, 10)
}

function diaSemanaDaData(data) {
  const dt = new Date(`${data}T00:00:00`)
  return Number.isNaN(dt.getTime()) ? new Date().getDay() : dt.getDay()
}

function diaMesDaData(data) {
  return Number(data.slice(8, 10)) || new Date().getDate()
}

function diaSemanaRecorrencia(rotina) {
  const marcado = numeroOuNulo(rotina?.dia_semana)
  if (marcado !== null) return marcado
  return diaSemanaDaData(dataReferenciaRotina(rotina))
}

function diaMesRecorrencia(rotina) {
  const marcado = numeroOuNulo(rotina?.dia_mes)
  if (marcado !== null) return marcado
  return diaMesDaData(dataReferenciaRotina(rotina))
}

function rotuloProgramacao(rotina) {
  const recorrencia = normalizar(rotina?.recorrencia || 'DIARIA')
  if (recorrencia === 'SEMANAL') {
    const dia = DIAS_SEMANA.find(d => d.valor === diaSemanaRecorrencia(rotina))
    return dia ? `Semanal · ${dia.alerta}` : 'Semanal'
  }
  if (recorrencia === 'MENSAL') {
    return `Mensal · todo dia ${diaMesRecorrencia(rotina)}`
  }
  return 'Diária'
}

function rotinaCabeNaData(rotina, data) {
  const recorrencia = normalizar(rotina?.recorrencia || 'DIARIA')
  if (recorrencia === 'DIARIA') return true
  if (recorrencia === 'SEMANAL') return diaSemanaRecorrencia(rotina) === diaSemanaDaData(data)
  if (recorrencia === 'MENSAL') return diaMesRecorrencia(rotina) === diaMesDaData(data)
  return true
}

function Botao({ children, ativo, onClick, style = {}, disabled = false }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      border: 'none', borderRadius: 10, padding: '10px 14px', cursor: disabled ? 'not-allowed' : 'pointer',
      fontWeight: 800, fontSize: 13,
      background: ativo ? '#1e3a5f' : '#e2e8f0', color: ativo ? '#fff' : '#1e293b',
      opacity: disabled ? 0.6 : 1,
      ...style,
    }}>{children}</button>
  )
}

function CardNumero({ valor, label, cor = '#2563eb' }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: cor }}>{valor}</div>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>{label}</div>
    </div>
  )
}

function Pill({ meta, children }) {
  return (
    <span style={{
      background: meta.bg, color: meta.color, border: '1px solid ' + meta.border,
      borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 900,
      textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>{children || meta.label}</span>
  )
}

function Campo({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span style={{ minHeight: 30, display: 'flex', alignItems: 'flex-end', fontSize: 11, fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      {children}
    </label>
  )
}

function BuscaLista({ label, value, onChange, options, placeholder }) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState(value || '')
  const ref = useRef(null)

  const filtradas = useMemo(() => {
    const termo = normalizar(busca)
    const lista = termo ? options.filter(item => normalizar(item).includes(termo)) : options
    return lista.slice(0, 80)
  }, [busca, options])

  useEffect(() => {
    if (!aberto) return undefined

    const fecharAoClicarFora = event => {
      if (ref.current && !ref.current.contains(event.target)) {
        setAberto(false)
      }
    }

    document.addEventListener('mousedown', fecharAoClicarFora)
    return () => document.removeEventListener('mousedown', fecharAoClicarFora)
  }, [aberto])

  const abrir = () => {
    setBusca(value || '')
    setAberto(true)
  }

  const selecionar = item => {
    onChange(item)
    setBusca(item)
    setAberto(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 0 }}>
      <span style={{ minHeight: 30, display: 'flex', alignItems: 'flex-end', fontSize: 11, fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      <button
        type="button"
        onClick={abrir}
        style={{ ...inputStyle, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, textAlign: 'left', cursor: 'pointer', marginTop: 6 }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: value ? '#0f172a' : '#64748b' }}>{value || placeholder}</span>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>▼</span>
      </button>
      {aberto && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, minWidth: 240, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 10, boxShadow: '0 14px 30px rgba(15,23,42,0.16)', zIndex: 30, overflow: 'hidden' }}>
          <div style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>
            <input
              autoFocus
              value={busca}
              onChange={e => { setBusca(e.target.value); onChange(e.target.value) }}
              onKeyDown={e => { if (e.key === 'Escape') setAberto(false) }}
              placeholder="Buscar..."
              style={{ ...inputStyle, height: 34, padding: '8px 10px', fontSize: 13 }}
            />
          </div>
          <div style={{ maxHeight: 190, overflowY: 'auto' }}>
            {filtradas.length === 0 ? (
              <div style={{ padding: 12, color: '#dc2626', fontSize: 12, fontWeight: 800 }}>Nenhum resultado encontrado.</div>
            ) : filtradas.map(item => (
              <button
                key={item}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => selecionar(item)}
                style={{ width: '100%', border: 'none', borderBottom: '1px solid #f1f5f9', background: item === value ? '#eff6ff' : '#fff', color: '#0f172a', padding: '10px 12px', textAlign: 'left', cursor: 'pointer', fontSize: 13, fontWeight: item === value ? 900 : 700 }}
              >{item}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function BuscaUsuarioLogin({ label, value, onChange, usuarios, placeholder }) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState(value || '')
  const ref = useRef(null)

  const filtrados = useMemo(() => {
    const termo = normalizar(busca)
    const lista = termo
      ? usuarios.filter(u => normalizar(`${u.nome || ''} ${u.login || ''} ${u.perfil || ''}`).includes(termo))
      : usuarios
    return lista.slice(0, 80)
  }, [busca, usuarios])

  useEffect(() => {
    if (!aberto) return undefined
    const fecharAoClicarFora = event => {
      if (ref.current && !ref.current.contains(event.target)) setAberto(false)
    }
    document.addEventListener('mousedown', fecharAoClicarFora)
    return () => document.removeEventListener('mousedown', fecharAoClicarFora)
  }, [aberto])

  const abrir = () => {
    setBusca(value || '')
    setAberto(true)
  }

  const selecionar = usuario => {
    const login = (usuario.login || '').trim().toLowerCase()
    onChange(login)
    setBusca(login)
    setAberto(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 0 }}>
      <span style={{ minHeight: 30, display: 'flex', alignItems: 'flex-end', fontSize: 11, fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      <button
        type="button"
        onClick={abrir}
        style={{ ...inputStyle, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, textAlign: 'left', cursor: 'pointer', marginTop: 6 }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: value ? '#0f172a' : '#64748b' }}>{value || placeholder}</span>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>▼</span>
      </button>
      {aberto && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, minWidth: 280, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 10, boxShadow: '0 14px 30px rgba(15,23,42,0.16)', zIndex: 30, overflow: 'hidden' }}>
          <div style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>
            <input
              autoFocus
              value={busca}
              onChange={e => { setBusca(e.target.value); onChange(e.target.value.trim().toLowerCase()) }}
              onKeyDown={e => { if (e.key === 'Escape') setAberto(false) }}
              placeholder="Buscar usuário..."
              style={{ ...inputStyle, height: 34, padding: '8px 10px', fontSize: 13 }}
            />
          </div>
          <div style={{ maxHeight: 210, overflowY: 'auto' }}>
            {filtrados.length === 0 ? (
              <div style={{ padding: 12, color: '#dc2626', fontSize: 12, fontWeight: 800 }}>Nenhum usuário encontrado.</div>
            ) : filtrados.map(usuario => {
              const login = (usuario.login || '').trim().toLowerCase()
              return (
                <button
                  key={login || usuario.nome}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => selecionar(usuario)}
                  style={{ width: '100%', border: 'none', borderBottom: '1px solid #f1f5f9', background: login === value ? '#eff6ff' : '#fff', color: '#0f172a', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }}
                >
                  <div style={{ fontSize: 13, fontWeight: 900 }}>{usuario.nome || login}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{login}{usuario.perfil ? ` · ${usuario.perfil}` : ''}</div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle = {
  width: '100%', height: 42, border: '1px solid #cbd5e1', borderRadius: 10, padding: '11px 12px',
  fontSize: 14, outline: 'none', background: '#fff', color: '#0f172a', boxSizing: 'border-box',
}

export default function RotinasAdministrativas({ usuarioLogado, onVoltar }) {
  const [aba, setAba] = useState('hoje')
  const [dataSelecionada, setDataSelecionada] = useState(hojeISO())
  const [modelos, setModelos] = useState([])
  const [execucoes, setExecucoes] = useState([])
  const [subrotinas, setSubrotinas] = useState([])
  const [sugestoes, setSugestoes] = useState({ prefixos: [], supervisores: [], eletricistas: [], usuarios: [] })
  const [selecionadaId, setSelecionadaId] = useState(null)
  const [modeloForm, setModeloForm] = useState(modeloVazio)
  const [modeloEditandoId, setModeloEditandoId] = useState(null)
  const [modeloReplicandoTitulo, setModeloReplicandoTitulo] = useState('')
  const [acaoForm, setAcaoForm] = useState(acaoVazia)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')

  const acessoGeral = isAdmin(usuarioLogado) || temPermissao(usuarioLogado, 'rotinas_dashboard')
  const podeConfigurar = isAdmin(usuarioLogado) || temPermissao(usuarioLogado, 'rotinas_configurar')

  const atualizarAcao = (campo, valor) => setAcaoForm(form => ({ ...form, [campo]: valor }))

  const limparEdicaoModelo = () => {
    setModeloEditandoId(null)
    setModeloReplicandoTitulo('')
    setModeloForm(modeloVazio)
    setErro('')
  }

  const editarModelo = modelo => {
    setModeloEditandoId(modelo.id)
    setModeloReplicandoTitulo('')
    setModeloForm({
      titulo: modelo.titulo || '',
      descricao: modelo.descricao || '',
      ordem_execucao: modelo.ordem_execucao ?? '',
      horario_previsto: fmtHora(modelo.horario_previsto) || '08:00',
      horario_final: fmtHora(modelo.horario_final) || '',
      prioridade: modelo.prioridade || 'NORMAL',
      recorrencia: modelo.recorrencia || 'DIARIA',
      dia_semana: modelo.dia_semana ?? '',
      dia_mes: modelo.dia_mes ?? '',
      precisa_ciencia: modelo.precisa_ciencia === true,
      responsavel_login: modelo.responsavel_login || '',
      perfil_responsavel: modelo.perfil_responsavel || '',
    })
    setErro('')
    setMsg('')
    setAba('modelos')
  }

  const replicarModelo = modelo => {
    setModeloEditandoId(null)
    setModeloReplicandoTitulo(modelo.titulo || 'modelo selecionado')
    setModeloForm({
      titulo: modelo.titulo || '',
      descricao: modelo.descricao || '',
      ordem_execucao: modelo.ordem_execucao ?? '',
      horario_previsto: fmtHora(modelo.horario_previsto) || '08:00',
      horario_final: fmtHora(modelo.horario_final) || '',
      prioridade: modelo.prioridade || 'NORMAL',
      recorrencia: modelo.recorrencia || 'DIARIA',
      dia_semana: modelo.dia_semana ?? '',
      dia_mes: modelo.dia_mes ?? '',
      precisa_ciencia: modelo.precisa_ciencia === true,
      responsavel_login: '',
      perfil_responsavel: '',
    })
    setErro('')
    setMsg('Modelo carregado para replicação. Informe o novo responsável, ajuste o horário se precisar e salve.')
    setAba('modelos')
  }

  const vinculosNaoPreenchidos = useMemo(() => {
    const faltantes = []
    if (!acaoForm.prefixo.trim()) faltantes.push('prefixo')
    if (!acaoForm.supervisor_campo.trim()) faltantes.push('supervisor de campo')
    if (!acaoForm.eletricista.trim()) faltantes.push('eletricista')
    return faltantes
  }, [acaoForm.prefixo, acaoForm.supervisor_campo, acaoForm.eletricista])

  const exibirAlertaVinculos = (acaoForm.titulo.trim() || acaoForm.descricao.trim()) && vinculosNaoPreenchidos.length > 0

  const selecionada = useMemo(
    () => execucoes.find(r => r.id === selecionadaId) || execucoes[0] || null,
    [execucoes, selecionadaId]
  )

  const visiveis = useMemo(() => execucoes, [execucoes])

  const contadores = useMemo(() => {
    const total = visiveis.length
    const pendentes = visiveis.filter(r => statusVisual(r) === 'PENDENTE').length
    const atrasadas = visiveis.filter(r => statusVisual(r) === 'ATRASADA').length
    const andamento = visiveis.filter(r => statusVisual(r) === 'EM_ANDAMENTO').length
    const concluidas = visiveis.filter(r => statusVisual(r) === 'CONCLUIDA').length
    const canceladas = visiveis.filter(r => statusVisual(r) === 'CANCELADA').length
    return { total, pendentes, atrasadas, andamento, concluidas, canceladas }
  }, [visiveis])

  const acompanhamento = useMemo(() => {
    const mapa = new Map()
    visiveis.forEach(r => {
      const chave = r.responsavel_login || r.perfil_responsavel || 'GERAL'
      if (!mapa.has(chave)) mapa.set(chave, { nome: chave, total: 0, pendentes: 0, atrasadas: 0, andamento: 0, concluidas: 0, canceladas: 0 })
      const linha = mapa.get(chave)
      linha.total += 1
      const st = statusVisual(r).toLowerCase()
      if (st === 'em_andamento') linha.andamento += 1
      else if (st === 'concluida') linha.concluidas += 1
      else if (st === 'cancelada') linha.canceladas += 1
      else if (st === 'atrasada') linha.atrasadas += 1
      else linha.pendentes += 1
    })
    return Array.from(mapa.values()).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [visiveis])

  const alertasPendentes = useMemo(() => {
    if (dataSelecionada !== hojeISO()) return []
    return visiveis.filter(r =>
      ['PENDENTE', 'ATRASADA'].includes(statusVisual(r)) &&
      r.precisa_ciencia === true &&
      !r.alerta_ciente_em
    )
  }, [dataSelecionada, visiveis])

  const modelosAgrupados = useMemo(() => agruparModelosPorResponsavel(modelos), [modelos])

  const carregar = async () => {
    setLoading(true)
    setErro('')
    try {
      const { data: mods, error: errMods } = await supabase
        .from('rotinas_modelos')
        .select('*')
        .order('horario_previsto', { ascending: true })
      if (errMods) throw errMods

      const modelosOrdenados = ordenarRotinas(mods || [])
      const modelosEscopo = modelosOrdenados.filter(m =>
        m.ativa !== false &&
        dentroDoEscopo(m, usuarioLogado, acessoGeral) &&
        rotinaCabeNaData(m, dataSelecionada)
      )
      setModelos(modelosOrdenados)

      const { data: existentes, error: errExistentes } = await supabase
        .from('rotinas_execucoes')
        .select('*')
        .eq('data_execucao', dataSelecionada)
      if (errExistentes) throw errExistentes

      const existentesIds = new Set((existentes || []).map(e => e.rotina_modelo_id).filter(Boolean))
      const faltantes = modelosEscopo
        .filter(m => !existentesIds.has(m.id))
        .map(m => ({
          rotina_modelo_id: m.id,
          data_execucao: dataSelecionada,
          titulo_snapshot: m.titulo,
          descricao_snapshot: m.descricao || null,
          ordem_execucao: m.ordem_execucao ?? null,
          horario_previsto: m.horario_previsto,
          horario_final: m.horario_final || null,
          prioridade: m.prioridade || 'NORMAL',
          recorrencia: m.recorrencia || 'DIARIA',
          dia_semana: m.dia_semana ?? null,
          dia_mes: m.dia_mes ?? null,
          precisa_ciencia: m.precisa_ciencia === true,
          responsavel_login: m.responsavel_login || null,
          perfil_responsavel: m.perfil_responsavel || null,
          status: 'PENDENTE',
        }))

      if (faltantes.length > 0) {
        const { error: errInsert } = await supabase
          .from('rotinas_execucoes')
          .upsert(faltantes, { onConflict: 'rotina_modelo_id,data_execucao', ignoreDuplicates: true })
        if (errInsert) throw errInsert
      }

      const { data: execs, error: errExecs } = await supabase
        .from('rotinas_execucoes')
        .select('*')
        .eq('data_execucao', dataSelecionada)
        .order('horario_previsto', { ascending: true })
      if (errExecs) throw errExecs

      const execsEscopo = ordenarRotinas((execs || []).filter(e =>
        dentroDoEscopo(e, usuarioLogado, acessoGeral) &&
        rotinaCabeNaData(e, dataSelecionada)
      ))
      setExecucoes(execsEscopo)
      if (!selecionadaId || !execsEscopo.some(e => e.id === selecionadaId)) {
        setSelecionadaId(execsEscopo[0]?.id || null)
      }
    } catch (e) {
      setErro(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }


  const carregarSugestoes = async () => {
    try {
      const [{ data: estrutura }, { data: usuarios }] = await Promise.all([
        supabase.from('estrutura_equipes').select('prefixo, superv_campo, colaborador'),
        supabase.from('usuarios').select('nome, login, perfil, status'),
      ])
      const usuariosAtivos = (usuarios || [])
        .filter(u => (u.status || 'ATIVO') === 'ATIVO' && (u.login || '').trim())
        .sort((a, b) => (a.nome || a.login || '').localeCompare(b.nome || b.login || '', 'pt-BR'))
      const supervisoresUsuarios = (usuarios || [])
        .filter(u => (u.status || 'ATIVO') === 'ATIVO' && ['SUPERV. CAMPO', 'SUPERV. OPERAÇÃO', 'COORD. OPERAÇÃO'].includes(normalizar(u.perfil)))
        .map(u => u.nome)

      setSugestoes({
        prefixos: unicos((estrutura || []).map(r => r.prefixo)),
        supervisores: unicos([...(estrutura || []).map(r => r.superv_campo), ...supervisoresUsuarios]),
        eletricistas: unicos((estrutura || []).map(r => r.colaborador)),
        usuarios: usuariosAtivos,
      })
    } catch (e) {
      console.warn('Erro carregando sugestões de ações:', e.message || String(e))
    }
  }

  const carregarDetalhes = async () => {
    if (!selecionada?.id) {
      setSubrotinas([])
      return
    }
    const { data: subs, error: errSubs } = await supabase
      .from('rotinas_subrotinas')
      .select('*')
      .eq('rotina_execucao_id', selecionada.id)
      .order('created_at', { ascending: false })
    if (errSubs) setErro(errSubs.message)
    else setSubrotinas(subs || [])
  }

  useEffect(() => { carregar() }, [dataSelecionada])
  useEffect(() => { carregarSugestoes() }, [])
  useEffect(() => { carregarDetalhes() }, [selecionada?.id])

  const flash = texto => {
    setMsg(texto)
    setTimeout(() => setMsg(''), 3500)
  }

  const salvarModelo = async () => {
    if (!modeloForm.titulo.trim()) { setErro('Informe o título da rotina.'); return }
    setSalvando(true)
    setErro('')
    try {
      const recorrenciaModelo = modeloForm.recorrencia || 'DIARIA'
      const diaSemanaModelo = recorrenciaModelo === 'SEMANAL'
        ? (numeroOuNulo(modeloForm.dia_semana) ?? diaSemanaDaData(dataSelecionada))
        : null
      const diaMesModelo = recorrenciaModelo === 'MENSAL'
        ? (numeroOuNulo(modeloForm.dia_mes) ?? diaMesDaData(dataSelecionada))
        : null
      const ordemModelo = numeroOuNulo(modeloForm.ordem_execucao)
      const payloadBase = {
        ...modeloForm,
        titulo: modeloForm.titulo.trim(),
        descricao: modeloForm.descricao.trim() || null,
        ordem_execucao: ordemModelo,
        horario_previsto: modeloForm.horario_previsto || '08:00',
        horario_final: modeloForm.horario_final || null,
        recorrencia: recorrenciaModelo,
        dia_semana: diaSemanaModelo,
        dia_mes: diaMesModelo,
        precisa_ciencia: modeloForm.precisa_ciencia === true,
        responsavel_login: modeloForm.responsavel_login.trim().toLowerCase() || null,
        perfil_responsavel: modeloForm.perfil_responsavel || null,
      }

      if (modeloEditandoId) {
        const atualizadoEm = agoraISO()
        const { error } = await supabase
          .from('rotinas_modelos')
          .update({ ...payloadBase, updated_at: atualizadoEm })
          .eq('id', modeloEditandoId)
        if (error) throw error

        const { error: errExecucoes } = await supabase
          .from('rotinas_execucoes')
          .update({
            titulo_snapshot: payloadBase.titulo,
            descricao_snapshot: payloadBase.descricao,
            ordem_execucao: payloadBase.ordem_execucao,
            horario_previsto: payloadBase.horario_previsto,
            horario_final: payloadBase.horario_final,
            prioridade: payloadBase.prioridade,
            recorrencia: payloadBase.recorrencia,
            dia_semana: payloadBase.dia_semana,
            dia_mes: payloadBase.dia_mes,
            precisa_ciencia: payloadBase.precisa_ciencia,
            responsavel_login: payloadBase.responsavel_login,
            perfil_responsavel: payloadBase.perfil_responsavel,
            updated_at: atualizadoEm,
          })
          .eq('rotina_modelo_id', modeloEditandoId)
          .gte('data_execucao', hojeISO())
          .in('status', ['PENDENTE', 'EM_ANDAMENTO'])
        if (errExecucoes) throw errExecucoes

        limparEdicaoModelo()
        flash('✅ Modelo de rotina atualizado.')
        await carregar()
        setAba('modelos')
        return
      }

      const replicandoModelo = Boolean(modeloReplicandoTitulo)
      const payload = {
        ...payloadBase,
        criado_por: usuarioLogado?.login || null,
        ativa: true,
      }
      const { error } = await supabase.from('rotinas_modelos').insert(payload)
      if (error) throw error
      limparEdicaoModelo()
      flash(replicandoModelo ? '✅ Modelo de rotina replicado.' : '✅ Modelo de rotina criado.')
      await carregar()
      setAba(replicandoModelo ? 'modelos' : 'hoje')
    } catch (e) {
      setErro(e.message || String(e))
    } finally {
      setSalvando(false)
    }
  }

  const alternarModelo = async modelo => {
    setSalvando(true)
    setErro('')
    try {
      const { error } = await supabase
        .from('rotinas_modelos')
        .update({ ativa: !modelo.ativa, updated_at: agoraISO() })
        .eq('id', modelo.id)
      if (error) throw error
      if (modeloEditandoId === modelo.id) limparEdicaoModelo()
      flash(modelo.ativa ? 'Modelo desativado.' : 'Modelo reativado.')
      await carregar()
    } catch (e) { setErro(e.message || String(e)) }
    finally { setSalvando(false) }
  }

  const atualizarStatus = async (rotina, status) => {
    if (!rotina) return
    setSalvando(true)
    setErro('')
    try {
      const payload = { status, updated_at: agoraISO() }
      if (status === 'EM_ANDAMENTO') payload.iniciada_em = rotina.iniciada_em || agoraISO()
      if (status === 'CONCLUIDA') {
        payload.concluida_em = agoraISO()
        payload.concluida_por = usuarioLogado?.login || null
      }
      if (status === 'CANCELADA') {
        payload.cancelada_em = agoraISO()
        payload.cancelada_por = usuarioLogado?.login || null
      }
      const { error } = await supabase.from('rotinas_execucoes').update(payload).eq('id', rotina.id)
      if (error) throw error
      flash(status === 'CONCLUIDA' ? '✅ Rotina concluída.' : status === 'CANCELADA' ? 'Rotina cancelada.' : 'Rotina atualizada.')
      await carregar()
    } catch (e) { setErro(e.message || String(e)) }
    finally { setSalvando(false) }
  }

  const confirmarCienciaAlerta = async rotina => {
    if (!rotina) return
    setSalvando(true)
    setErro('')
    try {
      const { error } = await supabase
        .from('rotinas_execucoes')
        .update({
          alerta_ciente_em: agoraISO(),
          alerta_ciente_por: usuarioLogado?.login || null,
          updated_at: agoraISO(),
        })
        .eq('id', rotina.id)
      if (error) throw error
      setSelecionadaId(rotina.id)
      flash('✅ Ciência registrada para a rotina.')
      await carregar()
    } catch (e) { setErro(e.message || String(e)) }
    finally { setSalvando(false) }
  }

  const adicionarSubrotina = async () => {
    if (!selecionada) return
    if (!acaoForm.titulo.trim()) { setErro('Informe o nome da ação realizada.'); return }
    if (!acaoForm.descricao.trim()) { setErro('Descreva o que foi realizado antes de salvar.'); return }
    setSalvando(true)
    setErro('')
    try {
      const { error } = await supabase.from('rotinas_subrotinas').insert({
        rotina_execucao_id: selecionada.id,
        titulo: acaoForm.titulo.trim(),
        observacao: acaoForm.descricao.trim(),
        prefixo: acaoForm.prefixo.trim() || null,
        supervisor_campo: acaoForm.supervisor_campo.trim() || null,
        eletricista: acaoForm.eletricista.trim() || null,
        responsavel_login: usuarioLogado?.login || null,
      })
      if (error) throw error
      const faltantes = vinculosNaoPreenchidos.length > 0
        ? ' Campos opcionais não preenchidos: ' + vinculosNaoPreenchidos.join(', ') + '.'
        : ''
      setAcaoForm(acaoVazia)
      flash('✅ Ação realizada registrada.' + faltantes)
      await carregarDetalhes()
    } catch (e) { setErro(e.message || String(e)) }
    finally { setSalvando(false) }
  }

  const concluirSubrotina = async sub => {
    setSalvando(true)
    setErro('')
    try {
      const concluida = sub.status === 'CONCLUIDA'
      const { error } = await supabase.from('rotinas_subrotinas').update({
        status: concluida ? 'PENDENTE' : 'CONCLUIDA',
        concluida_em: concluida ? null : agoraISO(),
        concluida_por: concluida ? null : (usuarioLogado?.login || null),
      }).eq('id', sub.id)
      if (error) throw error
      await carregarDetalhes()
    } catch (e) { setErro(e.message || String(e)) }
    finally { setSalvando(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#eef3f8' }}>
      <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)', color: '#fff', padding: '22px 20px' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.18)', color: '#fff', border: 'none', borderRadius: 9,
            padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 16,
          }}>← Voltar para Home</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>🗓️ Rotinas Administrativas</h1>
              <p style={{ fontSize: 12, opacity: 0.82, margin: '4px 0 0' }}>Agenda diária, ações realizadas e acompanhamento da equipe administrativa</p>
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '10px 14px' }}>
              {usuarioNome(usuarioLogado)} · {fmtData(dataSelecionada)}
            </div>
          </div>
        </div>
      </div>

      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '18px 16px 80px' }}>
        {erro && <div style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 12, padding: 12, marginBottom: 14, fontWeight: 800 }}>{erro}</div>}
        {msg && <div style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 12, padding: 12, marginBottom: 14, fontWeight: 800 }}>{msg}</div>}

        {alertasPendentes.length > 0 && (
          <section style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 14, padding: 14, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <div>
                <h3 style={{ margin: 0, color: '#9a3412', fontSize: 15, fontWeight: 900 }}>🔔 Alerta de rotina para hoje</h3>
                <p style={{ margin: '4px 0 0', color: '#9a3412', fontSize: 12, fontWeight: 700 }}>Dê ciência para confirmar que viu a rotina e deve cumprir a atividade.</p>
              </div>
              <span style={{ background: '#fed7aa', color: '#9a3412', borderRadius: 999, padding: '5px 10px', fontSize: 12, fontWeight: 900 }}>{alertasPendentes.length} pendente(s)</span>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {alertasPendentes.map(rotina => (
                <div key={rotina.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', background: '#fff', border: '1px solid #fed7aa', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, color: '#0f172a', fontSize: 13 }}>{intervaloHora(rotina)} · {rotina.titulo_snapshot}</div>
                    <div style={{ color: '#64748b', fontSize: 12, marginTop: 3 }}>{rotuloProgramacao(rotina)} · {statusMeta(rotina).label}</div>
                  </div>
                  <Botao onClick={() => confirmarCienciaAlerta(rotina)} disabled={salvando} style={{ background: '#ea580c', color: '#fff', flexShrink: 0 }}>Dar ciência</Botao>
                </div>
              ))}
            </div>
          </section>
        )}

        <section style={{ background: '#fff', border: '1px solid #dbe3ef', borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
            <CardNumero valor={contadores.total} label="Rotinas do dia" />
            <CardNumero valor={contadores.pendentes} label="Pendentes" cor="#d97706" />
            <CardNumero valor={contadores.atrasadas} label="Atrasadas" cor="#dc2626" />
            <CardNumero valor={contadores.andamento} label="Em andamento" cor="#2563eb" />
            <CardNumero valor={contadores.concluidas} label="Concluídas" cor="#16a34a" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, alignItems: 'end' }}>
            <Campo label="Data da agenda">
              <input type="date" value={dataSelecionada} onChange={e => setDataSelecionada(e.target.value || hojeISO())} style={inputStyle} />
            </Campo>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Botao ativo={aba === 'hoje'} onClick={() => setAba('hoje')}>📋 Agenda do Dia</Botao>
              <Botao ativo={aba === 'modelos'} onClick={() => setAba('modelos')}>🛠️ Modelos</Botao>
              <Botao ativo={aba === 'acompanhamento'} onClick={() => setAba('acompanhamento')}>📊 Acompanhamento</Botao>
              <Botao onClick={() => { setDataSelecionada(hojeISO()); setAba('hoje') }} style={{ marginLeft: 'auto' }}>📍 Hoje</Botao>
            </div>
          </div>
        </section>

        {loading ? (
          <div style={{ background: '#fff', borderRadius: 14, padding: 36, textAlign: 'center', color: '#64748b', fontWeight: 800 }}>Carregando rotinas...</div>
        ) : aba === 'hoje' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
            <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visiveis.length === 0 ? (
                <div style={{ background: '#fff', border: '1px solid #dbe3ef', borderRadius: 14, padding: 30, textAlign: 'center', color: '#64748b', fontWeight: 800 }}>
                  Nenhuma rotina configurada para o seu perfil.
                </div>
              ) : visiveis.map(rotina => {
                const meta = statusMeta(rotina)
                const ativo = rotina.id === selecionada?.id
                return (
                  <article key={rotina.id} onClick={() => setSelecionadaId(rotina.id)} style={{
                    background: ativo ? '#eff6ff' : '#fff', border: '1.5px solid ' + (ativo ? '#60a5fa' : '#dbe3ef'),
                    borderRadius: 14, padding: 14, cursor: 'pointer', boxShadow: ativo ? '0 8px 20px rgba(37,99,235,0.08)' : 'none',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
                          {numeroOuNulo(rotina.ordem_execucao) !== null && <span style={{ background: '#e0f2fe', color: '#075985', borderRadius: 999, padding: '3px 8px', fontSize: 11, fontWeight: 900 }}>{rotuloOrdem(rotina)}</span>}
                          <strong style={{ fontSize: 16, color: '#0f172a' }}>{intervaloHora(rotina)}</strong>
                          <Pill meta={meta} />
                          {rotina.precisa_ciencia === true && <span style={{ fontSize: 11, color: '#c2410c', background: '#ffedd5', borderRadius: 999, padding: '3px 8px', fontWeight: 900 }}>Exige ciência</span>}
                          {rotina.prioridade && rotina.prioridade !== 'NORMAL' && <span style={{ fontSize: 11, color: '#b45309', fontWeight: 900 }}>Prioridade {rotina.prioridade}</span>}
                        </div>
                        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#0f172a' }}>{rotina.titulo_snapshot}</h2>
                        {rotina.descricao_snapshot && (
                          <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.35, color: '#475569' }}>{rotina.descricao_snapshot}</p>
                        )}
                        <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>
                          {(rotina.responsavel_login ? 'Responsável: ' + rotina.responsavel_login : rotina.perfil_responsavel ? 'Perfil: ' + rotina.perfil_responsavel : 'Rotina geral') + ' · ' + rotuloProgramacao(rotina)}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                        {['PENDENTE', 'ATRASADA'].includes(statusVisual(rotina)) && (
                          <Botao onClick={() => atualizarStatus(rotina, 'EM_ANDAMENTO')} disabled={salvando}>Iniciar</Botao>
                        )}
                        {statusVisual(rotina) !== 'CONCLUIDA' && statusVisual(rotina) !== 'CANCELADA' && (
                          <Botao onClick={() => atualizarStatus(rotina, 'CONCLUIDA')} disabled={salvando} style={{ background: '#16a34a', color: '#fff' }}>Concluir</Botao>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </section>

            <aside style={{ background: '#fff', border: '1px solid #dbe3ef', borderRadius: 14, padding: 16, position: 'sticky', top: 12 }}>
              {!selecionada ? (
                <div style={{ color: '#64748b', textAlign: 'center', padding: 20, fontWeight: 800 }}>Selecione uma rotina.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <Pill meta={statusMeta(selecionada)} />
                      <h3 style={{ margin: '10px 0 4px', fontSize: 17, fontWeight: 900, color: '#0f172a' }}>{selecionada.titulo_snapshot}</h3>
                      <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>{intervaloHora(selecionada)} · {selecionada.descricao_snapshot || 'Sem descrição'}</p>
                    </div>
                    {statusVisual(selecionada) !== 'CONCLUIDA' && statusVisual(selecionada) !== 'CANCELADA' && (
                      <Botao onClick={() => atualizarStatus(selecionada, 'CANCELADA')} disabled={salvando}>Cancelar</Botao>
                    )}
                  </div>

                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, marginTop: 12 }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 900, color: '#0f172a' }}>Ações Realizadas</h4>
                    <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
                      <Campo label="Ação realizada *">
                        <input
                          value={acaoForm.titulo}
                          onChange={e => atualizarAcao('titulo', e.target.value)}
                          placeholder="Ex: fiz a primeira cobrança"
                          style={inputStyle}
                        />
                      </Campo>
                      <Campo label="Registro da ação *">
                        <textarea
                          value={acaoForm.descricao}
                          onChange={e => atualizarAcao('descricao', e.target.value)}
                          placeholder="Descreva contato, cobrança feita, evidência ou observação..."
                          style={{ ...inputStyle, minHeight: 84, resize: 'vertical' }}
                        />
                      </Campo>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, alignItems: 'start' }}>
                        <BuscaLista label="Prefixo (opcional)" value={acaoForm.prefixo} onChange={valor => atualizarAcao('prefixo', valor)} options={sugestoes.prefixos} placeholder="Todos" />
                        <BuscaLista label="Supervisor de campo (opcional)" value={acaoForm.supervisor_campo} onChange={valor => atualizarAcao('supervisor_campo', valor)} options={sugestoes.supervisores} placeholder="Todos" />
                        <BuscaLista label="Eletricista (opcional)" value={acaoForm.eletricista} onChange={valor => atualizarAcao('eletricista', valor)} options={sugestoes.eletricistas} placeholder="Todos" />
                      </div>
                      {exibirAlertaVinculos && (
                        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 10, padding: '9px 10px', fontSize: 12, fontWeight: 800 }}>
                          Atenção: campos opcionais sem preenchimento: {vinculosNaoPreenchidos.join(', ')}.
                        </div>
                      )}
                      <Botao
                        onClick={adicionarSubrotina}
                        disabled={salvando || !acaoForm.titulo.trim() || !acaoForm.descricao.trim()}
                        style={{ background: '#1e3a5f', color: '#fff', width: '100%' }}
                      >Salvar ação realizada</Botao>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {subrotinas.length === 0 && <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>Nenhuma ação registrada.</p>}
                      {subrotinas.map(sub => (
                        <div key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 11px' }}>
                          <div style={{ minWidth: 0 }}>
                            <span style={{ fontSize: 13, color: sub.status === 'CONCLUIDA' ? '#15803d' : '#0f172a', fontWeight: 900 }}>{sub.status === 'CONCLUIDA' ? '✓ ' : ''}{sub.titulo}</span>
                            {sub.observacao && <p style={{ margin: '5px 0 0', color: '#334155', fontSize: 12, lineHeight: 1.4 }}>{sub.observacao}</p>}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7, color: '#64748b', fontSize: 11 }}>
                              {sub.prefixo && <span style={{ background: '#e0f2fe', color: '#075985', borderRadius: 999, padding: '3px 7px', fontWeight: 800 }}>Prefixo: {sub.prefixo}</span>}
                              {sub.supervisor_campo && <span style={{ background: '#ede9fe', color: '#5b21b6', borderRadius: 999, padding: '3px 7px', fontWeight: 800 }}>Sup.: {sub.supervisor_campo}</span>}
                              {sub.eletricista && <span style={{ background: '#dcfce7', color: '#166534', borderRadius: 999, padding: '3px 7px', fontWeight: 800 }}>Eletricista: {sub.eletricista}</span>}
                              <span>{sub.responsavel_login || 'usuário'} · {new Date(sub.created_at).toLocaleString('pt-BR')}</span>
                            </div>
                          </div>
                          <button onClick={() => concluirSubrotina(sub)} style={{ border: 'none', background: sub.status === 'CONCLUIDA' ? '#e2e8f0' : '#dcfce7', color: sub.status === 'CONCLUIDA' ? '#475569' : '#15803d', borderRadius: 8, padding: '6px 9px', fontSize: 12, fontWeight: 900, cursor: 'pointer', flexShrink: 0 }}>
                            {sub.status === 'CONCLUIDA' ? 'Reabrir' : 'Fechar'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                </>
              )}
            </aside>
          </div>
        ) : aba === 'modelos' ? (
          <section style={{ display: 'grid', gridTemplateColumns: podeConfigurar ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr', gap: 16, alignItems: 'start' }}>
            {podeConfigurar && (
              <div style={{ background: '#fff', border: '1px solid #dbe3ef', borderRadius: 14, padding: 16 }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 900, color: '#0f172a' }}>
                  {modeloEditandoId ? 'Editar modelo de rotina' : modeloReplicandoTitulo ? 'Replicar modelo de rotina' : 'Criar modelo de rotina'}
                </h3>
                {modeloEditandoId && (
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', borderRadius: 10, padding: '9px 10px', fontSize: 12, fontWeight: 800, marginBottom: 12 }}>
                    Ajustando um modelo cadastrado. As rotinas de hoje/futuras ainda abertas também serão atualizadas.
                  </div>
                )}
                {!modeloEditandoId && modeloReplicandoTitulo && (
                  <div style={{ background: '#ecfdf5', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 10, padding: '9px 10px', fontSize: 12, fontWeight: 800, marginBottom: 12 }}>
                    Replicando o modelo "{modeloReplicandoTitulo}". Informe o novo responsável por login e ajuste o horário antes de salvar.
                  </div>
                )}
                <div style={{ display: 'grid', gap: 12 }}>
                  <Campo label="Título da rotina"><input style={inputStyle} value={modeloForm.titulo} onChange={e => setModeloForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex: Conferir login da equipe no SIGA" /></Campo>
                  <Campo label="Descrição"><textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} value={modeloForm.descricao} onChange={e => setModeloForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Detalhe o objetivo e o resultado esperado" /></Campo>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, alignItems: 'end' }}>
                    <Campo label="Ordem de execução">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        style={inputStyle}
                        value={modeloForm.ordem_execucao}
                        onChange={e => setModeloForm(f => ({ ...f, ordem_execucao: e.target.value }))}
                        placeholder="Ex: 1"
                      />
                    </Campo>
                    <Campo label="Horário inicial"><input type="time" style={inputStyle} value={modeloForm.horario_previsto} onChange={e => setModeloForm(f => ({ ...f, horario_previsto: e.target.value }))} /></Campo>
                    <Campo label="Horário final"><input type="time" style={inputStyle} value={modeloForm.horario_final} onChange={e => setModeloForm(f => ({ ...f, horario_final: e.target.value }))} /></Campo>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Campo label="Prioridade"><select style={inputStyle} value={modeloForm.prioridade} onChange={e => setModeloForm(f => ({ ...f, prioridade: e.target.value }))}>{PRIORIDADES.map(p => <option key={p}>{p}</option>)}</select></Campo>
                    <Campo label="Recorrência">
                      <select
                        style={inputStyle}
                        value={modeloForm.recorrencia}
                        onChange={e => {
                          const recorrencia = e.target.value
                          setModeloForm(f => ({
                            ...f,
                            recorrencia,
                            dia_semana: recorrencia === 'SEMANAL' ? valorRecorrenciaOuPadrao(f.dia_semana, diaSemanaDaData(dataSelecionada)) : f.dia_semana,
                            dia_mes: recorrencia === 'MENSAL' ? valorRecorrenciaOuPadrao(f.dia_mes, diaMesDaData(dataSelecionada)) : f.dia_mes,
                          }))
                        }}
                      >
                        {RECORRENCIAS.map(r => <option key={r.valor} value={r.valor}>{r.label}</option>)}
                      </select>
                    </Campo>
                  </div>
                  {modeloForm.recorrencia === 'SEMANAL' && (
                    <Campo label="Calendário semanal">
                      <select style={inputStyle} value={valorRecorrenciaOuPadrao(modeloForm.dia_semana, diaSemanaDaData(dataSelecionada))} onChange={e => setModeloForm(f => ({ ...f, dia_semana: e.target.value }))}>
                        {DIAS_SEMANA.map(dia => <option key={dia.valor} value={dia.valor}>{dia.label}</option>)}
                      </select>
                    </Campo>
                  )}
                  {modeloForm.recorrencia === 'MENSAL' && (
                    <Campo label="Calendário mensal">
                      <select style={inputStyle} value={valorRecorrenciaOuPadrao(modeloForm.dia_mes, diaMesDaData(dataSelecionada))} onChange={e => setModeloForm(f => ({ ...f, dia_mes: e.target.value }))}>
                        {DIAS_MES.map(dia => <option key={dia} value={dia}>Dia {dia}</option>)}
                      </select>
                    </Campo>
                  )}
                  {modeloForm.recorrencia !== 'DIARIA' && (
                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', borderRadius: 10, padding: '9px 10px', fontSize: 12, fontWeight: 800 }}>
                      Alerta programado: {rotuloProgramacao({
                        recorrencia: modeloForm.recorrencia,
                        dia_semana: valorRecorrenciaOuPadrao(modeloForm.dia_semana, diaSemanaDaData(dataSelecionada)),
                        dia_mes: valorRecorrenciaOuPadrao(modeloForm.dia_mes, diaMesDaData(dataSelecionada)),
                      })}.
                    </div>
                  )}
                  <label style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    background: modeloForm.precisa_ciencia ? '#fff7ed' : '#f8fafc',
                    border: '1px solid ' + (modeloForm.precisa_ciencia ? '#fdba74' : '#e2e8f0'),
                    borderRadius: 10, padding: '11px 12px', cursor: 'pointer',
                  }}>
                    <span>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 900, color: '#334155', textTransform: 'uppercase' }}>Exigir ciência do usuário</span>
                      <span style={{ display: 'block', fontSize: 11, color: '#64748b', marginTop: 3 }}>Quando marcada, a rotina mostra alerta para o usuário dar ciência na data programada.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={modeloForm.precisa_ciencia === true}
                      onChange={e => setModeloForm(f => ({ ...f, precisa_ciencia: e.target.checked }))}
                      style={{ width: 20, height: 20, flexShrink: 0 }}
                    />
                  </label>
                  <BuscaUsuarioLogin label="Responsável por login" value={modeloForm.responsavel_login} onChange={valor => setModeloForm(f => ({ ...f, responsavel_login: valor }))} usuarios={sugestoes.usuarios} placeholder="Opcional: login do usuário" />
                  <Campo label="Ou liberar para perfil"><select style={inputStyle} value={modeloForm.perfil_responsavel} onChange={e => setModeloForm(f => ({ ...f, perfil_responsavel: e.target.value }))}>{PERFIS_DESTINO.map(p => <option key={p} value={p}>{p || 'Sem perfil específico'}</option>)}</select></Campo>
                  <Botao onClick={salvarModelo} disabled={salvando} style={{ background: '#2563eb', color: '#fff', width: '100%' }}>
                    {modeloEditandoId ? 'Salvar alterações' : modeloReplicandoTitulo ? 'Salvar réplica' : 'Salvar modelo'}
                  </Botao>
                  {(modeloEditandoId || modeloReplicandoTitulo) && (
                    <Botao onClick={limparEdicaoModelo} disabled={salvando} style={{ width: '100%' }}>
                      {modeloEditandoId ? 'Cancelar edição' : 'Cancelar replicação'}
                    </Botao>
                  )}
                </div>
              </div>
            )}

            <div style={{ background: '#fff', border: '1px solid #dbe3ef', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: 14, borderBottom: '1px solid #e2e8f0', fontWeight: 900 }}>Modelos cadastrados ({modelos.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {modelos.length === 0 && <div style={{ padding: 24, color: '#64748b', fontWeight: 800 }}>Nenhum modelo cadastrado.</div>}
                {modelosAgrupados.map(grupo => (
                  <section key={grupo.chave} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 10, background: '#dbeafe', color: '#1e40af', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, flexShrink: 0 }}>
                            {grupo.titulo.slice(0, 1).toUpperCase()}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <h4 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#0f172a', overflowWrap: 'anywhere' }}>{grupo.titulo}</h4>
                            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 12, lineHeight: 1.35 }}>
                              {grupo.subtitulo} · {grupo.rotinas.length} rotina(s) · {grupo.faixaHorario}
                            </p>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <span style={{ background: '#dcfce7', color: '#166534', borderRadius: 999, padding: '4px 8px', fontSize: 11, fontWeight: 900 }}>{grupo.ativas} ativa(s)</span>
                          {grupo.inativas > 0 && <span style={{ background: '#f1f5f9', color: '#475569', borderRadius: 999, padding: '4px 8px', fontSize: 11, fontWeight: 900 }}>{grupo.inativas} inativa(s)</span>}
                          {grupo.exigeCiencia > 0 && <span style={{ background: '#ffedd5', color: '#c2410c', borderRadius: 999, padding: '4px 8px', fontSize: 11, fontWeight: 900 }}>{grupo.exigeCiencia} com ciência</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {grupo.rotinas.map(m => (
                        <div key={m.id} style={{ padding: 13, borderBottom: '1px solid #edf2f7', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'center', opacity: m.ativa === false ? 0.55 : 1, background: modeloEditandoId === m.id ? '#eff6ff' : '#fff' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', color: '#0f172a', marginBottom: 5 }}>
                              {numeroOuNulo(m.ordem_execucao) !== null && <span style={{ background: '#e0f2fe', color: '#075985', borderRadius: 999, padding: '3px 8px', fontSize: 11, fontWeight: 900 }}>{rotuloOrdem(m)}</span>}
                              <span style={{ fontSize: 13, fontWeight: 900, color: '#1e3a5f' }}>{intervaloHora(m) || 'Sem horário'}</span>
                              {m.ativa === false && <span style={{ background: '#f1f5f9', color: '#64748b', borderRadius: 999, padding: '3px 8px', fontSize: 11, fontWeight: 900 }}>Inativa</span>}
                              {m.precisa_ciencia === true && <span style={{ background: '#ffedd5', color: '#c2410c', borderRadius: 999, padding: '3px 8px', fontSize: 11, fontWeight: 900 }}>Exige ciência</span>}
                            </div>
                            <h5 style={{ margin: 0, fontSize: 14, fontWeight: 900, color: '#0f172a', lineHeight: 1.25 }}>{m.titulo}</h5>
                            {m.descricao && <div style={{ fontSize: 12, color: '#475569', marginTop: 5, lineHeight: 1.35 }}>{m.descricao}</div>}
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 5 }}>{m.prioridade || 'NORMAL'} · {rotuloProgramacao(m)}</div>
                          </div>
                          {podeConfigurar && (
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', minWidth: 92 }}>
                              <Botao onClick={() => editarModelo(m)} disabled={salvando || modeloEditandoId === m.id} style={{ background: '#2563eb', color: '#fff', width: 86 }}>Editar</Botao>
                              <Botao onClick={() => replicarModelo(m)} disabled={salvando} style={{ background: '#0f766e', color: '#fff', width: 86 }}>Replicar</Botao>
                              <Botao onClick={() => alternarModelo(m)} disabled={salvando} style={{ width: 86 }}>{m.ativa === false ? 'Reativar' : 'Desativar'}</Botao>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <section style={{ background: '#fff', border: '1px solid #dbe3ef', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: 14, borderBottom: '1px solid #e2e8f0', fontWeight: 900 }}>Acompanhamento por responsável</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', color: '#475569', textAlign: 'left' }}>
                    {['Responsável', 'Total', 'Pendentes', 'Atrasadas', 'Em andamento', 'Concluídas', 'Canceladas'].map(h => <th key={h} style={{ padding: 12, borderBottom: '1px solid #e2e8f0' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {acompanhamento.length === 0 && <tr><td colSpan="7" style={{ padding: 24, textAlign: 'center', color: '#64748b', fontWeight: 800 }}>Nenhum dado para a data selecionada.</td></tr>}
                  {acompanhamento.map(l => (
                    <tr key={l.nome}>
                      <td style={{ padding: 12, borderBottom: '1px solid #e2e8f0', fontWeight: 900 }}>{l.nome}</td>
                      <td style={{ padding: 12, borderBottom: '1px solid #e2e8f0' }}>{l.total}</td>
                      <td style={{ padding: 12, borderBottom: '1px solid #e2e8f0', color: '#92400e', fontWeight: 800 }}>{l.pendentes}</td>
                      <td style={{ padding: 12, borderBottom: '1px solid #e2e8f0', color: '#dc2626', fontWeight: 800 }}>{l.atrasadas}</td>
                      <td style={{ padding: 12, borderBottom: '1px solid #e2e8f0', color: '#2563eb', fontWeight: 800 }}>{l.andamento}</td>
                      <td style={{ padding: 12, borderBottom: '1px solid #e2e8f0', color: '#16a34a', fontWeight: 800 }}>{l.concluidas}</td>
                      <td style={{ padding: 12, borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 800 }}>{l.canceladas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
