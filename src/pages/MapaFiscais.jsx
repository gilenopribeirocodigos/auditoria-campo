import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'

export default function MapaFiscais({ usuarioLogado, onVoltar }) {
  const mapRef        = useRef(null)
  const leafletMap    = useRef(null)
  const marcadores    = useRef({})
  const rotas         = useRef({})
  const [fiscaisAtivos, setFiscaisAtivos] = useState([])
  const [loading,       setLoading]       = useState(true)
  const [modoHistorico, setModoHistorico] = useState(false)
  const [dataHistorico, setDataHistorico] = useState(new Date().toISOString().split('T')[0])
  const [fiscalHistorico, setFiscalHistorico] = useState('')
  const [fiscais,       setFiscais]       = useState([])

  // Cores por fiscal
  const CORES = ['#2563eb','#dc2626','#16a34a','#d97706','#7c3aed','#0891b2','#be185d']
  const corFiscal = (login) => {
    const idx = fiscais.findIndex(f => f.login === login)
    return CORES[idx % CORES.length] || '#374151'
  }

  useEffect(() => {
    // Carrega lista de fiscais
    supabase.from('usuarios').select('nome, login')
      .eq('status', 'ATIVO').order('nome')
      .then(({ data }) => setFiscais(data || []))
  }, [])

  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return

    // Inicializa o mapa
    const L = window.L
    if (!L) return

    leafletMap.current = L.map(mapRef.current).setView([-5.08, -42.80], 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    }).addTo(leafletMap.current)

    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove()
        leafletMap.current = null
      }
    }
  }, [])

  // Tempo real
  useEffect(() => {
    if (modoHistorico) return
    carregarPosicoes()
    const interval = setInterval(carregarPosicoes, 10000)
    return () => clearInterval(interval)
  }, [modoHistorico, fiscais])

  const carregarPosicoes = async () => {
    const L = window.L
    if (!L || !leafletMap.current) return

    // Últimas posições de cada fiscal (últimos 2 minutos)
    const limite = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from('localizacoes')
      .select('*')
      .gte('created_at', limite)
      .order('created_at', { ascending: false })

    if (!data) { setLoading(false); return }

    // Última posição por fiscal
    const ultimas = {}
    data.forEach(p => {
      if (!ultimas[p.fiscal_login]) ultimas[p.fiscal_login] = p
    })

    const ativos = Object.values(ultimas)
    setFiscaisAtivos(ativos)
    setLoading(false)

    // Atualiza marcadores
    ativos.forEach(p => {
      const cor = corFiscal(p.fiscal_login)
      const icon = L.divIcon({
        html: `<div style="
          background:${cor};color:#fff;border-radius:50%;
          width:36px;height:36px;display:flex;align-items:center;
          justify-content:center;font-size:11px;font-weight:700;
          border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);
          text-align:center;line-height:1.2;
        ">${p.fiscal_nome?.split(' ')[0]?.substring(0, 6) || '?'}</div>`,
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      })

      if (marcadores.current[p.fiscal_login]) {
        marcadores.current[p.fiscal_login].setLatLng([p.lat, p.lng])
      } else {
        const marker = L.marker([p.lat, p.lng], { icon })
          .addTo(leafletMap.current)
          .bindPopup(`
            <strong>${p.fiscal_nome}</strong><br/>
            📍 ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}<br/>
            🕐 ${new Date(p.created_at).toLocaleTimeString('pt-BR')}<br/>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}"
              target="_blank" style="color:#2563eb;font-weight:700">
              🗺️ Traçar rota até aqui
            </a>
          `)
        marcadores.current[p.fiscal_login] = marker
      }
    })

    // Remove fiscais que saíram
    Object.keys(marcadores.current).forEach(login => {
      if (!ultimas[login]) {
        marcadores.current[login].remove()
        delete marcadores.current[login]
      }
    })
  }

  const verHistorico = async () => {
    const L = window.L
    if (!L || !leafletMap.current || !fiscalHistorico || !dataHistorico) return

    // Limpa marcadores e rotas existentes
    Object.values(marcadores.current).forEach(m => m.remove())
    marcadores.current = {}
    Object.values(rotas.current).forEach(r => r.remove())
    rotas.current = {}

    const ini = `${dataHistorico}T00:00:00`
    const fim = `${dataHistorico}T23:59:59`

    const { data } = await supabase
      .from('localizacoes')
      .select('*')
      .eq('fiscal_login', fiscalHistorico)
      .gte('created_at', ini)
      .lte('created_at', fim)
      .order('created_at', { ascending: true })

    if (!data || data.length === 0) {
      alert('Nenhuma posição encontrada para este fiscal nesta data.')
      return
    }

    const cor = corFiscal(fiscalHistorico)
    const pontos = data.map(p => [p.lat, p.lng])

    // Desenha a linha da rota
    const linha = L.polyline(pontos, { color: cor, weight: 4, opacity: 0.8 })
      .addTo(leafletMap.current)
    rotas.current[fiscalHistorico] = linha

    // Marcador de início
    L.marker(pontos[0], {
      icon: L.divIcon({
        html: `<div style="background:#16a34a;color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:16px;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3)">▶</div>`,
        className: '', iconSize: [32, 32], iconAnchor: [16, 16],
      })
    }).addTo(leafletMap.current).bindPopup(`Início: ${new Date(data[0].created_at).toLocaleTimeString('pt-BR')}`)
    
    // Marcador de fim
    L.marker(pontos[pontos.length - 1], {
      icon: L.divIcon({
        html: `<div style="background:#dc2626;color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:16px;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3)">■</div>`,
        className: '', iconSize: [32, 32], iconAnchor: [16, 16],
      })
    }).addTo(leafletMap.current).bindPopup(`Fim: ${new Date(data[data.length - 1].created_at).toLocaleTimeString('pt-BR')}`)

    leafletMap.current.fitBounds(linha.getBounds(), { padding: [40, 40] })
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', padding: '14px 20px', color: '#fff' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            padding: '6px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 10,
          }}>← Voltar para Home</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 800 }}>📍 Fiscais em Campo</h1>
              <p style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
                {modoHistorico ? 'Histórico de rota' : `${fiscaisAtivos.length} fiscal(is) ativo(s) — atualiza a cada 10s`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setModoHistorico(false); carregarPosicoes() }} style={{
                padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 700,
                background: !modoHistorico ? '#fff' : 'rgba(255,255,255,0.2)',
                color: !modoHistorico ? '#1e3a5f' : '#fff',
              }}>🔴 Ao Vivo</button>
              <button onClick={() => setModoHistorico(true)} style={{
                padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 700,
                background: modoHistorico ? '#fff' : 'rgba(255,255,255,0.2)',
                color: modoHistorico ? '#1e3a5f' : '#fff',
              }}>📅 Histórico</button>
            </div>
          </div>

          {/* Filtro histórico */}
          {modoHistorico && (
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: 11, opacity: 0.8, display: 'block', marginBottom: 4 }}>Fiscal</label>
                <select value={fiscalHistorico} onChange={e => setFiscalHistorico(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: 'none', fontSize: 13, minWidth: 180 }}>
                  <option value="">Selecione...</option>
                  {fiscais.map(f => <option key={f.login} value={f.login}>{f.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, opacity: 0.8, display: 'block', marginBottom: 4 }}>Data</label>
                <input type="date" value={dataHistorico} onChange={e => setDataHistorico(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: 'none', fontSize: 13 }} />
              </div>
              <button onClick={verHistorico} style={{
                padding: '8px 16px', background: '#f59e0b', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>🗺️ Ver Rota</button>
            </div>
          )}
        </div>
      </div>

      {/* Fiscais ativos ao vivo */}
      {!modoHistorico && fiscaisAtivos.length > 0 && (
        <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '10px 20px', overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: 10, maxWidth: 900, margin: '0 auto' }}>
            {fiscaisAtivos.map(f => (
              <div key={f.fiscal_login} onClick={() => {
                if (leafletMap.current && marcadores.current[f.fiscal_login]) {
                  leafletMap.current.setView([f.lat, f.lng], 15)
                  marcadores.current[f.fiscal_login].openPopup()
                }
              }} style={{
                background: '#f0f9ff', border: `2px solid ${corFiscal(f.fiscal_login)}`,
                borderRadius: 10, padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: corFiscal(f.fiscal_login) }}>
                  {f.fiscal_nome?.split(' ')[0]}
                </div>
                <div style={{ fontSize: 10, color: '#64748b' }}>
                  {new Date(f.created_at).toLocaleTimeString('pt-BR')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mapa */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 20, color: '#64748b', fontSize: 13 }}>
          ⏳ Carregando mapa...
        </div>
      )}

      <div ref={mapRef} style={{ flex: 1, minHeight: 500 }} />

      {/* Sem fiscais */}
      {!loading && !modoHistorico && fiscaisAtivos.length === 0 && (
        <div style={{
          position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          background: '#fff', borderRadius: 12, padding: '12px 20px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)', fontSize: 13, color: '#64748b', textAlign: 'center',
        }}>
          📭 Nenhum fiscal ativo no momento
        </div>
      )}
    </div>
  )
}
