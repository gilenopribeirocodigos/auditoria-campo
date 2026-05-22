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

        // Geocodificação reversa — preenche endereço automaticamente
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
          } catch (e) { /* silencioso */ }
          finally { setGeocodando(false) }
        }
      },
      () => {
        upd('gpsStatus', 'erro')
        setGpsMsg('❌ Não foi possível obter GPS. Tente novamente.')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // ── GPS é OBRIGATÓRIO — sem ele não avança ─────────────────────────────────
  const gpsOk = form.gpsStatus === 'ok' && form.lat && form.lng
  const podeProsseguir = form.fiscal && form.data && form.hora && gpsOk

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

      {/* Fiscal */}
      <div className="form-group">
        <label className="form-label">Nome do Fiscal *</label>
        <input className="form-input" value={form.fiscal}
          onChange={e => upd('fiscal', e.target.value.toUpperCase())}
          placeholder="Nome completo do fiscal" />
      </div>

      {/* Matrícula */}
      <div className="form-group">
        <label className="form-label">Matrícula do Fiscal</label>
        <input className="form-input" value={form.matricula_fiscal}
          onChange={e => upd('matricula_fiscal', e.target.value)}
          placeholder="Matrícula" inputMode="numeric"
          style={{ background: form.matricula_fiscal ? '#f0fdf4' : '#fff', borderColor: form.matricula_fiscal ? '#86efac' : undefined }}
        />
        {form.matricula_fiscal && (
          <p style={{ fontSize: 11, color: '#16a34a', marginTop: 4 }}>✅ Preenchida automaticamente do seu cadastro</p>
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

      {/* Endereço */}
      <div className="form-group">
        <label className="form-label">
          Local / Endereço
          {geocodando && <span style={{ fontSize: 11, color: '#2563eb', marginLeft: 8 }}>📍 Buscando endereço...</span>}
        </label>
        <input className="form-input" value={form.endereco}
          onChange={e => upd('endereco', e.target.value)}
          placeholder="Capture o GPS abaixo para preencher automaticamente" />
      </div>

      {/* GPS — OBRIGATÓRIO */}
      <div className="form-group">
        <label className="form-label">
          GPS <span style={{ color: '#dc2626', fontWeight: 700 }}>*</span>
          <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6, fontWeight: 400 }}>(obrigatório)</span>
        </label>
        <button onClick={obterGPS} disabled={form.gpsStatus === 'buscando'} style={{
          width: '100%', padding: '13px', borderRadius: 10,
          border: `2px solid ${gpsOk ? '#86efac' : form.gpsStatus === 'erro' ? '#fca5a5' : '#f59e0b'}`,
          background: gpsOk ? '#f0fdf4' : form.gpsStatus === 'erro' ? '#fef2f2' : '#fffbeb',
          color: gpsOk ? '#15803d' : form.gpsStatus === 'erro' ? '#dc2626' : '#92400e',
          fontSize: 14, fontWeight: 700, cursor: form.gpsStatus === 'buscando' ? 'not-allowed' : 'pointer',
        }}>
          {form.gpsStatus === 'buscando' ? '⏳ Buscando localização...' :
           gpsOk ? `✅ GPS capturado: ${form.lat?.toFixed(5)}, ${form.lng?.toFixed(5)}` :
           form.gpsStatus === 'erro' ? '❌ Erro — toque para tentar novamente' :
           '📍 Toque aqui para capturar o GPS (obrigatório)'}
        </button>
        {!gpsOk && form.gpsStatus !== 'buscando' && (
          <p style={{ fontSize: 12, color: '#d97706', marginTop: 6, fontWeight: 600 }}>
            ⚠️ Capture o GPS antes de continuar
          </p>
        )}
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
        cursor: podeProsseguir ? 'pointer' : 'not-allowed',
        marginBottom: 10,
      }}>
        {podeProsseguir ? 'Continuar →' : !gpsOk ? '📍 Capture o GPS para continuar' : 'Preencha os campos obrigatórios'}
      </button>
      <button onClick={prev} style={{
        width: '100%', padding: 13, borderRadius: 10,
        border: '1px solid #e2e8f0', background: '#f8fafc',
        color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer',
      }}>← Voltar</button>
    </div>
  )
}
