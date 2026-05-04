import { useEffect, useState } from 'react'
import { NavBar, Alert } from '../components/Shared.jsx'

export default function S2GPS({ form, upd, setForm, next, prev }) {
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  const capturar = () => {
    if (!navigator.geolocation) {
      setErro('GPS não disponível neste dispositivo.')
      return
    }
    setLoading(true)
    setErro('')
    navigator.geolocation.getCurrentPosition(
      pos => {
        setForm(f => ({
          ...f,
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
          gpsStatus: 'ok',
        }))
        setLoading(false)
      },
      err => {
        setErro('Não foi possível obter GPS. Verifique as permissões do navegador.')
        console.warn('GPS error:', err.message)
        setLoading(false)
      },
      { timeout: 12000, enableHighAccuracy: true }
    )
  }

  useEffect(() => {
    if (form.gpsStatus === 'idle') capturar()
  }, [])

  return (
    <div>
      <div className="gps-card">
        {loading && (
          <>
            <div style={{ fontSize: 44, marginBottom: 12 }}>📡</div>
            <p style={{ color: '#64748b', fontSize: 14 }}>Capturando localização...</p>
            <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>Aguarde, buscando sinal GPS</p>
          </>
        )}

        {!loading && form.lat && (
          <>
            <div style={{ fontSize: 44, marginBottom: 12 }}>📍</div>
            <p style={{ color: '#16a34a', fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
              Localização Capturada
            </p>
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px', textAlign: 'left', fontSize: 13 }}>
              <div style={{ marginBottom: 4 }}><strong>Latitude:</strong> {form.lat}</div>
              <div style={{ marginBottom: 4 }}><strong>Longitude:</strong> {form.lng}</div>
              <div style={{ marginBottom: 4 }}><strong>Data:</strong> {form.data}</div>
              <div><strong>Hora:</strong> {form.hora}</div>
            </div>
          </>
        )}

        {!loading && !form.lat && (
          <>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🗺️</div>
            <p style={{ color: '#374151', fontSize: 14 }}>GPS ainda não capturado</p>
          </>
        )}

        {erro && (
          <div className="alert alert-danger" style={{ marginTop: 12, textAlign: 'left' }}>
            {erro}
          </div>
        )}

        <button className="btn-primary" onClick={capturar}
          style={{ marginTop: 16, maxWidth: 200, margin: '16px auto 0' }}>
          {form.lat ? '🔄 Recapturar GPS' : '📍 Capturar GPS'}
        </button>
      </div>

      <Alert type="warning">
        ⚠️ O GPS registra sua localização como evidência da presença em campo. Será incluído no relatório final da auditoria.
      </Alert>

      <div style={{ height: 80 }} />
      <NavBar
        onPrev={prev}
        onNext={next}
        nextLabel={form.lat ? 'Continuar →' : 'Pular GPS →'}
      />
    </div>
  )
}
