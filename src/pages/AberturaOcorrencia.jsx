import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { Textarea, SearchSelect } from '../components/Shared.jsx'
import { prepararPayloadOcorrencia, salvarOcorrenciaBD, listarFiscaisParaDirecionamento } from '../lib/ocorrencias.js'
import { salvarOcorrenciaOffline } from '../lib/ocorrencias_offline.js'

// Mesmo padrão de marca d'água usado em processarFotoEvidencia
// (TratamentoNaoConformidades.jsx) / R5Evidencias.jsx — data/hora, prefixo
// e quem abriu gravados na própria imagem.
function processarFotoOcorrencia(file, prefixo, abertoPor) {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width  = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)

        const agora = new Date()
        const ts = agora.toLocaleString('pt-BR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        })
        const fontSize = Math.max(18, Math.round(img.width * 0.032))
        const pad = 10
        const lineH = fontSize + 8
        const linhas = [ts, 'Ocorrência — Almoxarifado']
        if (prefixo)   linhas.push(`Equipe: ${prefixo}`)
        if (abertoPor) linhas.push(`Aberto por: ${abertoPor}`)
        const boxH = linhas.length * lineH + pad * 2
        const boxY = img.height - boxH - 10

        ctx.fillStyle = 'rgba(0,0,0,0.65)'
        ctx.fillRect(0, boxY, img.width, boxH + 10)
        ctx.font = `bold ${fontSize}px monospace`
        linhas.forEach((linha, i) => {
          const y = boxY + pad + fontSize + i * lineH
          ctx.fillStyle = 'rgba(0,0,0,0.8)'
          ctx.fillText(linha, pad + 2, y + 2)
          ctx.fillStyle = i === 0 ? '#ffffff' : '#a5b4fc'
          ctx.fillText(linha, pad, y)
        })
        resolve(canvas.toDataURL('image/jpeg', 0.88))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

// Campo de fiscal/supervisor destino: online, busca em `usuarios` (mesma
// fonte usada em GestaoPauta.jsx pra escolher o fiscal de uma pauta);
// offline (ou se a busca falhar), cai pra digitação livre — mesmo padrão
// online/offline do PrefixoInputValidado em S1Identificacao.jsx.
function CampoFiscalDestino({ nome, matricula, onNome, onMatricula }) {
  const [fiscais,   setFiscais]   = useState([])
  const [carregado, setCarregado] = useState(false)
  const [semLista,  setSemLista]  = useState(false)

  useEffect(() => {
    listarFiscaisParaDirecionamento()
      .then(data => { setFiscais(data); setCarregado(true) })
      .catch(() => { setSemLista(true); setCarregado(true) })
  }, [])

  if (semLista || (carregado && fiscais.length === 0)) {
    return (
      <div className="form-group">
        <label className="form-label">Direcionar para (Fiscal/Supervisor) *</label>
        <input className="form-input" value={nome}
          onChange={e => onNome(e.target.value.toUpperCase())}
          placeholder="Nome completo" />
        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
          📵 Sem conexão para buscar a lista — digite o nome manualmente.
        </p>
      </div>
    )
  }

  return (
    <div className="form-group">
      <label className="form-label">Direcionar para (Fiscal/Supervisor) *</label>
      <SearchSelect
        opcoes={fiscais.map(f => ({
          value: f.nome,
          label: f.matricula ? `${f.nome} (${f.matricula})` : f.nome,
        }))}
        valor={nome}
        onSelecionar={v => {
          onNome(v)
          const achado = fiscais.find(f => f.nome === v)
          onMatricula(achado?.matricula || '')
        }}
        placeholder={carregado ? 'Selecione o fiscal...' : 'Carregando...'}
      />
    </div>
  )
}

// Campo com autocomplete de prefixo — mesmo padrão de PrefixoInput em
// R3Participantes.jsx: sugestões conforme digita, buscando em
// estrutura_equipes. Sem internet, a busca simplesmente não retorna nada e
// o campo continua aceitando digitação livre (offline-first).
function CampoPrefixo({ value, onChange }) {
  const [sugestoes, setSugestoes] = useState([])
  const [aberto,    setAberto]    = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const buscar = async v => {
    if (!v || v.length < 1) { setSugestoes([]); setAberto(false); return }
    try {
      const { data } = await supabase.from('estrutura_equipes')
        .select('prefixo')
        .ilike('prefixo', `%${v}%`)
        .not('prefixo', 'is', null)
        .neq('prefixo', '')
        .order('prefixo')
        .limit(15)
      const unicos = [...new Set((data || []).map(r => r.prefixo?.trim()).filter(Boolean))]
      setSugestoes(unicos)
      setAberto(unicos.length > 0)
    } catch { setSugestoes([]); setAberto(false) }
  }

  const handleChange = e => {
    const v = e.target.value.toUpperCase()
    onChange(v)
    buscar(v)
  }

  const selecionar = s => { onChange(s); setSugestoes([]); setAberto(false) }

  return (
    <div ref={ref} className="form-group" style={{ position: 'relative' }}>
      <label className="form-label">Prefixo / Equipe *</label>
      <input className="form-input" value={value} onChange={handleChange}
        onFocus={() => value && buscar(value)}
        placeholder="Ex: PI-THE-C001M" autoComplete="off" />
      {aberto && sugestoes.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, marginTop: 2,
          background: '#fff', border: '1.5px solid #bfdbfe', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)', maxHeight: 200, overflowY: 'auto',
        }}>
          {sugestoes.map((s, i) => (
            <button key={i} onMouseDown={() => selecionar(s)}
              style={{
                display: 'block', width: '100%', padding: '9px 12px',
                textAlign: 'left', background: 'none', border: 'none',
                borderBottom: i < sugestoes.length - 1 ? '1px solid #f1f5f9' : 'none',
                fontSize: 13, fontWeight: 600, color: '#1e293b', cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >{s}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// Campo com autocomplete de colaborador — mesmo padrão de
// AutocompleteEletricista em R3Participantes.jsx, buscando em
// estrutura_equipes.colaborador.
function CampoColaboradorEnvolvido({ value, onChange }) {
  const [sugestoes, setSugestoes] = useState([])
  const [aberto,    setAberto]    = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const buscar = async v => {
    if (!v || v.length < 2) { setSugestoes([]); setAberto(false); return }
    try {
      const { data } = await supabase.from('estrutura_equipes')
        .select('colaborador').ilike('colaborador', `%${v}%`).order('colaborador').limit(15)
      const unicos = [...new Set((data || []).map(r => r.colaborador?.trim()).filter(Boolean))]
      setSugestoes(unicos)
      setAberto(unicos.length > 0)
    } catch { setSugestoes([]); setAberto(false) }
  }

  const handleChange = e => {
    const v = e.target.value
    onChange(v)
    buscar(v)
  }

  const selecionar = s => { onChange(s); setSugestoes([]); setAberto(false) }

  return (
    <div ref={ref} className="form-group" style={{ position: 'relative' }}>
      <label className="form-label">Colaborador(es) envolvido(s)</label>
      <input className="form-input" value={value} onChange={handleChange}
        onFocus={() => value && buscar(value)}
        placeholder="Opcional — nome do(s) colaborador(es)" autoComplete="off" />
      {aberto && sugestoes.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, marginTop: 2,
          background: '#fff', border: '1.5px solid #bfdbfe', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)', maxHeight: 200, overflowY: 'auto',
        }}>
          {sugestoes.map((s, i) => (
            <button key={i} onMouseDown={() => selecionar(s)}
              style={{
                display: 'block', width: '100%', padding: '9px 12px',
                textAlign: 'left', background: 'none', border: 'none',
                borderBottom: i < sugestoes.length - 1 ? '1px solid #f1f5f9' : 'none',
                fontSize: 13, fontWeight: 600, color: '#1e293b', cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >{s}</button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AberturaOcorrencia({ usuarioLogado, isOnline, onHome, onVoltar }) {
  const [prefixo,            setPrefixo]            = useState('')
  const [colaboradorEnvolvido, setColaboradorEnvolvido] = useState('')
  const [direcionadoPara,    setDirecionadoPara]    = useState('')
  const [matriculaDestino,   setMatriculaDestino]   = useState('')
  const [descricao,          setDescricao]          = useState('')
  const [foto,                setFoto]              = useState(null)
  const [status,              setStatus]            = useState('idle') // idle | saving | saved | error
  const [erro,                setErro]              = useState('')
  const [salvoOffline,        setSalvoOffline]      = useState(false)

  // Data/Hora de abertura — preenchidas automaticamente, mas editáveis
  // (mesmo padrão de R2Identificacao.jsx).
  const [data, setData] = useState(() => new Date().toISOString().split('T')[0])
  const [hora, setHora] = useState(() => new Date().toTimeString().slice(0, 5))

  // GPS/Endereço — captura automática ao abrir a tela; só mostra botão pra
  // tentar de novo se der erro (mesmo padrão de R2Identificacao.jsx, mas
  // sem exigir toque do usuário pra disparar a primeira captura).
  const [endereco,   setEndereco]   = useState('')
  const [lat,         setLat]       = useState(null)
  const [lng,         setLng]       = useState(null)
  const [gpsStatus,   setGpsStatus] = useState('idle') // idle | buscando | ok | erro
  const [geocodando,  setGeocodando] = useState(false)

  const online = isOnline !== undefined ? isOnline : navigator.onLine

  const obterGPS = () => {
    if (!navigator.geolocation) { setGpsStatus('erro'); return }
    setGpsStatus('buscando')
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const latitude  = pos.coords.latitude
        const longitude = pos.coords.longitude
        setLat(latitude); setLng(longitude); setGpsStatus('ok')

        setGeocodando(true)
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=pt-BR`,
            { headers: { 'Accept-Language': 'pt-BR' } }
          )
          const geo = await res.json()
          if (geo?.address) {
            const a = geo.address
            const partes = [
              a.road || a.pedestrian || a.path,
              a.house_number,
              a.suburb || a.neighbourhood || a.quarter,
              a.city || a.town || a.village,
              a.state,
            ].filter(Boolean)
            setEndereco(partes.join(', '))
          }
        } catch { /* silencioso — endereço fica em branco, GPS já foi capturado */ }
        finally { setGeocodando(false) }
      },
      () => setGpsStatus('erro'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  useEffect(() => { obterGPS() }, [])

  const podeEnviar = prefixo.trim() && direcionadoPara.trim() && descricao.trim().length > 0

  const addFoto = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = await processarFotoOcorrencia(file, prefixo, usuarioLogado?.nome)
    setFoto(url)
    e.target.value = ''
  }

  const enviar = async () => {
    if (!podeEnviar) return
    setStatus('saving')
    setErro('')

    const form = {
      prefixo:                   prefixo.trim().toUpperCase(),
      eletricista_equipe:        colaboradorEnvolvido.trim(),
      direcionado_para:          direcionadoPara.trim(),
      matricula_fiscal_destino:  matriculaDestino,
      descricao:                 descricao.trim(),
      foto,
      aberto_por:                usuarioLogado?.nome || '',
      matricula_aberto_por:      usuarioLogado?.matricula || '',
      data, hora, endereco, lat, lng,
    }

    if (!online) {
      try {
        await salvarOcorrenciaOffline(form)
        setSalvoOffline(true)
        setStatus('saved')
      } catch (err) {
        setErro('Erro ao salvar offline: ' + err.message)
        setStatus('error')
      }
      return
    }

    try {
      const payload = await prepararPayloadOcorrencia(form)
      await salvarOcorrenciaBD(payload)
      setSalvoOffline(false)
      setStatus('saved')
    } catch (err) {
      console.error('Erro ao salvar ocorrência:', err)
      setErro(err.message || 'Erro ao salvar. Verifique a conexão.')
      setStatus('error')
    }
  }

  const reiniciar = () => {
    setPrefixo(''); setColaboradorEnvolvido(''); setDirecionadoPara(''); setMatriculaDestino('')
    setDescricao(''); setFoto(null); setStatus('idle'); setErro(''); setSalvoOffline(false)
    setData(new Date().toISOString().split('T')[0]); setHora(new Date().toTimeString().slice(0, 5))
    setEndereco(''); setLat(null); setLng(null); setGpsStatus('idle')
    obterGPS()
  }

  return (
    <div className="app-shell">
      <header className="app-header no-print" style={{ background: '#4338ca' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Plataforma de Gestão Operacional
          </div>
          <button onClick={onHome} style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
            padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
          }}>🏠 Home</button>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>📦 Abertura de Ocorrência</div>
        <p style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
          Relate o problema e direcione para o fiscal tratar
        </p>
      </header>

      <main className="app-content">
        <div style={{ padding: '0 0 80px' }}>

          {!online && (
            <div style={{ background: '#fef3c7', border: '1.5px solid #f59e0b', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#92400e', fontWeight: 700 }}>
              📵 Sem internet — a ocorrência será salva localmente e enviada quando a conexão voltar.
            </div>
          )}

          {status === 'saved' ? (
            <>
              <div style={{ background: salvoOffline ? '#fef3c7' : '#eef2ff', border: `1.5px solid ${salvoOffline ? '#fcd34d' : '#c7d2fe'}`, borderRadius: 14, padding: '18px 16px', marginBottom: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>{salvoOffline ? '📵' : '✅'}</div>
                <p style={{ color: salvoOffline ? '#92400e' : '#3730a3', fontWeight: 800, fontSize: 15, marginBottom: 4 }}>
                  {salvoOffline ? 'Ocorrência salva localmente!' : 'Ocorrência enviada com sucesso!'}
                </p>
                <p style={{ color: '#64748b', fontSize: 12 }}>
                  {salvoOffline
                    ? 'Quando a internet voltar, será enviada automaticamente ao fiscal.'
                    : `Direcionada para ${direcionadoPara} — ela aparecerá pendente na tela de Tratamento de Não Conformidades.`}
                </p>
              </div>
              <button onClick={reiniciar} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#4338ca', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
                + Abrir Nova Ocorrência
              </button>
              <button onClick={onVoltar} style={{ width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                ← Voltar
              </button>
            </>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">Nome usuário</label>
                <input className="form-input" value={usuarioLogado?.nome || ''} disabled
                  style={{ background: '#f0fdf4', borderColor: '#86efac', color: '#166534', fontWeight: 700 }} />
              </div>
              <div className="form-group">
                <label className="form-label">Matrícula usuário</label>
                <input className="form-input" value={usuarioLogado?.matricula || ''} disabled
                  style={{ background: '#f0fdf4', borderColor: '#86efac', color: '#166534', fontWeight: 700 }} />
                <p style={{ fontSize: 11, color: '#16a34a', marginTop: 4 }}>✅ Preenchidos automaticamente do seu cadastro</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Data *</label>
                  <input className="form-input" type="date" value={data} onChange={e => setData(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Hora *</label>
                  <input className="form-input" type="time" value={hora} onChange={e => setHora(e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  Local / Endereço
                  {geocodando && <span style={{ fontSize: 11, color: '#2563eb', marginLeft: 8 }}>📍 Buscando endereço...</span>}
                </label>
                <input className="form-input" value={endereco} onChange={e => setEndereco(e.target.value)}
                  placeholder="Preenchido automaticamente pelo GPS" />
              </div>

              <div className="form-group">
                <label className="form-label">GPS</label>
                {gpsStatus === 'ok' ? (
                  <div style={{
                    width: '100%', padding: '11px 13px', borderRadius: 10,
                    border: '2px solid #86efac', background: '#f0fdf4', color: '#15803d',
                    fontSize: 13, fontWeight: 700,
                  }}>
                    ✅ GPS capturado: {lat?.toFixed(5)}, {lng?.toFixed(5)}
                  </div>
                ) : gpsStatus === 'buscando' ? (
                  <div style={{
                    width: '100%', padding: '11px 13px', borderRadius: 10,
                    border: '2px solid #f59e0b', background: '#fffbeb', color: '#92400e',
                    fontSize: 13, fontWeight: 700,
                  }}>
                    ⏳ Capturando localização...
                  </div>
                ) : (
                  <button onClick={obterGPS} style={{
                    width: '100%', padding: '13px', borderRadius: 10,
                    border: '2px solid #fca5a5', background: '#fef2f2', color: '#dc2626',
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  }}>
                    ❌ Erro ao capturar GPS — toque para tentar novamente
                  </button>
                )}
              </div>

              <CampoPrefixo value={prefixo} onChange={setPrefixo} />

              <CampoColaboradorEnvolvido value={colaboradorEnvolvido} onChange={setColaboradorEnvolvido} />

              <CampoFiscalDestino
                nome={direcionadoPara} matricula={matriculaDestino}
                onNome={setDirecionadoPara} onMatricula={setMatriculaDestino}
              />

              <Textarea label="Descrição da ocorrência *" value={descricao} onChange={setDescricao}
                placeholder="Descreva o que aconteceu (ex: devolução de medidor antigo não realizada)..." rows={4} />

              <div className="form-group">
                <label className="form-label">Foto (opcional)</label>
                {foto ? (
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <img src={foto} alt="Evidência" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 10, border: '1px solid #e2e8f0' }} />
                    <button onClick={() => setFoto(null)} style={{
                      position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: '50%',
                      background: '#dc2626', color: '#fff', border: '2px solid #fff', fontSize: 14, cursor: 'pointer',
                    }}>×</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <label style={{ flex: 1, cursor: 'pointer' }}>
                      <input type="file" accept="image/*" capture="environment" onChange={addFoto} style={{ display: 'none' }} />
                      <div className="upload-zone" style={{ marginBottom: 0 }}>
                        <div style={{ fontSize: 28, marginBottom: 6 }}>📷</div>
                        <p style={{ color: '#4338ca', fontWeight: 700, fontSize: 13 }}>Tirar foto</p>
                        <p style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Câmera</p>
                      </div>
                    </label>
                    <label style={{ flex: 1, cursor: 'pointer' }}>
                      <input type="file" accept="image/*" onChange={addFoto} style={{ display: 'none' }} />
                      <div className="upload-zone" style={{ marginBottom: 0 }}>
                        <div style={{ fontSize: 28, marginBottom: 6 }}>🖼️</div>
                        <p style={{ color: '#7c3aed', fontWeight: 700, fontSize: 13 }}>Da galeria</p>
                        <p style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Galeria</p>
                      </div>
                    </label>
                  </div>
                )}
              </div>

              {erro && (
                <div className="alert alert-danger" style={{ marginBottom: 14 }}>❌ {erro}</div>
              )}

              <button onClick={enviar} disabled={!podeEnviar || status === 'saving'} style={{
                width: '100%', padding: 14, borderRadius: 12, border: 'none',
                background: (!podeEnviar || status === 'saving') ? '#e2e8f0' : (online ? '#4338ca' : '#dc2626'),
                color: (!podeEnviar || status === 'saving') ? '#94a3b8' : '#fff',
                fontSize: 15, fontWeight: 700, cursor: (!podeEnviar || status === 'saving') ? 'not-allowed' : 'pointer',
                marginBottom: 10,
              }}>
                {status === 'saving' ? '⏳ Enviando...' : online ? '📦 Enviar Ocorrência' : '📵 Salvar Offline'}
              </button>
              <button onClick={onVoltar} style={{ width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                ← Cancelar
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
