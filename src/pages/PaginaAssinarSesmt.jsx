import { useState, useEffect, useRef } from 'react'
import { buscarTokenSesmtPorUUID, salvarAssinaturaSesmtColetada, verificarJaAssinouSesmt, listarAssinaturasSesmtColetadas, buscarPessoasSesmtPorNome } from '../lib/sesmt.js'
import { TIPOS_ACAO_SESMT } from '../data/sesmt_config.js'
import { CarregandoHexagono } from '../components/Shared.jsx'

async function geocodificarReverso(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=pt-BR`,
      { headers: { 'User-Agent': 'DPL-Auditoria-Campo/1.0' } }
    )
    const data = await res.json()
    if (data?.display_name) {
      const a = data.address || {}
      const partes = [a.road || a.pedestrian || a.path, a.house_number, a.suburb || a.neighbourhood || a.quarter, a.city || a.town || a.village || a.municipality, a.state].filter(Boolean)
      return partes.join(', ')
    }
    return null
  } catch { return null }
}

function capturarGPS() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, enableHighAccuracy: true }
    )
  })
}

function AssinaturaPad({ onConfirmar }) {
  const canvasRef = useRef(null)
  const [desenhando, setDesenhando] = useState(false)
  const [temTraco,   setTemTraco]   = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fafafa'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  }, [])

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const src  = e.touches ? e.touches[0] : e
    return { x: (src.clientX - rect.left) * (canvas.width / rect.width), y: (src.clientY - rect.top) * (canvas.height / rect.height) }
  }
  const iniciar  = e => { e.preventDefault(); const pos = getPos(e, canvasRef.current); setDesenhando(true); setTemTraco(true); const ctx = canvasRef.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(pos.x, pos.y) }
  const desenhar = e => { e.preventDefault(); if (!desenhando) return; const pos = getPos(e, canvasRef.current); const ctx = canvasRef.current.getContext('2d'); ctx.lineTo(pos.x, pos.y); ctx.stroke() }
  const parar    = e => { e.preventDefault(); setDesenhando(false) }
  const limpar   = () => { const ctx = canvasRef.current.getContext('2d'); ctx.fillStyle = '#fafafa'; ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height); setTemTraco(false) }

  return (
    <div>
      <canvas ref={canvasRef} width={340} height={160}
        onMouseDown={iniciar} onMouseMove={desenhar} onMouseUp={parar} onMouseLeave={parar}
        onTouchStart={iniciar} onTouchMove={desenhar} onTouchEnd={parar}
        style={{ width: '100%', height: 160, borderRadius: 12, border: '2px solid #e2e8f0', background: '#fafafa', cursor: 'crosshair', display: 'block', touchAction: 'none' }} />
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <button onClick={limpar} style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>🔄 Limpar</button>
        <button onClick={() => temTraco && onConfirmar(canvasRef.current.toDataURL('image/png'))} disabled={!temTraco}
          style={{ flex: 2, padding: 10, borderRadius: 10, border: 'none', background: temTraco ? '#1e3a5f' : '#e2e8f0', color: temTraco ? '#fff' : '#94a3b8', fontSize: 14, fontWeight: 700, cursor: temTraco ? 'pointer' : 'not-allowed' }}>
          ✅ Confirmar Assinatura
        </button>
      </div>
    </div>
  )
}

function AutocompleteNome({ participantesAcao, onSelect }) {
  const [termo,     setTermo]     = useState('')
  const [sugestoes, setSugestoes] = useState([])
  const [aberto,    setAberto]    = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const buscar = async (v) => {
    setTermo(v)
    if (v.length < 2) { setSugestoes([]); setAberto(false); return }
    const t = v.toLowerCase()
    const doAcao = (participantesAcao || [])
      .filter(p => p.nome?.toLowerCase().includes(t))
      .map(p => ({ nome: p.nome, chapa: p.chapa || '', fonte: 'acao' }))
    let daLista = []
    try {
      const pessoas = await buscarPessoasSesmtPorNome(v)
      const set = new Set(doAcao.map(p => p.nome?.trim().toLowerCase()))
      daLista = pessoas.filter(p => !set.has(p.nome?.trim().toLowerCase())).map(p => ({ nome: p.nome, chapa: p.chapa || '', fonte: 'lista' }))
    } catch { /* silencioso */ }
    const todos = [...doAcao, ...daLista]
    setSugestoes(todos); setAberto(todos.length > 0)
  }

  const selecionar = (item) => {
    setTermo(item.nome); setSugestoes([]); setAberto(false)
    onSelect(item.nome, item.chapa)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input value={termo} onChange={e => buscar(e.target.value)}
        onFocus={() => sugestoes.length > 0 && setAberto(true)}
        placeholder="Digite seu nome ou selecione abaixo..."
        style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />
      {aberto && sugestoes.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 500, background: '#fff', border: '1.5px solid #bfdbfe', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', maxHeight: 240, overflowY: 'auto' }}>
          {sugestoes.map((s, i) => (
            <button key={i} onMouseDown={() => selecionar(s)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '11px 14px', textAlign: 'left', background: 'none', border: 'none', borderBottom: i < sugestoes.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{s.nome}</span>
                {s.fonte === 'acao' && <span style={{ fontSize: 10, color: '#16a34a', marginLeft: 8, background: '#dcfce7', padding: '1px 6px', borderRadius: 4 }}>na lista</span>}
              </div>
              {s.chapa && <span style={{ fontSize: 12, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: 6 }}>Matrícula: {s.chapa}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PaginaAssinarSesmt({ tokenUUID }) {
  const [fase,       setFase]       = useState('carregando')
  const [tokenData,  setTokenData]  = useState(null)
  const [assinadas,  setAssinadas]  = useState([])
  const [nome,       setNome]       = useState('')
  const [chapa,      setChapa]      = useState('')
  const [erro,       setErro]       = useState('')
  const [salvando,   setSalvando]   = useState(false)
  const [msgSalvando, setMsgSalvando] = useState('')
  const [countdown,  setCountdown]  = useState('')
  const [localAssinatura, setLocalAssinatura] = useState(null)

  const acao             = tokenData?.sesmt_acoes
  const tipoConfig        = acao ? TIPOS_ACAO_SESMT[acao.tipo] : null
  const participantesAcao = acao?.participantes || []

  useEffect(() => { carregarToken() }, [tokenUUID])

  useEffect(() => {
    if (!tokenData?.expires_at || fase === 'sucesso') return
    const tick = () => {
      const diff = new Date(tokenData.expires_at) - new Date()
      if (diff <= 0) { setCountdown('expirado'); setFase('expirado'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setCountdown(h > 0 ? `${h}h ${String(m).padStart(2,'0')}min` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [tokenData, fase])

  const carregarToken = async () => {
    try {
      const data = await buscarTokenSesmtPorUUID(tokenUUID)
      setTokenData(data)
      if (data.status === 'ENCERRADO') { setFase('encerrado'); return }
      if (new Date(data.expires_at) < new Date()) { setFase('expirado'); return }
      const coletadas = await listarAssinaturasSesmtColetadas(data.id)
      setAssinadas(coletadas)
      setFase('formulario')
    } catch (e) { console.error(e); setFase('erro') }
  }

  const onSelectNome = (n, c) => { setNome(n); setChapa(c); setErro('') }

  const prosseguirParaAssinatura = async () => {
    if (!nome.trim()) { setErro('Digite seu nome completo.'); return }
    setErro('')

    if (participantesAcao.length > 0) {
      const participanteEncontrado = participantesAcao.find(p => p.nome?.trim().toLowerCase() === nome.trim().toLowerCase())
      if (!participanteEncontrado) {
        setErro(`"${nome.trim()}" não está na lista de participantes. Somente as pessoas cadastradas pelo fiscal podem assinar.`)
        return
      }
      if (participanteEncontrado.assinatura_url) {
        setErro(`"${nome.trim()}" já assinou esta ação presencialmente. Não é possível assinar duas vezes.`)
        return
      }
    }

    const jaAssinou = await verificarJaAssinouSesmt(tokenData.id, nome.trim())
    if (jaAssinou) {
      setErro(`"${nome.trim()}" já assinou às ${new Date(jaAssinou.assinado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`)
      return
    }

    setFase('assinando')
  }

  const onConfirmarAssinatura = async (assinaturaBase64) => {
    setSalvando(true)
    setMsgSalvando('📍 Capturando sua localização...')

    let lat = null, lng = null, endereco = null
    try {
      const gps = await capturarGPS()
      if (gps) {
        lat = gps.lat; lng = gps.lng
        setMsgSalvando('🗺️ Identificando endereço...')
        endereco = await geocodificarReverso(lat, lng)
        setLocalAssinatura({ endereco })
      }
    } catch { /* GPS negado */ }

    setMsgSalvando('💾 Salvando assinatura...')
    try {
      await salvarAssinaturaSesmtColetada(tokenData.id, tokenData.acao_id, nome.trim(), chapa.trim(), assinaturaBase64, lat, lng, endereco)
      setFase('sucesso')
    } catch (e) {
      console.error(e)
      setErro('Erro ao salvar assinatura. Tente novamente.')
      setFase('formulario')
    } finally {
      setSalvando(false); setMsgSalvando('')
    }
  }

  const formatData = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

  const telaSimples = (emoji, titulo, msg, cor = '#64748b') => (
    <div style={styles.tela}>
      <div style={{ textAlign: 'center', padding: 60 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>{emoji}</div>
        <p style={{ fontSize: 18, fontWeight: 700, color: cor, marginBottom: 8 }}>{titulo}</p>
        <p style={{ fontSize: 14, color: '#64748b' }}>{msg}</p>
      </div>
    </div>
  )

  if (fase === 'carregando') return <div style={styles.tela}><CarregandoHexagono texto="Aguarde um momento..." tamanho={64} padding={60} /></div>
  if (fase === 'erro')       return telaSimples('❌', 'Link inválido', 'Este link não existe ou foi removido.', '#dc2626')
  if (fase === 'expirado')   return telaSimples('⏰', 'Link expirado', 'O prazo para assinar encerrou. Solicite um novo link ao fiscal.', '#d97706')
  if (fase === 'encerrado')  return telaSimples('🔒', 'Link encerrado', 'O fiscal encerrou este link.', '#64748b')

  if (fase === 'sucesso') return (
    <div style={styles.tela}>
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
        <p style={{ fontSize: 22, fontWeight: 800, color: '#15803d', marginBottom: 8 }}>Assinatura registrada!</p>
        <p style={{ fontSize: 15, color: '#64748b', marginBottom: 6 }}>Obrigado, <strong>{nome}</strong>!</p>
        <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>Sua assinatura foi salva com sucesso.<br />Você pode fechar esta página.</p>

        {localAssinatura?.endereco && (
          <div style={{ marginTop: 16, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', textAlign: 'left' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', marginBottom: 4 }}>📍 LOCAL REGISTRADO</p>
            <p style={{ fontSize: 13, color: '#1e293b' }}>{localAssinatura.endereco}</p>
          </div>
        )}

        {acao && (
          <div style={{ marginTop: 16, background: tipoConfig?.bg, border: `1.5px solid ${tipoConfig?.border}`, borderRadius: 14, padding: 16, textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 22 }}>{tipoConfig?.emoji}</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: tipoConfig?.color }}>{tipoConfig?.label}</span>
            </div>
            <p style={{ fontSize: 13, color: '#475569' }}>
              <strong>Fiscal:</strong> {acao.fiscal}<br />
              <strong>Data:</strong> {formatData(acao.data_registro)} às {acao.hora_registro}
            </p>
          </div>
        )}
        <div style={{ marginTop: 16, background: '#f1f5f9', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#64748b' }}>
          DPL Construções — Contrato Equatorial Energia 1021/2024
        </div>
      </div>
    </div>
  )

  return (
    <div style={styles.tela}>
      <div style={{ background: 'linear-gradient(135deg, #1e3a5f, #1d4ed8)', color: '#fff', padding: '16px 20px', borderRadius: '0 0 20px 20px', marginBottom: 20 }}>
        <p style={{ fontSize: 11, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>DPL Construções — Equatorial Energia</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>{tipoConfig?.emoji || '🦺'}</span>
            <div>
              <p style={{ fontSize: 17, fontWeight: 800 }}>{tipoConfig?.label || 'Ação SESMT'}</p>
              <p style={{ fontSize: 12, opacity: 0.8 }}>Assinatura digital solicitada</p>
            </div>
          </div>
          {countdown && countdown !== 'expirado' && (
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: '6px 10px', textAlign: 'center' }}>
              <p style={{ fontSize: 9, opacity: 0.8, marginBottom: 1 }}>EXPIRA EM</p>
              <p style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{countdown}</p>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '0 16px 40px' }}>
        {acao && (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16, marginBottom: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, textTransform: 'uppercase' }}>Detalhes da Ação</p>
            {[['Fiscal', acao.fiscal], ['Data/Hora', `${formatData(acao.data_registro)} às ${acao.hora_registro}`], ['Tema', acao.tema]].filter(([, v]) => v).map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                <span style={{ color: '#94a3b8', fontWeight: 500 }}>{l}</span>
                <span style={{ color: '#1e293b', fontWeight: 600, textAlign: 'right', maxWidth: '65%', wordBreak: 'break-word' }}>{v}</span>
              </div>
            ))}
            {acao.motivo && (
              <div style={{ marginTop: 12, background: '#fffbeb', borderRadius: 8, padding: '10px 12px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>MOTIVO:</p>
                <p style={{ fontSize: 13, color: '#78350f', lineHeight: 1.6 }}>{acao.motivo}</p>
              </div>
            )}
          </div>
        )}

        {assinadas.length > 0 && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 8 }}>✅ {assinadas.length} pessoa(s) já assinaram</p>
            {assinadas.map((a, i) => (
              <div key={i} style={{ fontSize: 13, color: '#15803d', padding: '3px 0' }}>{i + 1}. {a.nome} {a.matricula ? `(Matrícula: ${a.matricula})` : ''}</div>
            ))}
          </div>
        )}

        {fase === 'formulario' && (
          <>
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16, marginBottom: 16 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 14 }}>✍️ Sua identificação</p>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Nome completo *</label>
                <AutocompleteNome participantesAcao={participantesAcao} onSelect={onSelectNome} />
                {nome && <p style={{ fontSize: 11, color: '#16a34a', marginTop: 4 }}>✅ {nome}</p>}
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Matrícula (opcional)</label>
                <input value={chapa} onChange={e => setChapa(e.target.value)}
                  placeholder="Sua matrícula" inputMode="numeric"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 15, outline: 'none', boxSizing: 'border-box', background: chapa ? '#f0fdf4' : '#fff' }} />
              </div>

              <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: '#0369a1' }}>
                📍 Ao assinar, sua localização será registrada automaticamente como evidência.
              </div>

              {erro && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13, color: '#b91c1c', lineHeight: 1.5 }}>⚠️ {erro}</div>
              )}

              <button onClick={prosseguirParaAssinatura} disabled={!nome.trim()}
                style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: nome.trim() ? '#1e3a5f' : '#e2e8f0', color: nome.trim() ? '#fff' : '#94a3b8', fontSize: 16, fontWeight: 700, cursor: nome.trim() ? 'pointer' : 'not-allowed' }}>
                Continuar para assinar →
              </button>
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', lineHeight: 1.6 }}>
              Ao assinar, você confirma que participou desta ação de {tipoConfig?.label?.toLowerCase() || 'SESMT'} e está ciente do conteúdo acima.
            </p>
          </>
        )}

        {fase === 'assinando' && (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Assinatura de {nome}</p>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>Assine no campo abaixo com o dedo</p>
            {salvando ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>{msgSalvando.startsWith('📍') ? '📍' : msgSalvando.startsWith('🗺️') ? '🗺️' : '💾'}</div>
                <p style={{ fontSize: 14, color: '#2563eb', fontWeight: 600 }}>{msgSalvando}</p>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>Aguarde, não feche esta página...</p>
              </div>
            ) : (
              <>
                <AssinaturaPad onConfirmar={onConfirmarAssinatura} />
                <button onClick={() => setFase('formulario')} style={{ width: '100%', marginTop: 12, padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>← Voltar</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  tela: { minHeight: '100vh', background: '#f0f4f8', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
}
