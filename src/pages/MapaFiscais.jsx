import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  useFiltrosOperacionais,
  PainelFiltros,
} from '../components/PainelFiltros.jsx'

// Janela em que consideramos o fiscal "ativo agora" (verde) vs "ausente" (cinza)
const ATIVO_MS    = 2 * 60 * 1000    // até 2 min = ativo
const PRESENCA_MS = 60 * 60 * 1000   // mostra presença das últimas 1h

// Formata "há X" a partir de um timestamp
function tempoDesde(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const seg = Math.floor(diff / 1000)
  if (seg < 60)  return `há ${seg}s`
  const min = Math.floor(seg / 60)
  if (min < 60)  return `há ${min} min`
  const h = Math.floor(min / 60)
  return `há ${h}h ${min % 60}min`
}

export default function MapaFiscais({ usuarioLogado, onVoltar }) {
  const mapRef     = useRef(null)
  const leafletMap = useRef(null)
  const marcadores = useRef({})
  const rotas      = useRef({})

  const filtros = useFiltrosOperacionais({ inicializarMes: false, usuarioLogado })

  const [presencas,       setPresencas]       = useState([])   // fiscais_presenca (última 1h)
  const [loading,         setLoading]         = useState(true)
  const [modoHistorico,   setModoHistorico]   = useState(false)
  const [dataHistorico,   setDataHistorico]   = useState(new Date().toISOString().split('T')[0])
  const [fiscalHistorico, setFiscalHistorico] = useState('')
  const [fiscais,         setFiscais]         = useState([])
  const [agora,           setAgora]           = useState(Date.now())  // tick pra recalcular "há X min"

  const CORES = ['#2563eb','#dc2626','#16a34a','#d97706','#7c3aed','#0891b2','#be185d']
  const corFiscal = (login) => {
    const idx = fiscais.findIndex(f => f.login === login)
    return CORES[idx % CORES.length] || '#374151'
  }

  // Um fiscal está "ativo agora" se foi visto nos últimos ATIVO_MS
  const estaAtivo = (ultimoVisto) => (Date.now() - new Date(ultimoVisto).getTime()) <= ATIVO_MS

  // ─── Supervisores permitidos (segregação + filtros) ───
  const supervisoresAlvo = useMemo(() => {
    const filtroAtivo =
      filtros.selRegional.length > 0 ||
      filtros.selSupOp.length    > 0 ||
      filtros.selSupCampo.length > 0 ||
      filtros.selPrefixos.length > 0

    if (!filtroAtivo) {
      if (!filtros.prefixosPermitidos) return null
      const set = new Set()
      filtros.prefixosPermitidos.forEach(pref => {
        const info = filtros.mapPrefixo[pref]
        if (info?.campo) set.add(info.campo.toLowerCase())
      })
      return set.size > 0 ? set : null
    }

    const set = new Set()
    Object.entries(filtros.mapPrefixo).forEach(([pref, info]) => {
      if (filtros.selRegional.length > 0 && !filtros.selRegional.includes(info.regional)) return
      if (filtros.selSupOp.length    > 0 && !filtros.selSupOp.includes(info.op))       return
      if (filtros.selSupCampo.length > 0 && !filtros.selSupCampo.includes(info.campo)) return
      if (filtros.selPrefixos.length > 0 && !filtros.selPrefixos.includes(pref))       return
      if (info.campo) set.add(info.campo.toLowerCase())
    })
    return set
  }, [filtros.selRegional, filtros.selSupOp, filtros.selSupCampo, filtros.selPrefixos, filtros.mapPrefixo, filtros.prefixosPermitidos])

  const fiscalPermitido = (nome) => {
    if (!supervisoresAlvo) return true
    if (!nome) return false
    const nomeLower = nome.trim().toLowerCase()
    for (const sup of supervisoresAlvo) {
      if (nomeLower.includes(sup) || sup.includes(nomeLower)) return true
    }
    return false
  }

  // ─── Presenças filtradas por hierarquia ───
  const presencasFiltradas = useMemo(() => {
    return presencas.filter(p => fiscalPermitido(p.fiscal_nome))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presencas, supervisoresAlvo])

  // Separa ativos (verde) de ausentes (cinza) — usa `agora` pra recalcular
  const { ativos, ausentes } = useMemo(() => {
    const a = [], au = []
    presencasFiltradas.forEach(p => (estaAtivo(p.ultimo_visto) ? a : au).push(p))
    return { ativos: a, ausentes: au }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presencasFiltradas, agora])

  const fiscaisDropdown = useMemo(() => {
    return fiscais.filter(f => fiscalPermitido(f.nome))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscais, supervisoresAlvo])

  // ─── Lista de fiscais (1x) ───
  useEffect(() => {
    supabase.from('usuarios').select('nome, login')
      .eq('status', 'ATIVO').order('nome')
      .then(({ data }) => setFiscais(data || []))
  }, [])

  // ─── Inicializa Leaflet ───
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return
    const L = window.L
    if (!L) return
    leafletMap.current = L.map(mapRef.current).setView([-5.08, -42.80], 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    }).addTo(leafletMap.current)
    return () => {
      if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null }
    }
  }, [])

  // ─── Busca presença (tabela fiscais_presenca, última 1h) ───
  const buscarPresencas = async () => {
    const limite = new Date(Date.now() - PRESENCA_MS).toISOString()
    const { data } = await supabase
      .from('fiscais_presenca').select('*')
      .gte('ultimo_visto', limite)
      .order('ultimo_visto', { ascending: false })
    setPresencas(data || [])
    setLoading(false)
  }

  const buscarRef = useRef(buscarPresencas)
  useEffect(() => { buscarRef.current = buscarPresencas })

  // Polling a cada 5s + tick de 1s pra atualizar "há X min" sem refazer query
  useEffect(() => {
    if (modoHistorico) return
    buscarRef.current()
    const interval = setInterval(() => buscarRef.current(), 5000)
    const tick     = setInterval(() => setAgora(Date.now()), 1000)
    return () => { clearInterval(interval); clearInterval(tick) }
  }, [modoHistorico])

  // ─── Sincroniza marcadores (ativos + ausentes com estilos distintos) ───
  useEffect(() => {
    if (modoHistorico) return
    const L = window.L
    if (!L || !leafletMap.current) return

    const visiveis = [...ativos, ...ausentes]
    const loginsVisiveis = new Set(visiveis.map(p => p.fiscal_login))

    visiveis.forEach(p => {
      const ativo = estaAtivo(p.ultimo_visto)
      const cor   = ativo ? corFiscal(p.fiscal_login) : '#94a3b8'  // cinza se ausente
      const opacidade = ativo ? 1 : 0.65
      const nome  = p.fiscal_nome?.split(' ')[0]?.substring(0, 6) || '?'

      const htmlIcon = `<div style="
        background:${cor};color:#fff;border-radius:50%;
        width:36px;height:36px;display:flex;align-items:center;
        justify-content:center;font-size:11px;font-weight:700;
        border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);
        text-align:center;line-height:1.2;opacity:${opacidade};
      ">${nome}</div>`

      const popupHtml = `
        <strong>${p.fiscal_nome}</strong><br/>
        ${ativo
          ? '<span style="color:#16a34a;font-weight:700">🟢 Ativo agora</span>'
          : `<span style="color:#94a3b8;font-weight:700">⚪ Visto ${tempoDesde(p.ultimo_visto)}</span>`}
        <br/>
        📍 ${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}<br/>
        🕐 ${new Date(p.ultimo_visto).toLocaleTimeString('pt-BR')}<br/>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}"
          target="_blank" style="color:#2563eb;font-weight:700">
          🗺️ Traçar rota até aqui
        </a>`

      if (marcadores.current[p.fiscal_login]) {
        const m = marcadores.current[p.fiscal_login]
        m.setLatLng([p.lat, p.lng])
        m.setIcon(L.divIcon({ html: htmlIcon, className: '', iconSize: [36, 36], iconAnchor: [18, 18] }))
        m.setPopupContent(popupHtml)
      } else {
        const marker = L.marker([p.lat, p.lng], {
          icon: L.divIcon({ html: htmlIcon, className: '', iconSize: [36, 36], iconAnchor: [18, 18] }),
        }).addTo(leafletMap.current).bindPopup(popupHtml)
        marcadores.current[p.fiscal_login] = marker
      }
    })

    // Remove marcadores de quem saiu da janela de 1h ou foi filtrado
    Object.keys(marcadores.current).forEach(login => {
      if (!loginsVisiveis.has(login)) {
        marcadores.current[login].remove()
        delete marcadores.current[login]
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativos, ausentes, modoHistorico])

  // ─── Limpa marcadores ao entrar no histórico ───
  useEffect(() => {
    if (!modoHistorico) return
    Object.values(marcadores.current).forEach(m => m.remove())
    marcadores.current = {}
  }, [modoHistorico])

  useEffect(() => {
    if (!fiscalHistorico) return
    if (!fiscaisDropdown.some(f => f.login === fiscalHistorico)) setFiscalHistorico('')
  }, [fiscaisDropdown, fiscalHistorico])

  // ─── Ver histórico (trilha da tabela localizacoes) ───
  const verHistorico = async () => {
    const L = window.L
    if (!L || !leafletMap.current || !fiscalHistorico || !dataHistorico) return

    Object.values(marcadores.current).forEach(m => m.remove())
    marcadores.current = {}
    Object.values(rotas.current).forEach(r => r.remove())
    rotas.current = {}

    const ini = `${dataHistorico}T00:00:00`
    const fim = `${dataHistorico}T23:59:59`

    const { data } = await supabase
      .from('localizacoes').select('*')
      .eq('fiscal_login', fiscalHistorico)
      .gte('created_at', ini).lte('created_at', fim)
      .order('created_at', { ascending: true })

    if (!data || data.length === 0) {
      alert('Nenhuma posição encontrada para este fiscal nesta data.')
      return
    }

    const cor = corFiscal(fiscalHistorico)
    const pontos = data.map(p => [p.lat, p.lng])

    const linha = L.polyline(pontos, { color: cor, weight: 4, opacity: 0.8 }).addTo(leafletMap.current)
    rotas.current[fiscalHistorico] = linha

    L.marker(pontos[0], {
      icon: L.divIcon({
        html: `<div style="background:#16a34a;color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:16px;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3)">▶</div>`,
        className: '', iconSize: [32, 32], iconAnchor: [16, 16],
      })
    }).addTo(leafletMap.current).bindPopup(`Início: ${new Date(data[0].created_at).toLocaleTimeString('pt-BR')}`)

    L.marker(pontos[pontos.length - 1], {
      icon: L.divIcon({
        html: `<div style="background:#dc2626;color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:16px;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3)">■</div>`,
        className: '', iconSize: [32, 32], iconAnchor: [16, 16],
      })
    }).addTo(leafletMap.current).bindPopup(`Fim: ${new Date(data[data.length - 1].created_at).toLocaleTimeString('pt-BR')}`)

    leafletMap.current.fitBounds(linha.getBounds(), { padding: [40, 40] })
  }

  const filtroHierarquicoAtivo = supervisoresAlvo !== null

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #059669, #065f46)', padding: '14px 20px', color: '#fff' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            padding: '6px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 10,
          }}>← Voltar para Home</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 800 }}>📍 Fiscais em Campo</h1>
              <p style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
                {modoHistorico
                  ? 'Histórico de rota'
                  : `${ativos.length} ativo(s) · ${ausentes.length} visto(s) na última hora — atualiza a cada 5s`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setModoHistorico(false)} style={{
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

          {modoHistorico && (
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: 11, opacity: 0.85, display: 'block', marginBottom: 4 }}>
                  Fiscal {filtroHierarquicoAtivo && `(${fiscaisDropdown.length} dos filtros)`}
                </label>
                <select value={fiscalHistorico} onChange={e => setFiscalHistorico(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: 'none', fontSize: 13, minWidth: 200 }}>
                  <option value="">Selecione...</option>
                  {fiscaisDropdown.map(f => <option key={f.login} value={f.login}>{f.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, opacity: 0.85, display: 'block', marginBottom: 4 }}>Data</label>
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

      {/* Painel de filtros */}
      <div style={{
        maxWidth: 900, margin: '0 auto', width: '100%',
        padding: '12px 16px 0', boxSizing: 'border-box',
        position: 'relative', zIndex: 1000,
      }}>
        <PainelFiltros
          filtros={filtros}
          titulo="🔍 Filtros do Mapa"
          badge={modoHistorico ? 'filtra a lista de fiscais' : 'filtra fiscais visíveis'}
          mostrarMesPeriodo={false}
        />
        {filtros.temSegregacao && (
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#065f46',
            background: '#d1fae5', border: '1px solid #6ee7b7',
            borderRadius: 8, padding: '4px 12px', marginTop: -8, marginBottom: 8,
            display: 'inline-block',
          }}>
            🔒 Sua estrutura ({filtros.prefixosPermitidos?.length || 0} prefixos)
          </div>
        )}
      </div>

      {/* Aviso quando filtro esconde resultados */}
      {filtroHierarquicoAtivo && !modoHistorico && presencasFiltradas.length === 0 && presencas.length > 0 && (
        <div style={{ maxWidth: 900, margin: '0 auto', width: '100%', padding: '0 16px 12px', boxSizing: 'border-box' }}>
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#c2410c', fontWeight: 600 }}>
            ⚠️ {presencas.length} fiscal(is) com presença recente, mas nenhum bate com os filtros selecionados.
          </div>
        </div>
      )}

      {/* Cards de fiscais (ativos + ausentes) */}
      {!modoHistorico && presencasFiltradas.length > 0 && (
        <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '10px 20px', overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: 10, maxWidth: 900, margin: '0 auto' }}>
            {[...ativos, ...ausentes].map(f => {
              const ativo = estaAtivo(f.ultimo_visto)
              const cor   = ativo ? corFiscal(f.fiscal_login) : '#94a3b8'
              return (
                <div key={f.fiscal_login} onClick={() => {
                  if (leafletMap.current && marcadores.current[f.fiscal_login]) {
                    leafletMap.current.setView([f.lat, f.lng], 15)
                    marcadores.current[f.fiscal_login].openPopup()
                  }
                }} style={{
                  background: ativo ? '#f0f9ff' : '#f8fafc',
                  border: `2px solid ${cor}`,
                  borderRadius: 10, padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap',
                  opacity: ativo ? 1 : 0.75,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: cor, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {ativo ? '🟢' : '⚪'} {f.fiscal_nome?.split(' ')[0]}
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>
                    {ativo ? new Date(f.ultimo_visto).toLocaleTimeString('pt-BR') : tempoDesde(f.ultimo_visto)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 20, color: '#64748b', fontSize: 13 }}>
          ⏳ Carregando mapa...
        </div>
      )}

      <div ref={mapRef} style={{ flex: 1, minHeight: 500 }} />

      {/* Sem fiscais */}
      {!loading && !modoHistorico && presencasFiltradas.length === 0 && !filtroHierarquicoAtivo && (
        <div style={{
          position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          background: '#fff', borderRadius: 12, padding: '12px 20px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)', fontSize: 13, color: '#64748b', textAlign: 'center', zIndex: 1000,
        }}>
          📭 Nenhum fiscal com presença na última hora
        </div>
      )}
    </div>
  )
}
