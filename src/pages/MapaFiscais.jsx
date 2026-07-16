import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import { isAdmin, temPermissao } from '../lib/auth.js'
import {
  useFiltrosOperacionais,
  PainelFiltros,
  matchNomes,
} from '../components/PainelFiltros.jsx'
import { CarregandoHexagono } from '../components/Shared.jsx'

// Janela em que consideramos o fiscal "ativo agora" (verde) vs "ausente" (cinza)
const ATIVO_MS    = 5 * 60 * 1000        // ate 5 min = ativo; Android em segundo plano pode atrasar alguns ciclos
const PRESENCA_MS = 24 * 60 * 60 * 1000  // mantém visíveis fiscais vistos nas últimas 24h

// Se o intervalo entre duas posições consecutivas passar disso, tratamos como
// "sem sinal" (app fechado/sem internet) em vez de contar como fora da base —
// bem acima do ciclo normal de captura (8s em primeiro plano, ~20s em segundo
// plano no app Android), então só dispara em silêncio real.
const GAP_SEM_DADO_MS = 5 * 60 * 1000

// [DPL] Jornada de trabalho esperada do fiscal, usada só como base do
// cálculo de % no Relatório de Permanência (dentro/fora da base) — pedido
// do Gileno pra responder "das horas que ele devia trabalhar, quanto
// ficou dentro/fora da base", em vez de calcular sobre as 24h corridas do
// dia. Não afeta o desenho do Gantt em si (esse continua mostrando o dia
// inteiro, de 00h a 23h59, pra comparar turnos diferentes lado a lado).
const HORAS_JORNADA_MS = 8 * 60 * 60 * 1000

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

// Converte uma data LOCAL (America/Fortaleza, UTC-3, sem horário de verão)
// escolhida no filtro (ex: "2026-07-11") nos limites UTC reais do dia local
// — os timestamps em `localizacoes` são gravados em UTC (created_at ISO),
// então comparar com strings sem offset (ex: "2026-07-11T00:00:00") faz o
// Postgres interpretar como UTC e desloca a janela em 3h (perde as últimas
// 3h do dia local e inclui 3h do dia anterior).
function limitesDiaLocalUTC(dataISO) {
  const ini = new Date(`${dataISO}T00:00:00-03:00`).toISOString()
  const fim = new Date(`${dataISO}T23:59:59.999-03:00`).toISOString()
  return { ini, fim }
}

// Gera os horários de hora cheia (ex: 8h, 9h, 10h...) dentro do intervalo do
// eixo de um gráfico de permanência, pra funcionar como régua tipo Gantt.
// passoHoras controla o espaçamento (1 = todas as horas, 3 = de 3 em 3h) —
// usado pra não lotar de números um eixo de 24h em tela de celular.
function horasCheiasNoIntervalo(inicioMs, fimMs, passoHoras = 1) {
  if (!(fimMs > inicioMs)) return []
  const horas = []
  const primeira = new Date(inicioMs)
  primeira.setMinutes(0, 0, 0)
  if (primeira.getTime() < inicioMs) primeira.setHours(primeira.getHours() + 1)
  const passoMs = passoHoras * 60 * 60 * 1000
  for (let t = primeira.getTime(); t <= fimMs; t += passoMs) {
    horas.push(t)
  }
  return horas
}

// [DPL] Janela de almoço (12:20-14:00, horário local) descontada do cálculo
// de percentual de permanência dentro/fora da base — pedido do Gileno:
// um fiscal rastreado das 8h às 18h (10h de intervalo corrido) não deve
// ter as ~1h40 de almoço contadas como parte da jornada de 8h, senão o
// percentual passa de 100% mesmo ele tendo cumprido só a jornada normal.
// Exemplo dado por ele: 18h-8h = 10h; 10h - 1h40 (almoço) = 8h20 de
// "sobra"; 8h20 / 8h (jornada) = 104%.
// Só desconta de segmentos 'in'/'out' (não mexe em 'nodata'), e só do
// CÁLCULO de percentual/duração exibida — o desenho do Gantt em si
// continua mostrando o trajeto real (incluindo o horário de almoço),
// só a conta de "quanto ficou dentro/fora" é que ignora essa janela.
const ALMOCO_INICIO_MS = (12 * 60 + 20) * 60 * 1000 // 12:20 após a meia-noite local
const ALMOCO_FIM_MS     = 14 * 60 * 60 * 1000        // 14:00 após a meia-noite local

function descontarAlmoco(segmentos, diaInicioMs) {
  const almocoIni = diaInicioMs + ALMOCO_INICIO_MS
  const almocoFim = diaInicioMs + ALMOCO_FIM_MS
  let overlapIn = 0, overlapOut = 0
  for (const seg of segmentos) {
    if (seg.tipo !== 'in' && seg.tipo !== 'out') continue
    const ini = new Date(seg.inicio).getTime()
    const fim = new Date(seg.fim).getTime()
    const overlap = Math.max(Math.min(fim, almocoFim) - Math.max(ini, almocoIni), 0)
    if (overlap > 0) {
      if (seg.tipo === 'in') overlapIn += overlap
      else overlapOut += overlap
    }
  }
  return { overlapIn, overlapOut }
}

// [DPL] Marcas de meia-hora (xx:30) do eixo do Gantt — só o traço, sem
// número, bem mais claro que o traço de hora cheia, só pra dar uma
// referência visual do meio entre uma hora e outra.
function meiasHorasNoIntervalo(inicioMs, fimMs) {
  if (!(fimMs > inicioMs)) return []
  const meias = []
  const primeira = new Date(inicioMs)
  primeira.setMinutes(30, 0, 0)
  if (primeira.getTime() < inicioMs) primeira.setHours(primeira.getHours() + 1)
  for (let t = primeira.getTime(); t <= fimMs; t += 60 * 60 * 1000) {
    meias.push(t)
  }
  return meias
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
// diaInicioMs/diaFimMs (opcionais) fixam as bordas do eixo (ex: 00:00 e
// 23:59:59 do dia do relatório) — o intervalo antes do primeiro ponto e
// depois do último também vira "sem dado", pra dar pra comparar fiscais de
// turnos diferentes (noite, madrugada, manhã) no mesmo eixo de 24h.
function calcularPermanencia(pontos, bases, diaInicioMs, diaFimMs) {
  const segmentos = []
  let inMs = 0, outMs = 0, nodataMs = 0

  if (pontos.length > 0 && diaInicioMs != null) {
    const primeiroMs = new Date(pontos[0].created_at).getTime()
    const dtAntes = primeiroMs - diaInicioMs
    if (dtAntes > 0) {
      segmentos.push({ tipo: 'nodata', inicio: new Date(diaInicioMs).toISOString(), fim: pontos[0].created_at })
      nodataMs += dtAntes
    }
  }

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

  if (pontos.length > 0 && diaFimMs != null) {
    const ultimoMs = new Date(pontos[pontos.length - 1].created_at).getTime()
    const dtDepois = diaFimMs - ultimoMs
    if (dtDepois > 0) {
      segmentos.push({ tipo: 'nodata', inicio: pontos[pontos.length - 1].created_at, fim: new Date(diaFimMs).toISOString() })
      nodataMs += dtDepois
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

  // Período padrão "Hoje" — Histórico e Relatório usam filtros.getDatasQuery()
  // pra saber qual(is) dia(s) buscar, em vez de um date-picker próprio.
  const filtros = useFiltrosOperacionais({ inicializarMes: false, usuarioLogado, periodoPadrao: 'hoje' })

  const podeGerenciarBases = isAdmin(usuarioLogado) || temPermissao(usuarioLogado, 'fiscais_campo_bases')

  const [presencas,       setPresencas]       = useState([])   // fiscais_presenca (últimas 24h)
  const [loading,         setLoading]         = useState(true)
  const [aba,             setAba]             = useState('vivo')   // vivo | historico | bases | relatorio
  const [janelaHistorico, setJanelaHistorico] = useState('3h')     // 1h | 3h | 6h | dia — só quando Período = Hoje
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

  const [relatorioPermanencia, setRelatorioPermanencia] = useState([])
  const [carregandoRelatorio,  setCarregandoRelatorio]  = useState(false)
  // 'dia' = 1 dia só (Gantt por hora, como sempre foi) · 'periodo' = Mês/Período
  // com vários dias (resumo somado por fiscal, sem o gráfico de horário)
  const [modoRelatorio,        setModoRelatorio]        = useState('dia')

  const CORES = ['#2563eb','#dc2626','#16a34a','#d97706','#7c3aed','#0891b2','#be185d']
  const corFiscal = (login) => {
    const idx = fiscais.findIndex(f => f.login === login)
    return CORES[idx % CORES.length] || '#374151'
  }

  // Um fiscal está "ativo agora" se foi visto nos últimos ATIVO_MS
  const estaAtivo = (ultimoVisto) => (Date.now() - new Date(ultimoVisto).getTime()) <= ATIVO_MS
  const statusFiscal = (ultimoVisto) => {
    const online = estaAtivo(ultimoVisto)
    return online
      ? { online: true, label: 'ONLINE', color: '#16a34a', bg: '#f0fdf4', border: '#22c55e' }
      : { online: false, label: 'OFFLINE', color: '#dc2626', bg: '#fff1f2', border: '#ef4444' }
  }

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
    // [DPL] Antes comparava por substring puro (nomeLower.includes(sup)) —
    // não normalizava acento e não respeitava limite de palavra, então o
    // nome do fiscal (fiscal_nome) quase nunca batia com o nome gravado em
    // estrutura_equipes.superv_campo (mesma pessoa, "Supervisor de Campo"
    // NA PRÁTICA É o fiscal, só que registrado noutra tabela) — por isso o
    // filtro "Supervisor de Campo" parecia não funcionar. matchNomes() é a
    // mesma função já usada no cálculo de permissões (auth), testada e
    // tolerante a acento/abreviação/limite de palavra.
    for (const sup of supervisoresAlvo) {
      if (matchNomes(nome, sup)) return true
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

  // ─── Busca presença (tabela fiscais_presenca, últimas 24h) ───
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

  // ─── Sincroniza marcadores (ativos + ausentes com estilos distintos) ───
  useEffect(() => {
    if (aba !== 'vivo') return
    const L = window.L
    if (!L || !leafletMap.current) return

    const visiveis = [...ativos, ...ausentes]
    const loginsVisiveis = new Set(visiveis.map(p => p.fiscal_login))

    visiveis.forEach(p => {
      const status = statusFiscal(p.ultimo_visto)
      const ativo = status.online
      const cor = ativo ? corFiscal(p.fiscal_login) : status.color
      const opacidade = 1
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
          ? `<span style="color:${status.color};font-weight:700">ONLINE</span>`
          : `<span style="color:${status.color};font-weight:700">OFFLINE - Visto ${tempoDesde(p.ultimo_visto)}</span>`}
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

  // Paleta usada só quando o Histórico mostra vários dias de uma vez —
  // um dia = uma cor, pra dar pra distinguir no mapa qual trecho é de qual dia.
  const PALETA_DIAS = ['#dc2626','#2563eb','#16a34a','#d97706','#7c3aed','#0891b2','#db2777','#65a30d','#ea580c','#4338ca']

  // ─── Ver histórico (trilha da tabela localizacoes) ───
  // Período = 1 dia (Hoje ou Período com data única): mantém o comportamento
  // de sempre (1 rota, cor do fiscal, janela 1h/3h/6h quando for hoje).
  // Período = vários dias (Mês, ou Período com intervalo): desenha uma rota
  // por dia, cada uma com uma cor diferente (legenda abaixo do mapa), pra dar
  // pra comparar dias sem confundir um com o outro.
  const verHistorico = async () => {
    const L = window.L
    if (!L || !leafletMap.current || !fiscalHistorico) return

    const { ini: dIni, fim: dFim } = filtros.getDatasQuery()
    if (!dIni) { alert('Selecione um período.'); return }

    Object.values(marcadores.current).forEach(m => m.remove())
    marcadores.current = {}
    Object.values(rotas.current).forEach(r => r.remove())
    rotas.current = {}
    setLogHistorico([])
    setResumoHistorico(null)

    const multiDia = dIni !== dFim
    let ini, fim
    if (!multiDia && filtros.tipoPeriodo === 'hoje' && janelaHistorico !== 'dia') {
      const horas = { '1h': 1, '3h': 3, '6h': 6 }[janelaHistorico] || 3
      const agoraDate = new Date()
      ini = new Date(agoraDate.getTime() - horas * 3600 * 1000).toISOString()
      fim = agoraDate.toISOString()
    } else {
      ini = limitesDiaLocalUTC(dIni).ini
      fim = limitesDiaLocalUTC(dFim).fim
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

    if (multiDia) {
      const porDia = new Map()
      data.forEach(p => {
        const dia = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Fortaleza' }).format(new Date(p.created_at))
        if (!porDia.has(dia)) porDia.set(dia, [])
        porDia.get(dia).push(p)
      })
      const dias = [...porDia.keys()].sort()
      const bounds = []
      dias.forEach((dia, i) => {
        const pontosDia = porDia.get(dia)
        const cor = PALETA_DIAS[i % PALETA_DIAS.length]
        const latlngs = pontosDia.map(p => [p.lat, p.lng])
        const linha = L.polyline(latlngs, { color: cor, weight: 4, opacity: 0.8 }).addTo(leafletMap.current)
        rotas.current[`dia-${dia}`] = linha
        bounds.push(...latlngs)
        const marker = L.marker(latlngs[0], {
          icon: L.divIcon({
            html: `<div style="background:${cor};color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${formatarDataBR(dia).slice(0, 5)}</div>`,
            className: '', iconSize: [28, 28], iconAnchor: [14, 14],
          })
        }).addTo(leafletMap.current).bindPopup(`${formatarDataBR(dia)} — início ${new Date(pontosDia[0].created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`)
        marcadores.current[`dia-${dia}`] = marker
      })
      if (bounds.length) leafletMap.current.fitBounds(bounds, { padding: [40, 40] })
      setLogHistorico(gerarLogEventos(data, bases))
      setResumoHistorico({
        total: data.length,
        inicio: formatarDataBR(dias[0]),
        fim: formatarDataBR(dias[dias.length - 1]),
        legendaDias: dias.map((dia, i) => ({ dia, cor: PALETA_DIAS[i % PALETA_DIAS.length] })),
      })
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
  // Período = 1 dia (Hoje, ou Período com data única): mantém o Gantt por
  // hora de sempre. Período = vários dias (Mês, ou Período com intervalo):
  // soma tudo num resumo por fiscal, sem gráfico de horário — não daria pra
  // desenhar um Gantt legível com dias diferentes na mesma régua de 24h.
  const carregarRelatorio = async () => {
    const { ini: dIni, fim: dFim } = filtros.getDatasQuery()
    if (!dIni) { setRelatorioPermanencia([]); return }

    setCarregandoRelatorio(true)
    try {
      const multiDia = dIni !== dFim
      const { ini } = limitesDiaLocalUTC(dIni)
      const { fim } = limitesDiaLocalUTC(dFim)
      // [DPL] O Supabase/PostgREST limita a 1000 linhas por consulta por
      // padrão — com o rastreio contínuo (a cada 8s em movimento) mais o
      // heartbeat, um dia inteiro de vários fiscais passa disso fácil, e o
      // relatório ficava sempre travado no mesmo horário (as mesmas 1000
      // linhas mais antigas), não importava quantas vezes gerava de novo.
      // Busca em páginas até não vir mais nada, sem alterar a query em si.
      const TAMANHO_PAGINA = 1000
      const data = []
      for (let pagina = 0; ; pagina++) {
        const { data: parte, error } = await supabase
          .from('localizacoes').select('*')
          .gte('created_at', ini).lte('created_at', fim)
          .order('created_at', { ascending: true })
          .range(pagina * TAMANHO_PAGINA, pagina * TAMANHO_PAGINA + TAMANHO_PAGINA - 1)
        if (error) throw error
        data.push(...(parte || []))
        if (!parte || parte.length < TAMANHO_PAGINA) break
      }

      // Agrupa por fiscal e, dentro de cada fiscal, por dia local (Fortaleza)
      // — necessário pra aplicar corretamente o padding de "sem dado" nas
      // bordas de CADA dia (00:00/23:59), em vez de tratar o intervalo
      // inteiro como um único dia contínuo.
      const porFiscal = new Map()
      ;(data || []).forEach(p => {
        if (!fiscalPermitido(p.fiscal_nome)) return
        const diaLocal = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Fortaleza' }).format(new Date(p.created_at))
        if (!porFiscal.has(p.fiscal_login)) {
          porFiscal.set(p.fiscal_login, { fiscal_login: p.fiscal_login, fiscal_nome: p.fiscal_nome, porDia: new Map() })
        }
        const entry = porFiscal.get(p.fiscal_login)
        if (!entry.porDia.has(diaLocal)) entry.porDia.set(diaLocal, [])
        entry.porDia.get(diaLocal).push(p)
      })

      if (multiDia) {
        const linhas = [...porFiscal.values()]
          .map(f => {
            let inMs = 0, outMs = 0, nodataMs = 0
            for (const [dia, pontosDia] of f.porDia.entries()) {
              const limites = limitesDiaLocalUTC(dia)
              const diaInicioMs = new Date(limites.ini).getTime()
              const calc = calcularPermanencia(pontosDia, bases, diaInicioMs, new Date(limites.fim).getTime())
              // Desconta a janela de almoço (12:20-14:00) do dia antes de somar.
              const { overlapIn, overlapOut } = descontarAlmoco(calc.segmentos, diaInicioMs)
              inMs += calc.inMs - overlapIn; outMs += calc.outMs - overlapOut; nodataMs += calc.nodataMs
            }
            return { fiscal_login: f.fiscal_login, fiscal_nome: f.fiscal_nome, diasComDado: f.porDia.size, calc: { inMs, outMs, nodataMs } }
          })
          .sort((a, b) => (a.fiscal_nome || '').localeCompare(b.fiscal_nome || ''))
        setModoRelatorio('periodo')
        setRelatorioPermanencia(linhas)
      } else {
        const diaInicioMs = new Date(ini).getTime()
        const diaFimMs = new Date(fim).getTime()
        const linhas = [...porFiscal.values()]
          .map(f => {
            const pontos = f.porDia.get(dIni) || []
            const calc = calcularPermanencia(pontos, bases, diaInicioMs, diaFimMs)
            // Desconta a janela de almoço (12:20-14:00) do dia — só do
            // in/outMs usado no % e no texto "Xh dentro/fora", o
            // calc.segmentos (desenho do Gantt) fica intacto.
            const { overlapIn, overlapOut } = descontarAlmoco(calc.segmentos, diaInicioMs)
            calc.inMs  = Math.max(calc.inMs  - overlapIn,  0)
            calc.outMs = Math.max(calc.outMs - overlapOut, 0)
            return { fiscal_login: f.fiscal_login, fiscal_nome: f.fiscal_nome, pontos, diaInicioMs, diaFimMs, calc }
          })
          .sort((a, b) => (a.fiscal_nome || '').localeCompare(b.fiscal_nome || ''))
        setModoRelatorio('dia')
        setRelatorioPermanencia(linhas)
      }
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
                {aba === 'vivo' && `${ativos.length} online · ${ausentes.length} offline/visto(s) nas últimas 24h — atualiza a cada 5s`}
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
              {filtros.tipoPeriodo === 'hoje' && (
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
              )}
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
              <div style={{ fontSize: 12, color: '#fff', opacity: 0.9, paddingBottom: 10 }}>
                📆 {filtros.periodoLabel}
              </div>
              <button onClick={verHistorico} style={{
                padding: '8px 16px', background: '#f59e0b', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>🗺️ Ver Rota</button>
            </div>
          )}

          {aba === 'relatorio' && (
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ fontSize: 12, color: '#fff', opacity: 0.9, paddingBottom: 10 }}>
                📆 {filtros.periodoLabel}
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

      {(aba === 'vivo' || aba === 'historico' || aba === 'relatorio') && (
        <div style={{
          maxWidth: 900, margin: '0 auto', width: '100%',
          padding: '12px 16px 0', boxSizing: 'border-box',
          position: 'relative', zIndex: 1000,
        }}>
          <PainelFiltros
            filtros={filtros}
            titulo="🔍 Filtros do Mapa"
            badge={aba === 'historico' ? 'filtra a lista de fiscais' : aba === 'relatorio' ? 'filtra os fiscais do relatório' : 'filtra fiscais visíveis'}
          />
          {aba === 'vivo' && (
            <p style={{ fontSize: 11, color: '#64748b', marginTop: -8, marginBottom: 8 }}>
              ℹ️ ONLINE exige envio recente do celular. OFFLINE indica que o app ficou sem enviar localização no intervalo esperado; o Período acima só filtra quem aparece.
            </p>
          )}
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

      {/* Tira compacta de chips (ativos + ausentes) — cabe qualquer quantidade de
          fiscais numa faixa só, com rolagem lateral. Detalhe completo (dentro/fora,
          coordenadas, horário, rota) fica no balão do mapa; % do dia dentro da base
          fica só na aba Relatório, pra não duplicar informação aqui. */}
      {aba === 'vivo' && presencasFiltradas.length > 0 && (
        <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '10px 20px', overflowX: 'auto' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', gap: 8 }}>
            {[...ativos, ...ausentes].map(f => {
              const status = statusFiscal(f.ultimo_visto)
              const ativo = status.online
              const cor = ativo ? corFiscal(f.fiscal_login) : status.color
              const classif = baseMaisProxima(f.lat, f.lng, bases)
              return (
                <div key={f.fiscal_login} onClick={() => {
                  if (leafletMap.current && marcadores.current[f.fiscal_login]) {
                    leafletMap.current.setView([f.lat, f.lng], 15)
                    marcadores.current[f.fiscal_login].openPopup()
                  }
                }} title={classif.base ? (classif.dentro ? `Dentro da ${classif.base.nome}` : `Fora de qualquer base (${classif.distanciaKm.toFixed(1)}km da ${classif.base.nome})`) : ''} style={{
                  display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap',
                  background: ativo ? '#f0f9ff' : status.bg,
                  border: `1.5px solid ${ativo ? cor : status.border}`, borderRadius: 999, padding: '6px 12px 6px 8px', cursor: 'pointer',
                  opacity: 1,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: ativo ? '#22c55e' : '#ef4444', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: cor }}>{f.fiscal_nome?.split(' ')[0]}</span>
                  <span style={{ fontSize: 10, fontWeight: 900, color: status.color }}>{status.label}</span>
                  {classif.base && <span style={{ fontSize: 11 }}>{classif.dentro ? '🟢' : '🟠'}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {loading && aba === 'vivo' && (
        <CarregandoHexagono texto="Carregando mapa..." tamanho={44} padding={20} />
      )}

      {aba === 'historico' && resumoHistorico && (
        <div style={{ maxWidth: 900, margin: '0 auto', width: '100%', padding: '0 16px 10px', boxSizing: 'border-box' }}>
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700 }}>
            ✅ {resumoHistorico.total} posição(ões) registrada(s) {resumoHistorico.legendaDias ? `em ${resumoHistorico.legendaDias.length} dia(s)` : 'nesse período'}, entre {resumoHistorico.inicio} e {resumoHistorico.fim} — confirma que a captura está gravando de verdade, mesmo sem deslocamento visível no mapa.
          </div>
          {resumoHistorico.legendaDias && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {resumoHistorico.legendaDias.map(({ dia, cor }) => (
                <span key={dia} style={{
                  display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#334155',
                  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '3px 9px',
                }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: cor, display: 'inline-block' }} />
                  {formatarDataBR(dia)}
                </span>
              ))}
            </div>
          )}
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
          📭 Nenhum fiscal com presença nas últimas 24h
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
            <p style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>{filtros.periodoLabel}</p>

            {carregandoRelatorio && <CarregandoHexagono texto="Calculando..." tamanho={44} padding={20} />}
            {!carregandoRelatorio && relatorioPermanencia.length === 0 && (
              <p style={{ fontSize: 12, color: '#64748b' }}>Nenhuma posição registrada nesse período.</p>
            )}

            {modoRelatorio === 'periodo' ? relatorioPermanencia.map(f => {
              const { calc } = f
              // [DPL] % calculado sobre a jornada esperada (8h por dia com
              // dado), não sobre as 24h corridas — pedido do Gileno pra
              // responder "das horas que ele devia trabalhar, quanto ficou
              // dentro/fora da base", em vez de "das 24h do relógio".
              const totalMs = HORAS_JORNADA_MS * Math.max(f.diasComDado, 1)
              const pct = ms => totalMs > 0 ? Math.round((ms / totalMs) * 100) : 0
              return (
                <div key={f.fiscal_login} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <p style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>
                    {f.fiscal_nome}{' '}
                    <span style={{ fontWeight: 600, color: '#94a3b8', fontSize: 11 }}>· {f.diasComDado} dia(s) com dado</span>
                  </p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, fontWeight: 700 }}>
                    <span style={{ color: '#166534' }}>🟢 {formatarDuracao(calc.inMs)} dentro ({pct(calc.inMs)}%)</span>
                    <span style={{ color: '#92400e' }}>🟠 {formatarDuracao(calc.outMs)} fora ({pct(calc.outMs)}%)</span>
                    {calc.nodataMs > 0 && <span style={{ color: '#475569' }}>⚪ {formatarDuracao(calc.nodataMs)} sem dado ({pct(calc.nodataMs)}%)</span>}
                  </div>
                </div>
              )
            }) : relatorioPermanencia.map(f => {
              const { calc } = f
              // Eixo fixo do dia inteiro (00:00-23:59:59), igual pra todos os
              // fiscais — dá pra comparar turno da noite/madrugada/manhã lado
              // a lado, e o que não foi logado também aparece como "sem dado".
              const inicioEixo = f.diaInicioMs
              const fimEixo = f.diaFimMs
              const totalEixo = Math.max(fimEixo - inicioEixo, 1)
              // [DPL] % calculado sobre a jornada esperada de 8h de trabalho
              // no dia, não sobre as 24h corridas do eixo do Gantt — o eixo
              // continua mostrando o dia inteiro (pra comparar turnos), mas
              // o percentual responde "das 8h que ele devia trabalhar,
              // quanto ficou dentro/fora da base".
              const totalMs = HORAS_JORNADA_MS
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
                    {/* Régua de horas cheias por cima das barras, estilo Gantt (linha fina a cada hora) */}
                    {horasCheiasNoIntervalo(inicioEixo, fimEixo, 1).map(h => (
                      <div key={h} style={{
                        position: 'absolute', top: 0, bottom: 0,
                        left: `${((h - inicioEixo) / totalEixo) * 100}%`,
                        width: 1, background: 'rgba(15,23,42,0.14)',
                      }} />
                    ))}
                    {/* [DPL] Traço vermelho suave na meia-hora (xx:30), só
                        como referência visual do meio entre uma hora e
                        outra — pedido do Gileno, sem número, cor vermelha
                        (mais fraca que o traço de hora cheia acima, que é
                        cinza-escuro). */}
                    {meiasHorasNoIntervalo(inicioEixo, fimEixo).map(h => (
                      <div key={h} style={{
                        position: 'absolute', top: 0, bottom: 0,
                        left: `${((h - inicioEixo) / totalEixo) * 100}%`,
                        width: 1, background: 'rgba(220,38,38,0.25)',
                      }} />
                    ))}
                  </div>
                  <div style={{ position: 'relative', height: 12, marginTop: 3 }}>
                    {/* [DPL] Número em TODA hora cheia (13, 14, 15...) — antes
                        só aparecia a cada 3h; pedido do Gileno pra facilitar
                        a leitura do horário exato no Gantt. */}
                    {horasCheiasNoIntervalo(inicioEixo, fimEixo, 1).map(h => (
                      <span key={h} style={{
                        position: 'absolute', left: `${((h - inicioEixo) / totalEixo) * 100}%`,
                        transform: 'translateX(-50%)', fontSize: 9, color: '#94a3b8',
                        fontVariantNumeric: 'tabular-nums',
                      }}>{new Date(h).getHours()}</span>
                    ))}
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
