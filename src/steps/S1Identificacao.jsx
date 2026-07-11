import { useState, useEffect, useRef } from 'react'
import { Field, NavBar, Alert } from '../components/Shared.jsx'
import { supabase } from '../lib/supabase.js'

const SITUACOES_AUDITORIA = ['ATIVO', 'RESERVA']

async function buscarFiscais(texto) {
  if (!texto || texto.length < 2) return []
  const { data } = await supabase
    .from('usuarios')
    .select('nome, matricula')
    .ilike('nome', `%${texto}%`)
    .in('status', ['ATIVO', 'RESERVA'])
    .order('nome')
    .limit(10)
  return data || []
}

async function buscarPrefixos(texto) {
  if (!texto || texto.length < 2) return []
  const { data, error } = await supabase
    .from('estrutura_equipes')
    .select('prefixo')
    .ilike('prefixo', `%${texto}%`)
    .order('prefixo')
    .limit(10)
  // Falha de rede (ex: sem internet real em campo, mesmo com navigator.onLine
  // indicando "online") não pode ser tratada igual a "prefixo não existe" —
  // por isso propaga o erro em vez de engolir e devolver lista vazia.
  if (error) throw error
  if (!data) return []
  return [...new Set(data.map(r => r.prefixo))]
}

async function buscarEletricistas(prefixo) {
  if (!prefixo) return []
  const { data } = await supabase
    .from('estrutura_equipes')
    .select('matricula, colaborador')
    .eq('prefixo', prefixo)
    .in('descr_situacao', SITUACOES_AUDITORIA)
    .order('colaborador')
  return data || []
}

async function buscarPorNome(texto) {
  if (!texto || texto.length < 2) return []
  const { data } = await supabase
    .from('estrutura_equipes')
    .select('matricula, colaborador')
    .ilike('colaborador', `%${texto}%`)
    .in('descr_situacao', SITUACOES_AUDITORIA)
    .order('colaborador')
    .limit(10)
  return data || []
}

async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=pt-BR`
    const res  = await fetch(url, { headers: { 'User-Agent': 'AuditoriaCampoDPL/1.0' } })
    const data = await res.json()
    const r    = data.address || {}
    return [r.road, r.house_number, r.suburb || r.neighbourhood, r.city || r.town || r.village, r.state]
      .filter(Boolean).join(', ')
  } catch { return '' }
}

// ── Autocomplete genérico (fiscal, eletricistas) ──────────────────────────────
function AutocompleteInput({ label, value, onChange, onSelect, suggestions, placeholder, required, info }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="form-group" style={{ position: 'relative' }} ref={ref}>
      <label className="form-label">{label}{required && ' *'}</label>
      <input
        className="form-input"
        value={value}
        onChange={e => { onChange(e.target.value); setAberto(true) }}
        onFocus={() => suggestions.length > 0 && setAberto(true)}
        placeholder={placeholder}
      />
      {info && <p style={{ fontSize: 11, color: '#16a34a', marginTop: 3, fontWeight: 600 }}>{info}</p>}
      {aberto && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto',
        }}>
          {suggestions.map((s, i) => (
            <button key={i} onClick={() => { onSelect(s); setAberto(false) }} style={{
              display: 'block', width: '100%', padding: '11px 14px', textAlign: 'left',
              background: 'none', border: 'none',
              borderBottom: i < suggestions.length - 1 ? '1px solid #f1f5f9' : 'none',
              fontSize: 13, color: '#1e293b', cursor: 'pointer',
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── PrefixoInput com validação online/offline ─────────────────────────────────
// Online  → só aceita prefixo escolhido da lista (busca em estrutura_equipes)
// Offline → digitação livre (sem internet não dá pra validar)
function PrefixoInputValidado({ value, onChange, onValidChange, eletricistasCount }) {
  const [sugestoes,   setSugestoes]   = useState([])
  const [aberto,      setAberto]      = useState(false)
  const [valido,      setValido]      = useState(false)
  const [buscando,    setBuscando]    = useState(false)
  const [semResultado, setSemResultado] = useState(false)
  // semConexao = navigator.onLine disse "online" mas a consulta ao Supabase
  // falhou de verdade (comum em campo: sinal fraco, wifi sem internet, etc.)
  // Nesse caso não dá pra confiar que "não achou" significa "prefixo inválido".
  const [semConexao, setSemConexao] = useState(false)
  const offline = !navigator.onLine
  const ref = useRef(null)

  // Sincroniza estado de validade com o pai
  useEffect(() => { onValidChange(valido || offline || semConexao) }, [valido, offline, semConexao])

  // Quando o form é carregado com prefixo pré-preenchido (pauta ativa),
  // marca como válido direto se estiver offline ou dispara uma verificação
  useEffect(() => {
    if (!value) return
    if (offline) { setValido(true); return }
    // Verifica silenciosamente se o prefixo pré-preenchido é válido
    supabase.from('estrutura_equipes')
      .select('prefixo').eq('prefixo', value).limit(1)
      .then(({ data, error }) => {
        if (error) { setSemConexao(true); setValido(true); return }
        const ok = !!(data && data.length > 0)
        setValido(ok)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // só na montagem

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
    setSemConexao(false)

    if (offline) {
      // Sem internet: aceita qualquer digitação
      setValido(true)
      setSugestoes([])
      setAberto(false)
      return
    }

    if (upper.length < 2) { setSugestoes([]); setAberto(false); return }

    setBuscando(true)
    try {
      const lista = await buscarPrefixos(upper)
      setBuscando(false)
      setSugestoes(lista)
      setAberto(lista.length > 0)
      setSemResultado(lista.length === 0 && upper.length >= 2)
    } catch {
      // navigator.onLine indicava "online" mas a consulta falhou de verdade
      // (sem sinal/sem internet em campo) — não bloqueia o fiscal, aceita o
      // prefixo digitado manualmente, igual ao comportamento offline.
      setBuscando(false)
      setSemConexao(true)
      setValido(true)
      setSugestoes([])
      setAberto(false)
    }
  }

  const handleSelect = (v) => {
    onChange(v)
    setValido(true)
    setSugestoes([])
    setAberto(false)
    setSemResultado(false)
    setSemConexao(false)
  }

  // Cor e ícone do campo de acordo com o estado
  const borderColor = valido
    ? '#16a34a'
    : (value && !offline)
      ? '#dc2626'
      : '#e2e8f0'

  const bgColor = valido ? '#f0fdf4' : (value && !offline && !valido) ? '#fef2f2' : '#fff'

  return (
    <div className="form-group" style={{ position: 'relative' }} ref={ref}>
      <label className="form-label">Prefixo da Equipe *</label>
      <div style={{ position: 'relative' }}>
        <input
          className="form-input"
          value={value}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => sugestoes.length > 0 && setAberto(true)}
          placeholder={(offline || semConexao) ? 'Sem conexão — digite o prefixo manualmente' : 'Digite para buscar (ex: PI-THE-C001M)'}
          autoComplete="off"
          style={{
            borderColor,
            background: bgColor,
            paddingRight: 36,
            transition: 'border-color 0.2s, background 0.2s',
          }}
        />
        {/* Ícone de estado no canto direito */}
        <span style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          fontSize: 16, pointerEvents: 'none',
        }}>
          {offline      ? '📵'
           : semConexao ? '⚠️'
           : buscando   ? '⏳'
           : valido     ? '✅'
           : value && value.length >= 2 ? '❌' : '🔍'}
        </span>
      </div>

      {/* Dropdown de sugestões */}
      {aberto && sugestoes.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: '#fff', border: '1.5px solid #bfdbfe', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)', maxHeight: 220, overflowY: 'auto',
        }}>
          {sugestoes.map((s, i) => (
            <button key={i} onMouseDown={() => handleSelect(s)} style={{
              display: 'block', width: '100%', padding: '11px 14px', textAlign: 'left',
              background: 'none', border: 'none',
              borderBottom: i < sugestoes.length - 1 ? '1px solid #f1f5f9' : 'none',
              fontSize: 13, fontWeight: 600, color: '#1e293b', cursor: 'pointer',
              fontFamily: '"Courier New", monospace', letterSpacing: 0.5,
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >{s}</button>
          ))}
        </div>
      )}

      {/* Mensagens de feedback */}
      {offline && (
        <p style={{ fontSize: 11, color: '#92400e', marginTop: 4, fontWeight: 600 }}>
          📵 Offline — prefixo será salvo sem validação. Certifique-se de usar o padrão correto (ex: PI-THE-C001M).
        </p>
      )}
      {!offline && semConexao && (
        <p style={{ fontSize: 11, color: '#92400e', marginTop: 4, fontWeight: 600 }}>
          ⚠️ Sem conexão com o servidor — prefixo será salvo sem validação. Certifique-se de usar o padrão correto (ex: PI-THE-C001M).
        </p>
      )}
      {!offline && !semConexao && valido && (
        <p style={{ fontSize: 11, color: '#16a34a', marginTop: 4, fontWeight: 600 }}>
          ✅ Prefixo encontrado na base de dados
          {eletricistasCount > 0 ? ` · ${eletricistasCount} eletricista(s) nesta equipe` : ''}
        </p>
      )}
      {!offline && !semConexao && semResultado && value && value.length >= 2 && (
        <p style={{ fontSize: 11, color: '#dc2626', marginTop: 4, fontWeight: 600 }}>
          ❌ Prefixo não encontrado. Verifique o padrão (ex: PI-THE-C001M) ou escolha da lista.
        </p>
      )}
      {!offline && !semConexao && !valido && value && value.length >= 2 && !semResultado && !buscando && sugestoes.length > 0 && (
        <p style={{ fontSize: 11, color: '#d97706', marginTop: 4, fontWeight: 600 }}>
          ☝️ Selecione um prefixo da lista para continuar.
        </p>
      )}
    </div>
  )
}

function temCoordenadasPauta(p) {
  return p?.latitude !== null && p?.latitude !== undefined && p?.latitude !== '' &&
    p?.longitude !== null && p?.longitude !== undefined && p?.longitude !== ''
}

function linkRotaPauta(p) {
  if (!temCoordenadasPauta(p)) return ''
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${p.latitude},${p.longitude}`)}`
}

function textoPadrao(valor) {
  return String(valor ?? '').trim().toLocaleUpperCase('pt-BR')
}

function localPauta(p) {
  return [p?.cidade, p?.bairro].map(textoPadrao).filter(Boolean).join('/')
}

export default function S1Identificacao({ form, upd, setForm, next, prev, pautaAtiva }) {
  const [gpsLoading,      setGpsLoading]      = useState(false)
  const [gpsErro,         setGpsErro]         = useState('')
  const [fiscalSugs,      setFiscalSugs]      = useState([])
  const [elet1Sugs,       setElet1Sugs]       = useState([])
  const [elet2Sugs,       setElet2Sugs]       = useState([])
  const [eletricistas,    setEletricistas]    = useState([])
  const [prefixoValido,   setPrefixoValido]   = useState(false)
  const [asCopiada,       setAsCopiada]       = useState(false)

  const offline = !navigator.onLine

  // Prefixo válido = selecionado da lista OU offline
  const ok = form.fiscal && form.matricula && form.prefixo && form.os && form.uc && form.lat && (prefixoValido || offline)

  const copiarNumeroAS = async () => {
    if (!form.numeroAS) return
    try {
      await navigator.clipboard.writeText(form.numeroAS)
    } catch {
      const el = document.createElement('textarea')
      el.value = form.numeroAS
      el.setAttribute('readonly', '')
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setAsCopiada(true)
    window.setTimeout(() => setAsCopiada(false), 1800)
  }

  // Pré-preenche OS, UC, eletricistas e MOTIVO DA AUDITORIA a partir da pauta
  // ativa, sempre que os campos correspondentes ainda estiverem vazios no form.
  // ⚠️ O motivo_auditoria é o gatilho do módulo condicional nas Evidências (S4)
  // e no Resultado (S6) — sem essa cópia, `form.motivoAuditoria` nunca chega lá.
  useEffect(() => {
    if (!pautaAtiva) return
    if (pautaAtiva.numero_as && !form.numeroAS) upd('numeroAS', pautaAtiva.numero_as)
    if (pautaAtiva.os && !form.os) upd('os', pautaAtiva.os)
    if (pautaAtiva.uc && !form.uc) upd('uc', pautaAtiva.uc)
    if (pautaAtiva.nome_eletricista && !form.nomeEletricista) {
      upd('nomeEletricista', pautaAtiva.nome_eletricista)
      if (pautaAtiva.matricula_eletricista1) upd('matriculaEletricista1', pautaAtiva.matricula_eletricista1)
    }
    if (pautaAtiva.nome_eletricista2 && !form.nomeEletricista2) {
      upd('nomeEletricista2', pautaAtiva.nome_eletricista2)
      if (pautaAtiva.matricula_eletricista2) upd('matriculaEletricista2', pautaAtiva.matricula_eletricista2)
    }
    if (pautaAtiva.motivo_auditoria && !form.motivoAuditoria) {
      upd('motivoAuditoria', pautaAtiva.motivo_auditoria)
    }
    if (pautaAtiva.qtde_cabos_os && !form.qtdeCabosOs) {
      upd('qtdeCabosOs', pautaAtiva.qtde_cabos_os)
    }
  }, [pautaAtiva])

  useEffect(() => {
    if (form.prefixo && form.prefixo.length >= 5) {
      buscarEletricistas(form.prefixo).then(setEletricistas)
    } else {
      setEletricistas([])
    }
  }, [form.prefixo])

  const onFiscalChange = async v => {
    upd('fiscal', v)
    if (v.length < 2) { setFiscalSugs([]); return }
    const res = await buscarFiscais(v)
    setFiscalSugs(res.map(u => u.matricula ? `${u.nome} (${u.matricula})` : u.nome))
  }
  const onFiscalSelect = v => {
    const match = v.match(/^(.+)\s\((\w+)\)$/)
    if (match) {
      upd('fiscal', match[1])
      upd('matricula', match[2])
    } else {
      upd('fiscal', v)
    }
    setFiscalSugs([])
  }

  const onElet1Change = async v => {
    upd('nomeEletricista', v)
    if (v.length < 2) { setElet1Sugs([]); return }
    const res = await buscarPorNome(v)
    setElet1Sugs(res.map(e => `${e.colaborador} (${e.matricula})`))
  }
  const onElet1Select = v => {
    const match = v.match(/^(.+)\s\((\d+)\)$/)
    if (match) { upd('nomeEletricista', match[1]); upd('matriculaEletricista1', match[2]) }
    else        { upd('nomeEletricista', v) }
    setElet1Sugs([])
  }

  const onElet2Change = async v => {
    upd('nomeEletricista2', v)
    if (v.length < 2) { setElet2Sugs([]); return }
    const res = await buscarPorNome(v)
    setElet2Sugs(res.map(e => `${e.colaborador} (${e.matricula})`))
  }
  const onElet2Select = v => {
    const match = v.match(/^(.+)\s\((\d+)\)$/)
    if (match) { upd('nomeEletricista2', match[1]); upd('matriculaEletricista2', match[2]) }
    else        { upd('nomeEletricista2', v) }
    setElet2Sugs([])
  }

  const capturarGPS = () => {
    if (!navigator.geolocation) { setGpsErro('GPS não disponível.'); return }
    setGpsLoading(true); setGpsErro('')
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = pos.coords.latitude.toFixed(6)
        const lng = pos.coords.longitude.toFixed(6)
        const endAuto = await reverseGeocode(lat, lng)
        setForm(f => ({ ...f, lat, lng, gpsStatus: 'ok', endereco: endAuto || f.endereco }))
        setGpsLoading(false)
      },
      () => { setGpsErro('Não foi possível obter GPS. Verifique as permissões.'); setGpsLoading(false) },
      { timeout: 12000, enableHighAccuracy: true }
    )
  }

  const temInfoPauta = pautaAtiva && (
    pautaAtiva.motivo_auditoria ||
    pautaAtiva.qtde_cabos_os ||
    pautaAtiva.observacao ||
    pautaAtiva.prioridade_execucao ||
    pautaAtiva.data_os ||
    pautaAtiva.cidade ||
    pautaAtiva.bairro ||
    pautaAtiva.endereco_referencia ||
    temCoordenadasPauta(pautaAtiva)
  )

  return (
    <div>
      <p className="section-title">Dados do Fiscal</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Data" value={form.data} onChange={v => upd('data', v)} type="date" />
        <Field label="Hora" value={form.hora} onChange={v => upd('hora', v)} type="time" />
      </div>

      <AutocompleteInput
        label="Nome do Fiscal"
        value={form.fiscal}
        onChange={onFiscalChange}
        onSelect={onFiscalSelect}
        suggestions={fiscalSugs}
        placeholder="Digite o nome para buscar"
        required
      />

      <Field
        label="Matrícula"
        value={form.matricula}
        onChange={v => upd('matricula', v)}
        placeholder="Preenchida automaticamente ou manualmente"
        required
      />

      <p className="section-title" style={{ marginTop: 18 }}>Dados do Serviço</p>

      {/* ── Prefixo com validação online/offline ── */}
      {form.numeroAS && (
        <div className="form-group">
          <label className="form-label">No. AS</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
            <input
              className="form-input"
              value={form.numeroAS}
              readOnly
              onFocus={e => e.target.select()}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={copiarNumeroAS}
              style={{ height: 46, padding: '0 14px', whiteSpace: 'nowrap' }}
              title="Copiar No. AS"
            >
              Copiar
            </button>
          </div>
          {asCopiada && (
            <p style={{ fontSize: 11, color: '#16a34a', marginTop: 4, fontWeight: 700 }}>
              AS copiada.
            </p>
          )}
        </div>
      )}

      <PrefixoInputValidado
        value={form.prefixo}
        onChange={v => upd('prefixo', v)}
        onValidChange={setPrefixoValido}
        eletricistasCount={eletricistas.length}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="form-group">
          <label className="form-label">
            Nº da OS *
            {pautaAtiva?.os && <span style={{ fontSize: 10, color: '#d97706', marginLeft: 6, fontWeight: 700 }}>📋 da pauta</span>}
          </label>
          <input className="form-input" value={form.os} onChange={e => upd('os', e.target.value)} placeholder="Ordem de Serviço" />
        </div>
        <div className="form-group">
          <label className="form-label">
            Nº da UC *
            {pautaAtiva?.uc && <span style={{ fontSize: 10, color: '#d97706', marginLeft: 6, fontWeight: 700 }}>📋 da pauta</span>}
          </label>
          <input className="form-input" value={form.uc} onChange={e => upd('uc', e.target.value)} placeholder="Unidade Consumidora" />
        </div>
      </div>

      {temInfoPauta && (
        <div style={{
          background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 12,
          padding: '14px', marginTop: 6, marginBottom: 14,
        }}>
          <p style={{
            fontSize: 11, fontWeight: 800, color: '#9a3412',
            textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            📋 Informações da Pauta
            <span style={{
              fontSize: 9, fontWeight: 700, color: '#fff',
              background: '#c2410c', padding: '2px 7px', borderRadius: 4,
              letterSpacing: 0.5,
            }}>somente leitura</span>
          </p>
          {pautaAtiva.motivo_auditoria && (
            <div style={{
              display: 'inline-block',
              background: '#fff', border: '1.5px solid #fed7aa',
              color: '#c2410c', fontWeight: 800, fontSize: 13,
              padding: '6px 12px', borderRadius: 8,
              marginBottom: (pautaAtiva.qtde_cabos_os || pautaAtiva.observacao) ? 10 : 0,
            }}>
              🎯 Motivo: {pautaAtiva.motivo_auditoria}
            </div>
          )}
          {pautaAtiva.qtde_cabos_os && (
            <div style={{
              fontSize: 12, color: '#92400e', fontWeight: 800,
              marginBottom: (pautaAtiva.prioridade_execucao || pautaAtiva.data_os || pautaAtiva.cidade || pautaAtiva.bairro || pautaAtiva.endereco_referencia || temCoordenadasPauta(pautaAtiva) || pautaAtiva.observacao) ? 10 : 0,
            }}>
              Cabos OS: {pautaAtiva.qtde_cabos_os}m
            </div>
          )}
          {(pautaAtiva.prioridade_execucao || pautaAtiva.data_os || pautaAtiva.cidade || pautaAtiva.bairro || pautaAtiva.endereco_referencia || temCoordenadasPauta(pautaAtiva)) && (
            <div style={{
              background: '#fff', border: '1.5px solid #fed7aa', borderRadius: 8,
              padding: '8px 10px', fontSize: 12, color: '#475569',
              fontWeight: 700, lineHeight: 1.6, marginBottom: pautaAtiva.observacao ? 10 : 0,
            }}>
              {pautaAtiva.prioridade_execucao && <div>PRIORIDADE: {pautaAtiva.prioridade_execucao}</div>}
              {pautaAtiva.data_os && <div>DATA DA OS: {pautaAtiva.data_os}</div>}
              {(pautaAtiva.cidade || pautaAtiva.bairro) && (
                <div>CIDADE/BAIRRO: {localPauta(pautaAtiva)}</div>
              )}
              {pautaAtiva.endereco_referencia && <div>ENDERECO: {textoPadrao(pautaAtiva.endereco_referencia)}</div>}
              {temCoordenadasPauta(pautaAtiva) && (
                <a
                  href={linkRotaPauta(pautaAtiva)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#2563eb', fontWeight: 800, textDecoration: 'none' }}
                >
                  Abrir rota ate o local
                </a>
              )}
            </div>
          )}
          {pautaAtiva.observacao && (
            <div style={{
              background: '#f0f9ff', border: '1.5px solid #bae6fd', borderRadius: 8,
              padding: '10px 12px', lineHeight: 1.6,
            }}>
              <p style={{
                fontSize: 10, fontWeight: 800, color: '#0369a1',
                textTransform: 'uppercase', letterSpacing: 0.5, margin: 0,
              }}>💬 Observação:</p>
              <p style={{
                fontSize: 13, color: '#0c4a6e', margin: '5px 0 0',
                wordBreak: 'break-word', whiteSpace: 'pre-wrap',
              }}>
                {pautaAtiva.observacao}
              </p>
            </div>
          )}
        </div>
      )}

      <p className="section-title" style={{ marginTop: 18 }}>Eletricistas da Equipe</p>

      <AutocompleteInput
        label="Nome do Eletricista 1"
        value={form.nomeEletricista || ''}
        onChange={onElet1Change}
        onSelect={onElet1Select}
        suggestions={elet1Sugs}
        placeholder="Digite o nome para buscar"
        required
      />

      <AutocompleteInput
        label="Nome do Eletricista 2 (opcional)"
        value={form.nomeEletricista2 || ''}
        onChange={onElet2Change}
        onSelect={onElet2Select}
        suggestions={elet2Sugs}
        placeholder="Digite o nome para buscar"
      />

      <p className="section-title" style={{ marginTop: 18 }}>Localização</p>

      <button onClick={capturarGPS} disabled={gpsLoading} style={{
        width: '100%', padding: 13, borderRadius: 10, marginBottom: 12,
        background: form.lat ? '#f0fdf4' : '#eff6ff',
        border: `1.5px solid ${form.lat ? '#86efac' : '#93c5fd'}`,
        color: form.lat ? '#15803d' : '#1d4ed8',
        fontWeight: 700, fontSize: 14, cursor: 'pointer',
      }}>
        {gpsLoading ? '📡 Capturando GPS...'
          : form.lat ? `📍 GPS capturado — ${form.lat}, ${form.lng}`
          : '📍 Capturar GPS e Endereço Automático'}
      </button>

      {gpsErro && <div className="alert alert-danger" style={{ marginBottom: 10 }}>{gpsErro}</div>}

      <div className="form-group">
        <label className="form-label">
          Endereço {form.lat && <span style={{ color: '#16a34a', fontSize: 10 }}>✓ preenchido pelo GPS</span>}
        </label>
        <input type="text" value={form.endereco} onChange={e => upd('endereco', e.target.value)}
          placeholder="Clique em Capturar GPS ou preencha manualmente" className="form-input" />
      </div>

      {form.lat && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div><span style={{ color: '#64748b' }}>Latitude:</span><br /><strong style={{ color: '#15803d' }}>{form.lat}</strong></div>
            <div><span style={{ color: '#64748b' }}>Longitude:</span><br /><strong style={{ color: '#15803d' }}>{form.lng}</strong></div>
          </div>
        </div>
      )}

      <Alert type={form.lat ? 'info' : 'warning'}>
        {form.lat ? '✅ GPS capturado e registrado como evidência.'
          : '⚠️ GPS obrigatório! Clique em "Capturar GPS" para continuar.'}
      </Alert>

      {/* Aviso de prefixo inválido ao tentar avançar sem validação */}
      {!offline && form.prefixo && !prefixoValido && (
        <div style={{
          background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 10,
          padding: '10px 14px', marginTop: 10, fontSize: 13, color: '#b91c1c', fontWeight: 600,
        }}>
          ⚠️ Selecione um prefixo válido da lista antes de continuar.
          O prefixo deve existir na base de dados (ex: PI-THE-C001M).
        </div>
      )}

      <div style={{ height: 80 }} />
      <NavBar onPrev={prev} onNext={ok ? next : undefined} nextDisabled={!ok} />
    </div>
  )
}
