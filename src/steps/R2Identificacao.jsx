import { useState, useEffect } from 'react'
import { TIPOS_REGISTRO, MODALIDADES } from '../data/registros_config.js'

export default function R2Identificacao({ form, upd, next, prev }) {
  const [gpsMsg, setGpsMsg] = useState('')
  const tipoConfig = TIPOS_REGISTRO[form.tipo]

  const obterGPS = () => {
    if (!navigator.geolocation) { setGpsMsg('GPS não suportado'); return }
    upd('gpsStatus', 'buscando')
    setGpsMsg('Buscando localização...')
    navigator.geolocation.getCurrentPosition(
      pos => {
        upd('lat', pos.coords.latitude)
        upd('lng', pos.coords.longitude)
        upd('gpsStatus', 'ok')
        setGpsMsg(`✅ GPS: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`)
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

      {/* Fiscal */}
      <div className="form-group">
        <label className="form-label">Nome do Fiscal *</label>
        <input className="form-input" value={form.fiscal}
          onChange={e => upd('fiscal', e.target.value.toUpperCase())}
          placeholder="Nome completo do fiscal" />
      </div>

      <div className="form-group">
        <label className="form-label">Matrícula do Fiscal</label>
        <input className="form-input" value={form.matricula_fiscal}
          onChange={e => upd('matricula_fiscal', e.target.value)}
          placeholder="Matrícula" inputMode="numeric" />
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
        <label className="form-label">Local / Endereço</label>
        <input className="form-input" value={form.endereco}
          onChange={e => upd('endereco', e.target.value)}
          placeholder="Ex: Sede, nome da rua, bairro..." />
      </div>

      {/* GPS */}
      <div className="form-group">
        <label className="form-label">GPS</label>
        <button onClick={obterGPS} disabled={form.gpsStatus === 'buscando'} style={{
          width: '100%', padding: '11px', borderRadius: 10, border: '1.5px solid #e2e8f0',
          background: form.gpsStatus === 'ok' ? '#f0fdf4' : '#f8fafc',
          color: form.gpsStatus === 'ok' ? '#15803d' : '#374151',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>
          {form.gpsStatus === 'buscando' ? '⏳ Buscando...' :
           form.gpsStatus === 'ok'       ? `📍 ${form.lat?.toFixed(5)}, ${form.lng?.toFixed(5)}` :
           '📍 Capturar localização GPS'}
        </button>
        {gpsMsg && form.gpsStatus === 'erro' && (
          <p style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>{gpsMsg}</p>
        )}
      </div>

      {/* Botões navegação */}
      <button onClick={next} disabled={!podeProsseguir} style={{
        width: '100%', padding: 14, borderRadius: 12, border: 'none',
        background: podeProsseguir ? '#1e3a5f' : '#e2e8f0',
        color: podeProsseguir ? '#fff' : '#94a3b8',
        fontSize: 15, fontWeight: 700, cursor: podeProsseguir ? 'pointer' : 'not-allowed',
        marginBottom: 10,
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
