import { useState, useEffect, useRef } from 'react'
import { Field, NavBar, Alert } from '../components/Shared.jsx'
import { supabase } from '../lib/supabase.js'

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
  const { data } = await supabase
    .from('estrutura_equipes')
    .select('prefixo')
    .ilike('prefixo', `%${texto}%`)
    .order('prefixo')
    .limit(10)
  if (!data) return []
  return [...new Set(data.map(r => r.prefixo))]
}

async function buscarEletricistas(prefixo) {
  if (!prefixo) return []
  const { data } = await supabase
    .from('estrutura_equipes')
    .select('matricula, colaborador')
    .eq('prefixo', prefixo)
    .eq('descr_situacao', 'ATIVO')
    .order('colaborador')
  return data || []
}

async function buscarPorNome(texto) {
  if (!texto || texto.length < 2) return []
  const { data } = await supabase
    .from('estrutura_equipes')
    .select('matricula, colaborador')
    .ilike('colaborador', `%${texto}%`)
    .eq('descr_situacao', 'ATIVO')
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

export default function S1Identificacao({ form, upd, setForm, next, prev, pautaAtiva }) {
  const [gpsLoading,   setGpsLoading]   = useState(false)
  const [gpsErro,      setGpsErro]      = useState('')
  const [fiscalSugs,   setFiscalSugs]   = useState([])
  const [prefixoSugs,  setPrefixoSugs]  = useState([])
  const [elet1Sugs,    setElet1Sugs]    = useState([])
  const [elet2Sugs,    setElet2Sugs]    = useState([])
  const [eletricistas, setEletricistas] = useState([])

  const ok = form.fiscal && form.matricula && form.prefixo && form.os && form.uc && form.lat

  // Pré-preenche OS e UC da pauta ativa se estiverem vazios no form
  useEffect(() => {
    if (!pautaAtiva) return
    if (pautaAtiva.os  && !form.os)  upd('os',  pautaAtiva.os)
    if (pautaAtiva.uc  && !form.uc)  upd('uc',  pautaAtiva.uc)
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

  const onPrefixoChange = async v => {
    upd('prefixo', v)
    const sugs = await buscarPrefixos(v)
    setPrefixoSugs(sugs)
  }
  const onPrefixoSelect = v => {
    upd('prefixo', v)
    setPrefixoSugs([])
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

      <AutocompleteInput
        label="Prefixo da Equipe"
        value={form.prefixo}
        onChange={onPrefixoChange}
        onSelect={onPrefixoSelect}
        suggestions={prefixoSugs}
        placeholder="Digite o prefixo (ex: PI-AGB)"
        required
        info={eletricistas.length > 0 ? `✅ ${eletricistas.length} eletricista(s) nesta equipe` : ''}
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

      <div style={{ height: 80 }} />
      <NavBar onPrev={prev} onNext={ok ? next : undefined} nextDisabled={!ok} />
    </div>
  )
}
