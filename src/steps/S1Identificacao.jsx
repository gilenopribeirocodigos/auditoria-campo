import { useState } from 'react'
import { Field, NavBar, Alert } from '../components/Shared.jsx'

// Reverse geocoding via Nominatim (OpenStreetMap) — gratuito, sem API key
async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=pt-BR`
    const res = await fetch(url, { headers: { 'User-Agent': 'AuditoriaCampoDPL/1.0' } })
    const data = await res.json()
    // Monta endereço resumido
    const r = data.address || {}
    const partes = [r.road, r.house_number, r.suburb || r.neighbourhood, r.city || r.town || r.village, r.state]
    return partes.filter(Boolean).join(', ')
  } catch {
    return ''
  }
}

export default function S1Identificacao({ form, upd, setForm, next, prev }) {
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsErro, setGpsErro] = useState('')

  const ok = form.fiscal && form.matricula && form.prefixo && form.os && form.uc

  const capturarGPS = () => {
    if (!navigator.geolocation) { setGpsErro('GPS não disponível neste dispositivo.'); return }
    setGpsLoading(true)
    setGpsErro('')
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = pos.coords.latitude.toFixed(6)
        const lng = pos.coords.longitude.toFixed(6)
        // Busca endereço automaticamente pela coordenada
        const endAuto = await reverseGeocode(lat, lng)
        setForm(f => ({
          ...f,
          lat,
          lng,
          gpsStatus: 'ok',
          endereco: endAuto || f.endereco,
        }))
        setGpsLoading(false)
      },
      err => {
        setGpsErro('Não foi possível obter GPS. Verifique as permissões.')
        console.warn('GPS:', err.message)
        setGpsLoading(false)
      },
      { timeout: 12000, enableHighAccuracy: true }
    )
  }

  return (
    <div>
      {/* DADOS DO FISCAL */}
      <p className="section-title">Dados do Fiscal</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Data" value={form.data} onChange={v => upd('data', v)} type="date" />
        <Field label="Hora" value={form.hora} onChange={v => upd('hora', v)} type="time" />
      </div>
      <Field label="Nome do Fiscal" value={form.fiscal} onChange={v => upd('fiscal', v)} placeholder="Nome completo" required />
      <Field label="Matrícula" value={form.matricula} onChange={v => upd('matricula', v)} placeholder="Ex: 12345" required />

      {/* DADOS DO SERVIÇO */}
      <p className="section-title" style={{ marginTop: 18 }}>Dados do Serviço</p>
      <Field label="Prefixo da Equipe" value={form.prefixo} onChange={v => upd('prefixo', v)} placeholder="Ex: PI-001" required />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Nº da OS" value={form.os} onChange={v => upd('os', v)} placeholder="Ordem de Serviço" required />
        <Field label="Nº da UC" value={form.uc} onChange={v => upd('uc', v)} placeholder="Unidade Consumidora" required />
      </div>

      {/* LOCALIZAÇÃO — GPS + Endereço automático */}
      <p className="section-title" style={{ marginTop: 18 }}>Localização</p>

      <button
        onClick={capturarGPS}
        disabled={gpsLoading}
        style={{
          width: '100%', padding: '13px', borderRadius: 10, marginBottom: 12,
          background: form.lat ? '#f0fdf4' : '#eff6ff',
          border: `1.5px solid ${form.lat ? '#86efac' : '#93c5fd'}`,
          color: form.lat ? '#15803d' : '#1d4ed8',
          fontWeight: 700, fontSize: 14, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        {gpsLoading
          ? '📡 Capturando GPS...'
          : form.lat
            ? `📍 GPS capturado — ${form.lat}, ${form.lng}`
            : '📍 Capturar GPS e Endereço Automático'}
      </button>

      {gpsErro && <div className="alert alert-danger" style={{ marginBottom: 10 }}>{gpsErro}</div>}

      {/* Endereço — preenchido automaticamente pelo GPS ou manualmente */}
      <div className="form-group">
        <label className="form-label">
          Endereço {form.lat && <span style={{ color: '#16a34a', fontSize: 10 }}>✓ preenchido pelo GPS</span>}
        </label>
        <input
          type="text"
          value={form.endereco}
          onChange={e => upd('endereco', e.target.value)}
          placeholder="Clique em Capturar GPS ou preencha manualmente"
          className="form-input"
        />
      </div>

      {/* Card com lat/lng quando capturado */}
      {form.lat && (
        <div style={{
          background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10,
          padding: '10px 14px', marginBottom: 14, fontSize: 12,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div><span style={{ color: '#64748b' }}>Latitude:</span><br /><strong style={{ color: '#15803d' }}>{form.lat}</strong></div>
            <div><span style={{ color: '#64748b' }}>Longitude:</span><br /><strong style={{ color: '#15803d' }}>{form.lng}</strong></div>
          </div>
        </div>
      )}

      <Alert type="warning">
        ⚠️ O GPS captura latitude, longitude e endereço automaticamente como evidência. Clique antes de prosseguir.
      </Alert>

      <div style={{ height: 80 }} />
      <NavBar onPrev={prev} onNext={ok ? next : undefined} nextDisabled={!ok} />
    </div>
  )
}
