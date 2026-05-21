import { useState } from 'react'
import { TIPOS_REGISTRO, MODALIDADES } from '../data/registros_config.js'

export default function R2Identificacao({ form, upd, next, prev }) {
  const [gpsMsg,     setGpsMsg]     = useState('')
  const [geocodando, setGeocodando] = useState(false)
  const tipoConfig = TIPOS_REGISTRO[form.tipo]

  const obterGPS = () => {
    if (!navigator.geolocation) { setGpsMsg('GPS não suportado'); return }
    upd('gpsStatus', 'buscando')
    setGpsMsg('Buscando localização...')

    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        upd('lat', lat)
        upd('lng', lng)
        upd('gpsStatus', 'ok')
        setGpsMsg('')

        // ── Geocodificação reversa — preenche endereço automaticamente ──
        if (!form.endereco) {
          setGeocodando(true)
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=pt-BR`,
              { headers: { 'Accept-Language': 'pt-BR' } }
            )
            const data = await res.json()
            if (data?.address) {
              const a = data.address
              const partes = [
                a.road || a.pedestrian || a.path,
                a.house_number,
                a.suburb || a.neighbourhood || a.quarter,
                a.city || a.town || a.village,
                a.state,
              ].filter(Boolean)
              upd('endereco', partes.join(', '))
            }
          } catch (e) { /* silencioso — não bloqueia o fluxo */ }
          finally { setGeocodando(false) }
        }
      },
      () => {
        upd('gpsStatus', 'erro')
        setGpsMsg('❌ Não foi possível obter GPS')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const podeProsseguir = form.fiscal && form.data && form.hora

  return (
    <div style={{ padding: '0 0 80px' }}>

      {/* Banner tipo */}
      <div style={{
        background: tipoConfig?.bg, border: `1.5px solid ${tipoConfig?.border}`,
        borderRadius: 10, padding: '10px 14px', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 18 }}>{tipoConfig?.emoji}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: tipoConfig?.color }}>
          {tipoConfig?.label}
        </span>
        <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 4 }}>
          · {MODALIDADES[form.modalidade]?.label}
        </span>
      </div>

      <h2 style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', marginBottom: 16 }}>
        Identificação
      </h2>

      {/* Fiscal — read-only */}
      <div className="form-group">
        <label className="form-label">Nome do Fiscal *</label>
        <input className="form-input" value={form.fiscal}
          onChange={e => upd('fiscal', e.target.value.toUpperCase())}
          placeholder="Nome completo do fiscal" />
      </div>

      {/* Matrícula — pré-preenchida do cadastro, editável se necessário */}
      <div className="form-group">
        <label className="form-label">Matrícula do Fiscal</label>
        <input
          className="form-input"
          value={form.matricula_fiscal}
          onChange={e => upd('matricula_fiscal', e.target.value)}
          placeholder="Matrícula"
          inputMode="numeric"
          style={{
            background: form.matricula_fiscal ? '#f0fdf4' : '#fff',
            borderColor: form.matricula_fiscal ? '#86efac' : undefined,
          }}
        />
        {form.matricula_fiscal && (
          <p style={{ fontSize: 11, color: '#16a34a', marginTop: 4 }}>
            ✅ Preenchida automaticamente do seu cadastro
          </p>
        )}
      </div>

      {/* Data e Hora */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="form-group">
          <label className="form-label">Data *</label>
          <input className="form-input" type="date" value={form.data}
            onChange={e => upd('data', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Hora *</label>
          <input className="form-input" type="time" value={form.hora}
            onChange={e => upd('hora', e.target.value)} />
        </div>
      </div>

      {/* Endereço — preenchido automaticamente após GPS */}
      <div className="form-group">
        <label className="form-label">
          Local / Endereço
          {geocodando && <span style={{ fontSize: 11, color: '#2563eb', marginLeft: 8 }}>📍 Buscando endereço...</span>}
        </label>
        <input
          className="form-input"
          value={form.endereco}
          onChange={e => upd('endereco', e.target.value)}
          placeholder="Capture o GPS abaixo para preencher automaticamente"
        />
      </div>

      {/* GPS */}
      <div className="form-group">
        <label className="form-label">GPS</label>
        <button onClick={obterGPS} disabled={form.gpsStatus === 'buscando'} style={{
          width: '100%', padding: '11px', borderRadius: 10,
          border: `1.5px solid ${form.gpsStatus === 'ok' ? '#86efac' : '#e2e8f0'}`,
          background: form.gpsStatus === 'ok' ? '#f0fdf4' : '#f8fafc',
          color: form.gpsStatus === 'ok' ? '#15803d' : '#374151',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>
          {form.gpsStatus === 'buscando' ? '⏳ Buscando...' :
           form.gpsStatus === 'ok'       ? `📍 ${form.lat?.toFixed(5)}, ${form.lng?.toFixed(5)}` :
           '📍 Capturar GPS (preenche endereço automaticamente)'}
        </button>
        {gpsMsg && form.gpsStatus === 'erro' && (
          <p style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>{gpsMsg}</p>
        )}
      </div>

      {/* Navegação */}
      <button onClick={next} disabled={!podeProsseguir} style={{
        width: '100%', padding: 14, borderRadius: 12, border: 'none',
        background: podeProsseguir ? '#1e3a5f' : '#e2e8f0',
        color: podeProsseguir ? '#fff' : '#94a3b8',
        fontSize: 15, fontWeight: 700,
        cursor: podeProsseguir ? 'pointer' : 'not-allowed', marginBottom: 10,
      }}>
        Continuar →
      </button>
      <button onClick={prev} style={{
        width: '100%', padding: 13, borderRadius: 10,
        border: '1px solid #e2e8f0', background: '#f8fafc',
        color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer',
      }}>← Voltar</button>
    </div>
  )
}
