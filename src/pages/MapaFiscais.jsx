import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import { isAdmin, temPermissao } from '../lib/auth.js'
import {
  useFiltrosOperacionais,
  PainelFiltros,
} from '../components/PainelFiltros.jsx'

// Janela em que consideramos o fiscal "ativo agora" (verde) vs "ausente" (cinza)
const ATIVO_MS    = 2 * 60 * 1000    // até 2 min = ativo
const PRESENCA_MS = 60 * 60 * 1000   // mostra presença das últimas 1h

// Se o intervalo entre duas posições consecutivas passar disso, tratamos como
// "sem sinal" (app fechado/sem internet) em vez de contar como fora da base —
// bem acima do ciclo normal de captura (8s em primeiro plano, ~20s em segundo
// plano no app Android), então só dispara em silêncio real.
const GAP_SEM_DADO_MS = 5 * 60 * 1000

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

function formatarDuracao(ms) {
  const min = Math.round(ms / 60000)
  if (min < 1) return 'menos de 1min'
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  const restoMin = min % 60
  return restoMin > 0 ? `${h}h${String(restoMin).padStart(2, '0')}min` : `${h}h`
}

function formatarDataBR(dataISO) {
  if (!dataISO) return ''
  const [ano, mes, dia] = dataISO.split('-')
  return `${dia}/${mes}/${ano}`
}

// ─── Geofencing: distância em km entre duas coordenadas (Haversine) ─────────
function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// Classifica uma posição contra a base mais próxima cadastrada
function baseMaisProxima(lat, lng, bases) {
  let melhor = null
  let melhorDist = Infinity
  ;(bases || []).forEach(b => {
    const d = distanciaKm(Number(lat), Number(lng), Number(b.latitude), Number(b.longitude))
    if (d < melhorDist) { melhorDist = d; melhor = b }
  })
  if (!melhor) return { dentro: false, base: null, distanciaKm: null }
  return { dentro: melhorDist <= Number(melhor.raio_km), base: melhor, distanciaKm: melhorDist }
}

// Percorre uma sequência de posições (ordenadas por horário) e soma quanto
// tempo o fiscal passou dentro de base, fora de base, e sem dado (silêncio
// maior que GAP_SEM_DADO_MS entre duas capturas seguidas).
function calcularPermanencia(pontos, bases) {
  const segmentos = []
  let inMs = 0, outMs = 0, nodataMs = 0
  for (let i = 0; i < pontos.length - 1; i++) {
    const atual = pontos[i]
    const proximo = pontos[i + 1]
    const dt = new Date(proximo.created_at).getTime() - new Date(atual.created_at).getTime()
    if (dt <= 0) continue
    if (dt > GAP_SEM_DADO_MS) {
      segmentos.push({ tipo: 'nodata', inicio: atual.created_at, fim: proximo.created_at })
      nodataMs += dt
    } else {
      const classif = baseMaisProxima(atual.lat, atual.lng, bases)
      const tipo = classif.dentro ? 'in' : 'out'
      segmentos.push({ tipo, inicio: atual.created_at, fim: proximo.created_at, baseNome: classif.base?.nome })
      if (tipo === 'in') inMs += dt; else outMs += dt
    }
  }
  return { segmentos, inMs, outMs, nodataMs }
}

// Junta segmentos consecutivos do mesmo tipo/base num único bloco, e depois
// converte esses blocos numa lista de eventos "entrou/saiu/sem sinal" pra log.
function gerarLogEventos(pontos, bases) {
  const { segmentos } = calcularPermanencia(pontos, bases)
  const blocos = []
  segmentos.forEach(seg => {
    const chave = seg.tipo === 'in' ? `in:${seg.baseNome}` : seg.tipo
    const ultimo = blocos[blocos.length - 1]
    if (ultimo && ultimo.chave === chave) {
      ultimo.fim = seg.fim
    } else {
      blocos.push({ chave, tipo: seg.tipo, baseNome: seg.baseNome, inicio: seg.inicio, fim: seg.fim })
    }
  })

  const eventos = []
  blocos.forEach((bloco, i) => {
    if (bloco.tipo === 'in') {
      eventos.push({ tipo: 'in', hora: bloco.inicio, texto: `Entrou na ${bloco.baseNome}` })
      const proximo = blocos[i + 1]
      if (proximo) {
        eventos.push({
          tipo: proximo.tipo === 'nodata' ? 'nodata' : 'out',
          hora: bloco.fim,
          texto: `Saiu da ${bloco.baseNome}`,
          sub: `${formatarDuracao(new Date(bloco.fim) - new Date(bloco.inicio))} dentro`,
        })
      }
    } else if (bloco.tipo === 'nodata') {
      eventos.push({
        tipo: 'nodata',
        hora: bloco.inicio,
        horaFim: bloco.fim,
        texto: `Sem sinal (${formatarDuracao(new Date(bloco.fim) - new Date(bloco.inicio))})`,
        sub: 'app fechado ou sem internet — não conta como fora',
      })
    }
  })
  return eventos
}

const BASE_FORM_VAZIO = { nome: '', regional: '', latitude: '', longitude: '', raio_km: '1.0' }

export default function MapaFiscais({ usuarioLogado, onVoltar }) {
  const mapRef      = useRef(null)
  const leafletMap  = useRef(null)
  const marcadores  = useRef({})
  const rotas       = useRef({})
  const circulosBase = useRef({})

  const filtros = useFiltrosOperacionais({ inicializarMes: false, usuarioLogado })

  const podeGerenciarBases = isAdmin(usuarioLogado) || temPermissao(usuarioLogado, 'fiscais_campo_bases')

  const [presencas,       setPresencas]       = useState([])   // fiscais_presenca (última 1h)
  const [loading,         setLoading]         = useState(true)
  const [aba,             setAba]             = useState('vivo')   // vivo | historico | bases | relatorio
  const [janelaHistorico, setJanelaHistorico] = useState('3h')     // 1h | 3h | 6h | dia
  const [dataHistorico,   setDataHistorico]   = useState(new Date().toISOString().split('T')[0])
  const [fiscalHistorico, setFiscalHistorico] = useState('')
  const [logHistorico,    setLogHistorico]    = useState([])
  const [resumoHistorico, setResumoHistorico] = useState(null)
  const [fiscais,         setFiscais]         = useState([])
  const [agora,           setAgora]           = useState(Date.now())  // tick pra recalcular "há X min"

  const [bases,           setBases]           = useState([])
  const [basesEditando,   setBasesEditando]   = useState(null)
  const [baseForm,        setBaseForm]        = useState(BASE_FORM_VAZIO)
  const [salvandoBase,    setSalvandoBase]    = useState(false)
  const [erroBase,        setErroBase]        = useState('')

  const [permanenciaHoje, setPermanenciaHoje] = useState({}) // fiscal_login -> {inMs,outMs,nodataMs}

  const [dataRelatorio,        setDataRelatorio]        = useState(new Date().toISOString().split('T')[0])
  const [relatorioPermanencia, setRelatorioPermanencia] = useState([])
  const [carregandoRelatorio,  setCarregandoRelatorio]  = useState(false)

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

  // ─── Bases operacionais ───
  const carregarBases = async () => {
    const { data } = await supabase.from('bases_operacionais').select('*').eq('ativo', true).order('nome')
    setBases(data || [])
  }
  useEffect(() => { carregarBases() }, [])

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

  // ─── Círculos de geofencing das bases (aparecem em Ao Vivo/Histórico/Bases) ───
  useEffect(() => {
    const L = window.L
    if (!L || !leafletMap.current) return
    if (aba === 'relatorio') {
      Object.values(circulosBase.current).forEach(c => c.remove())
      circulosBase.current = {}
      return
    }
    const idsAtuais = new Set(bases.map(b => String(b.id)))
    bases.forEach(b => {
      const id = String(b.id)
      if (circulosBase.current[id]) {
        circulosBase.current[id].setLatLng([b.latitude, b.longitude])
        circulosBase.current[id].setRadius(Number(b.raio_km) * 1000)
      } else {
        const circulo = L.circle([b.latitude, b.longitude], {
          radius: Number(b.raio_km) * 1000,
          color: '#0f766e', weight: 1.5, fillColor: '#0f766e', fillOpacity: 0.08, dashArray: '4 4',
        }).addTo(leafletMap.current).bindTooltip(`${b.nome} · raio ${b.raio_km}km`)
        circulosBase.current[id] = circulo
      }
    })
    Object.keys(circulosBase.current).forEach(id => {
      if (!idsAtuais.has(id)) { circulosBase.current[id].remove(); delete circulosBase.current[id] }
    })
  }, [bases, aba])

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
    if (aba !== 'vivo') return
    buscarRef.current()
    const interval = setInterval(() => buscarRef.current(), 5000)
    const tick     = setInterval(() => setAgora(Date.now()), 1000)
    return () => { clearInterval(interval); clearInterval(tick) }
  }, [aba])

  // ─── % de tempo dentro da base hoje, por fiscal visível (a cada 30s) ───
  useEffect(() => {
    if (aba !== 'vivo') return
    const logins = presencasFiltradas.map(p => p.fiscal_login)
    if (logins.length === 0) { setPermanenciaHoje({}); return }

    const carregar = async () => {
      const inicioHoje = `${new Date().toISOString().split('T')[0]}T00:00:00`
      const { data } = await supabase
        .from('localizacoes').select('*')
        .in('fiscal_login', logins)
        .gte('created_at', inicioHoje)
        .order('created_at', { ascending: true })
      const porFiscal = new Map()
      ;(data || []).forEach(p => {
        if (!porFiscal.has(p.fiscal_login)) porFiscal.set(p.fiscal_login, [])
        porFiscal.get(p.fiscal_login).push(p)
      })
      const resultado = {}
      porFiscal.forEach((pontos, login) => { resultado[login] = calcularPermanencia(pontos, bases) })
      setPermanenciaHoje(resultado)
    }

    carregar()
    const interval = setInterval(carregar, 30000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, presencasFiltradas.map(p => p.fiscal_login).join(','), bases])

  // ─── Sincroniza marcadores (ativos + ausentes com estilos distintos) ───
  useEffect(() => {
    if (aba !== 'vivo') return
    const L = window.L
    if (!L || !leafletMap.current) return

    const visiveis = [...ativos, ...ausentes]
    const loginsVisiveis = new Set(visiveis.map(p => p.fiscal_login))

    visiveis.forEach(p => {
      const ativo = estaAtivo(p.ultimo_visto)
      const cor   = ativo ? corFiscal(p.fiscal_login) : '#94a3b8'  // cinza se ausente
      const opacidade = ativo ? 1 : 0.65
      const nome  = p.fiscal_nome?.split(' ')[0]?.substring(0, 6) || '?'

      const classif = baseMaisProxima(p.lat, p.lng, bases)
      const statusBaseHtml = classif.base
        ? (classif.dentro
          ? `<span style="color:#16a34a;font-weight:700">🟢 Dentro da ${classif.base.nome}</span>`
          : `<span style="color:#d97706;font-weight:700">🟠 Fora de qualquer base (${classif.distanciaKm.toFixed(1)}km da ${classif.base.nome})</span>`)
        : ''

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
        ${statusBaseHtml ? `<br/>${statusBaseHtml}` : ''}
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
  }, [ativos, ausentes, aba, bases])

  // ─── Limpa marcadores/rotas ao trocar de aba ───
  useEffect(() => {
    if (aba === 'vivo') return
    Object.values(marcadores.current).forEach(m => m.remove())
    marcadores.current = {}
    if (aba !== 'historico') {
      Object.values(rotas.current).forEach(r => r.remove())
      rotas.current = {}
    }
  }, [aba])

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
    setLogHistorico([])
    setResumoHistorico(null)

    const hoje = new Date().toISOString().split('T')[0]
    let ini, fim
    if (dataHistorico === hoje && janelaHistorico !== 'dia') {
      const horas = { '1h': 1, '3h': 3, '6h': 6 }[janelaHistorico] || 3
      const agoraDate = new Date()
      ini = new Date(agoraDate.getTime() - horas * 3600 * 1000).toISOString()
      fim = agoraDate.toISOString()
    } else {
      ini = `${dataHistorico}T00:00:00`
      fim = `${dataHistorico}T23:59:59`
    }

    const { data } = await supabase
      .from('localizacoes').select('*')
      .eq('fiscal_login', fiscalHistorico)
      .gte('created_at', ini).lte('created_at', fim)
      .order('created_at', { ascending: true })

    if (!data || data.length === 0) {
      alert('Nenhuma posição encontrada para este fiscal nesse período.')
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
    setLogHistorico(gerarLogEventos(data, bases))
    setResumoHistorico({
      total: data.length,
      inicio: new Date(data[0].created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      fim: new Date(data[data.length - 1].created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    })
  }

  // ─── Bases: cadastro/edição ───
  const iniciarNovaBase = () => {
    setBasesEditando(null)
    setBaseForm(BASE_FORM_VAZIO)
    setErroBase('')
  }

  const editarBase = (b) => {
    setBasesEditando(b.id)
    setBaseForm({
      nome: b.nome || '',
      regional: b.regional || '',
      latitude: String(b.latitude ?? ''),
      longitude: String(b.longitude ?? ''),
      raio_km: String(b.raio_km ?? '1.0'),
    })
    setErroBase('')
  }

  const usarLocalizacaoAtual = () => {
    if (!navigator.geolocation) { setErroBase('Este navegador nao suporta geolocalizacao.'); return }
    navigator.geolocation.getCurrentPosition(
      pos => setBaseForm(f => ({ ...f, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) })),
      () => setErroBase('Nao foi possivel obter sua localizacao atual.'),
    )
  }

  const salvarBase = async () => {
    if (!podeGerenciarBases) return
    setErroBase('')
    const nome = baseForm.nome.trim()
    const lat = Number(String(baseForm.latitude).replace(',', '.'))
    const lng = Number(String(baseForm.longitude).replace(',', '.'))
    const raio = Number(String(baseForm.raio_km).replace(',', '.'))
    if (!nome) { setErroBase('Informe o nome da base.'); return }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { setErroBase('Latitude/longitude invalidas.'); return }
    if (!Number.isFinite(raio) || raio <= 0) { setErroBase('Informe um raio valido, em km (ex: 1.0).'); return }

    setSalvandoBase(true)
    try {
      const payload = {
        nome, regional: baseForm.regional.trim() || null,
        latitude: lat, longitude: lng, raio_km: raio,
        atualizado_por: usuarioLogado?.login, atualizado_em: new Date().toISOString(),
      }
      if (basesEditando) {
        const { error } = await supabase.from('bases_operacionais').update(payload).eq('id', basesEditando)
        if (error) throw error
      } else {
        const { error } = await supabase.from('bases_operacionais').insert({ ...payload, criado_por: usuarioLogado?.login })
        if (error) throw error
      }
      iniciarNovaBase()
      await carregarBases()
    } catch (e) {
      setErroBase(e.message || String(e))
    } finally {
      setSalvandoBase(false)
    }
  }

  const excluirBase = async (b) => {
    if (!podeGerenciarBases) return
    if (!window.confirm(`Excluir a base ${b.nome}?`)) return
    await supabase.from('bases_operacionais').update({ ativo: false }).eq('id', b.id)
    if (basesEditando === b.id) iniciarNovaBase()
    await carregarBases()
  }

  const basesComContagem = useMemo(() => {
    return bases.map(b => ({
      ...b,
      dentroAgora: presencasFiltradas.filter(p => baseMaisProxima(p.lat, p.lng, bases).base?.id === b.id && baseMaisProxima(p.lat, p.lng, bases).dentro).length,
    }))
  }, [bases, presencasFiltradas])

  // ─── Relatório de permanência ───
  const carregarRelatorio = async () => {
    setCarregandoRelatorio(true)
    try {
      const ini = `${dataRelatorio}T00:00:00`
      const fim = `${dataRelatorio}T23:59:59`
      const { data } = await supabase
        .from('localizacoes').select('*')
        .gte('created_at', ini).lte('created_at', fim)
        .order('created_at', { ascending: true })
      const porFiscal = new Map()
      ;(data || []).forEach(p => {
        if (!fiscalPermitido(p.fiscal_nome)) return
        if (!porFiscal.has(p.fiscal_login)) porFiscal.set(p.fiscal_login, { fiscal_login: p.fiscal_login, fiscal_nome: p.fiscal_nome, pontos: [] })
        porFiscal.get(p.fiscal_login).pontos.push(p)
      })
      const linhas = [...porFiscal.values()]
        .map(f => ({ ...f, calc: calcularPermanencia(f.pontos, bases) }))
        .sort((a, b) => (a.fiscal_nome || '').localeCompare(b.fiscal_nome || ''))
      setRelatorioPermanencia(linhas)
    } finally {
      setCarregandoRelatorio(false)
    }
  }

  useEffect(() => {
    if (aba === 'relatorio' && relatorioPermanencia.length === 0) carregarRelatorio()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba])

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
                {aba === 'vivo' && `${ativos.length} ativo(s) · ${ausentes.length} visto(s) na última hora — atualiza a cada 5s`}
                {aba === 'historico' && 'Histórico de rota'}
                {aba === 'bases' && `${bases.length} base(s) cadastrada(s)`}
                {aba === 'relatorio' && 'Permanência dentro/fora da base'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                ['vivo', '🔴 Ao Vivo'],
                ['historico', '📅 Histórico'],
                ['bases', '🏠 Bases'],
                ['relatorio', '📊 Relatório'],
              ].map(([id, label]) => (
                <button key={id} onClick={() => setAba(id)} style={{
                  padding: '7px 11px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 11.5, fontWeight: 700,
                  background: aba === id ? '#fff' : 'rgba(255,255,255,0.2)',
                  color: aba === id ? '#1e3a5f' : '#fff',
                }}>{label}</button>
              ))}
            </div>
          </div>

          {aba === 'historico' && (
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: 11, opacity: 0.85, display: 'block', marginBottom: 4 }}>Janela</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[['1h', '1h'], ['3h', '3h'], ['6h', '6h'], ['dia', 'Dia todo']].map(([id, label]) => (
                    <button key={id} onClick={() => setJanelaHistorico(id)} style={{
                      padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      fontSize: 11.5, fontWeight: 700,
                      background: janelaHistorico === id ? '#f59e0b' : 'rgba(255,255,255,0.16)',
                      color: '#fff',
                    }}>{label}</button>
                  ))}
                </div>
              </div>
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

          {aba === 'relatorio' && (
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: 11, opacity: 0.85, display: 'block', marginBottom: 4 }}>Data</label>
                <input type="date" value={dataRelatorio} onChange={e => setDataRelatorio(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: 'none', fontSize: 13 }} />
              </div>
              <button onClick={carregarRelatorio} disabled={carregandoRelatorio} style={{
                padding: '8px 16px', background: '#f59e0b', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                opacity: carregandoRelatorio ? 0.6 : 1,
              }}>📊 Gerar relatório</button>
            </div>
          )}
        </div>
      </div>

      {(aba === 'vivo' || aba === 'historico') && (
        <div style={{
          maxWidth: 900, margin: '0 auto', width: '100%',
          padding: '12px 16px 0', boxSizing: 'border-box',
          position: 'relative', zIndex: 1000,
        }}>
          <PainelFiltros
            filtros={filtros}
            titulo="🔍 Filtros do Mapa"
            badge={aba === 'historico' ? 'filtra a lista de fiscais' : 'filtra fiscais visíveis'}
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
      )}

      {/* Aviso quando filtro esconde resultados */}
      {filtroHierarquicoAtivo && aba === 'vivo' && presencasFiltradas.length === 0 && presencas.length > 0 && (
        <div style={{ maxWidth: 900, margin: '0 auto', width: '100%', padding: '0 16px 12px', boxSizing: 'border-box' }}>
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#c2410c', fontWeight: 600 }}>
            ⚠️ {presencas.length} fiscal(is) com presença recente, mas nenhum bate com os filtros selecionados.
          </div>
        </div>
      )}

      {/* Cards de fiscais (ativos + ausentes) */}
      {aba === 'vivo' && presencasFiltradas.length > 0 && (
        <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '10px 20px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...ativos, ...ausentes].map(f => {
              const ativo = estaAtivo(f.ultimo_visto)
              const cor   = ativo ? corFiscal(f.fiscal_login) : '#94a3b8'
              const classif = baseMaisProxima(f.lat, f.lng, bases)
              const perm = permanenciaHoje[f.fiscal_login]
              const totalMs = perm ? perm.inMs + perm.outMs : 0
              const pctDentro = totalMs > 0 ? Math.round((perm.inMs / totalMs) * 100) : null
              return (
                <div key={f.fiscal_login} onClick={() => {
                  if (leafletMap.current && marcadores.current[f.fiscal_login]) {
                    leafletMap.current.setView([f.lat, f.lng], 15)
                    marcadores.current[f.fiscal_login].openPopup()
                  }
                }} style={{
                  background: ativo ? '#f0f9ff' : '#f8fafc',
                  border: `2px solid ${cor}`, borderRadius: 10, padding: '8px 12px', cursor: 'pointer',
                  opacity: ativo ? 1 : 0.8,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: cor }}>
                      {ativo ? '🟢' : '⚪'} {f.fiscal_nome}
                    </span>
                    <span style={{ fontSize: 10, color: '#64748b' }}>
                      {ativo ? new Date(f.ultimo_visto).toLocaleTimeString('pt-BR') : tempoDesde(f.ultimo_visto)}
                    </span>
                  </div>
                  {classif.base && (
                    <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3, color: classif.dentro ? '#166534' : '#92400e' }}>
                      {classif.dentro ? `🟢 Dentro da ${classif.base.nome}` : `🟠 Fora de qualquer base (${classif.distanciaKm.toFixed(1)}km da ${classif.base.nome})`}
                    </div>
                  )}
                  {pctDentro !== null && (
                    <div style={{ marginTop: 5 }}>
                      <div style={{ height: 5, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pctDentro}%`, background: '#16a34a' }} />
                      </div>
                      <p style={{ fontSize: 9.5, color: '#64748b', marginTop: 2 }}>{pctDentro}% do dia dentro da base até agora</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {loading && aba === 'vivo' && (
        <div style={{ textAlign: 'center', padding: 20, color: '#64748b', fontSize: 13 }}>
          ⏳ Carregando mapa...
        </div>
      )}

      {aba === 'historico' && resumoHistorico && (
        <div style={{ maxWidth: 900, margin: '0 auto', width: '100%', padding: '0 16px 10px', boxSizing: 'border-box' }}>
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700 }}>
            ✅ {resumoHistorico.total} posição(ões) registrada(s) nesse período, entre {resumoHistorico.inicio} e {resumoHistorico.fim} — confirma que a captura está gravando de verdade, mesmo sem deslocamento visível no mapa.
          </div>
        </div>
      )}

      {/* A div do mapa fica sempre montada (só escondida via CSS) — removê-la do
          DOM ao trocar de aba orfanaria a instância do Leaflet, que só é criada
          uma vez (ver useEffect de inicialização abaixo). */}
      <div
        ref={mapRef}
        style={
          (aba === 'vivo' || aba === 'historico')
            ? { flex: 1, minHeight: 420 }
            : { display: 'none' }
        }
      />

      {aba === 'historico' && logHistorico.length > 0 && (
        <div style={{ maxWidth: 900, margin: '0 auto', width: '100%', padding: 16, boxSizing: 'border-box' }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Linha do tempo — entradas e saídas de base</p>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {logHistorico.map((ev, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: i < logHistorico.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', minWidth: 90 }}>
                    {new Date(ev.hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    {ev.horaFim ? `–${new Date(ev.horaFim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                  </span>
                  <div>
                    <p style={{ fontSize: 12.5, fontWeight: 700, color: ev.tipo === 'in' ? '#166534' : ev.tipo === 'nodata' ? '#475569' : '#92400e', margin: 0 }}>
                      {ev.tipo === 'in' ? '🟢' : ev.tipo === 'nodata' ? '⚪' : '🟠'} {ev.texto}
                    </p>
                    {ev.sub && <p style={{ fontSize: 10.5, color: '#94a3b8', margin: '1px 0 0' }}>{ev.sub}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sem fiscais */}
      {!loading && aba === 'vivo' && presencasFiltradas.length === 0 && !filtroHierarquicoAtivo && (
        <div style={{
          position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          background: '#fff', borderRadius: 12, padding: '12px 20px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)', fontSize: 13, color: '#64748b', textAlign: 'center', zIndex: 1000,
        }}>
          📭 Nenhum fiscal com presença na última hora
        </div>
      )}

      {/* ============ ABA BASES ============ */}
      {aba === 'bases' && (
        <div style={{ maxWidth: 900, margin: '0 auto', width: '100%', padding: 16, boxSizing: 'border-box' }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>Bases cadastradas</p>
            {bases.length === 0 && <p style={{ fontSize: 12, color: '#64748b' }}>Nenhuma base cadastrada ainda.</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {basesComContagem.map(b => (
                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: '#f8fafc', borderRadius: 10, padding: '10px 12px' }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', margin: 0 }}>{b.nome}</p>
                    <p style={{ fontSize: 10.5, color: '#64748b', margin: '2px 0 0' }}>
                      {b.regional ? `${b.regional} · ` : ''}{Number(b.latitude).toFixed(5)}, {Number(b.longitude).toFixed(5)} · raio {b.raio_km}km
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#0b4f49', background: '#e6f6f4', padding: '4px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                      {b.dentroAgora} dentro agora
                    </span>
                    {podeGerenciarBases && (
                      <>
                        <button onClick={() => editarBase(b)} style={{ border: 'none', background: '#e0f2fe', color: '#075985', borderRadius: 7, padding: '6px 9px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>Editar</button>
                        <button onClick={() => excluirBase(b)} style={{ border: 'none', background: '#fee2e2', color: '#991b1b', borderRadius: 7, padding: '6px 9px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>Excluir</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {podeGerenciarBases ? (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>
                {basesEditando ? 'Editar base' : '+ Nova base'}
              </p>
              {erroBase && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 8, padding: '8px 10px', marginBottom: 10, fontSize: 12, fontWeight: 700 }}>{erroBase}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>Nome da base</label>
                  <input value={baseForm.nome} onChange={e => setBaseForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Base Altos" style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>Regional</label>
                  <input value={baseForm.regional} onChange={e => setBaseForm(f => ({ ...f, regional: e.target.value }))} placeholder="Ex: Metropolitana" style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>Latitude</label>
                  <input value={baseForm.latitude} onChange={e => setBaseForm(f => ({ ...f, latitude: e.target.value }))} placeholder="Ex: -5.05000" style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>Longitude</label>
                  <input value={baseForm.longitude} onChange={e => setBaseForm(f => ({ ...f, longitude: e.target.value }))} placeholder="Ex: -42.46000" style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>Raio (km)</label>
                  <input value={baseForm.raio_km} onChange={e => setBaseForm(f => ({ ...f, raio_km: e.target.value }))} placeholder="Ex: 1.0" style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={usarLocalizacaoAtual} type="button" style={{ border: 'none', background: '#e6f6f4', color: '#0b4f49', borderRadius: 8, padding: '9px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>📍 Usar minha localização atual</button>
                <button onClick={salvarBase} disabled={salvandoBase} type="button" style={{ border: 'none', background: '#0f766e', color: '#fff', borderRadius: 8, padding: '9px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: salvandoBase ? 0.6 : 1 }}>
                  {basesEditando ? 'Salvar alterações' : 'Salvar base'}
                </button>
                {basesEditando && <button onClick={iniciarNovaBase} type="button" style={{ border: 'none', background: '#e2e8f0', color: '#334155', borderRadius: 8, padding: '9px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Cancelar edição</button>}
              </div>
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, color: '#64748b', fontSize: 12, textAlign: 'center' }}>
              Seu perfil não tem permissão para cadastrar/editar bases operacionais.
            </div>
          )}
        </div>
      )}

      {/* ============ ABA RELATÓRIO ============ */}
      {aba === 'relatorio' && (
        <div style={{ maxWidth: 900, margin: '0 auto', width: '100%', padding: 16, boxSizing: 'border-box' }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>Permanência por fiscal</p>
            <p style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>{formatarDataBR(dataRelatorio)}</p>

            {carregandoRelatorio && <p style={{ fontSize: 12, color: '#64748b' }}>⏳ Calculando...</p>}
            {!carregandoRelatorio && relatorioPermanencia.length === 0 && (
              <p style={{ fontSize: 12, color: '#64748b' }}>Nenhuma posição registrada nessa data.</p>
            )}

            {relatorioPermanencia.map(f => {
              const { calc } = f
              const inicioEixo = f.pontos.length ? new Date(f.pontos[0].created_at).getTime() : 0
              const fimEixo = f.pontos.length ? new Date(f.pontos[f.pontos.length - 1].created_at).getTime() : 1
              const totalEixo = Math.max(fimEixo - inicioEixo, 1)
              const totalMs = calc.inMs + calc.outMs + calc.nodataMs
              const pct = ms => totalMs > 0 ? Math.round((ms / totalMs) * 100) : 0
              return (
                <div key={f.fiscal_login} style={{ marginBottom: 18 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>{f.fiscal_nome}</p>
                  <div style={{ position: 'relative', height: 24, borderRadius: 7, background: '#f1f5f9', overflow: 'hidden' }}>
                    {calc.segmentos.map((seg, i) => {
                      const ini = new Date(seg.inicio).getTime()
                      const fim = new Date(seg.fim).getTime()
                      const left = ((ini - inicioEixo) / totalEixo) * 100
                      const width = Math.max(((fim - ini) / totalEixo) * 100, 0.3)
                      const bg = seg.tipo === 'in' ? '#16a34a' : seg.tipo === 'out' ? '#d97706' : 'repeating-linear-gradient(45deg,#e2e8f0,#e2e8f0 4px,#f1f5f9 4px,#f1f5f9 8px)'
                      return <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${left}%`, width: `${width}%`, background: bg }} />
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#94a3b8', marginTop: 3 }}>
                    <span>{new Date(inicioEixo).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span>{new Date(fimEixo).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, fontWeight: 700, marginTop: 6 }}>
                    <span style={{ color: '#166534' }}>🟢 {formatarDuracao(calc.inMs)} dentro ({pct(calc.inMs)}%)</span>
                    <span style={{ color: '#92400e' }}>🟠 {formatarDuracao(calc.outMs)} fora ({pct(calc.outMs)}%)</span>
                    {calc.nodataMs > 0 && <span style={{ color: '#475569' }}>⚪ {formatarDuracao(calc.nodataMs)} sem dado ({pct(calc.nodataMs)}%)</span>}
                  </div>
                </div>
              )
            })}

            {relatorioPermanencia.length > 0 && (
              <div style={{ background: '#e6f6f4', border: '1px solid #99d8ce', color: '#0b4f49', borderRadius: 10, padding: '10px 12px', fontSize: 11.5, lineHeight: 1.5 }}>
                ⚪ Períodos "sem dado" não contam como dentro nem fora — indicam app fechado, celular desligado ou sem sinal, e ficam separados do cálculo de permanência pra não distorcer o percentual.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
