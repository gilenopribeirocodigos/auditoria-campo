import { useState, useRef, useEffect } from 'react'
import { TIPOS_ACAO_SESMT } from '../../data/sesmt_config.js'
import { buscarPessoasSesmtPorNome, buscarPessoasSesmtPorChapa, prepararPayloadSesmt, criarAcaoRascunhoSesmt } from '../../lib/sesmt.js'
import ModalLinkAssinaturaSesmt from '../../components/ModalLinkAssinaturaSesmt.jsx'

// ── Canvas de assinatura (mesmo padrão de R3Participantes.jsx) ────────────────
function AssinaturaPad({ nomeParticipante, onConfirmar, onCancelar }) {
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 20, width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <p style={{ fontSize: 12, color: '#64748b' }}>Assinatura de</p>
          <p style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>{nomeParticipante}</p>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Assine abaixo para confirmar participação</p>
        </div>
        <canvas ref={canvasRef} width={380} height={180}
          onMouseDown={iniciar} onMouseMove={desenhar} onMouseUp={parar} onMouseLeave={parar}
          onTouchStart={iniciar} onTouchMove={desenhar} onTouchEnd={parar}
          style={{ width: '100%', height: 180, borderRadius: 12, border: '2px solid #e2e8f0', background: '#fafafa', cursor: 'crosshair', display: 'block', touchAction: 'none' }} />
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={limpar} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>🔄 Limpar</button>
          <button onClick={onCancelar} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>✕ Cancelar</button>
          <button onClick={() => temTraco && onConfirmar(canvasRef.current.toDataURL('image/png'))} disabled={!temTraco}
            style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: temTraco ? '#16a34a' : '#e2e8f0', color: temTraco ? '#fff' : '#94a3b8', fontSize: 14, fontWeight: 700, cursor: temTraco ? 'pointer' : 'not-allowed' }}>
            ✅ Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Um campo buscável (usado tanto pra Matrícula quanto pra Nome) — busca em
// sesmt_pessoas pela função informada e mostra sugestões com os dois dados.
function CampoBusca({ label, placeholder, value, onChangeTexto, onSelecionar, buscarFn, exibirPrincipal, exibirBadge, autoFocus }) {
  const [sugestoes, setSugestoes] = useState([])
  const [aberto,    setAberto]    = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const buscar = async (v) => {
    onChangeTexto(v)
    if (v.length < 2) { setSugestoes([]); setAberto(false); return }
    try {
      const pessoas = await buscarFn(v)
      if (pessoas.length > 0) { setSugestoes(pessoas); setAberto(true) }
      else { setSugestoes([]); setAberto(false) }
    } catch { setSugestoes([]); setAberto(false) }
  }

  const selecionar = (p) => {
    setSugestoes([]); setAberto(false)
    onSelecionar(p)
  }

  return (
    <div ref={ref} className="form-group" style={{ position: 'relative' }}>
      <label className="form-label">{label}</label>
      <input className="form-input" value={value} onChange={e => buscar(e.target.value)}
        onFocus={() => sugestoes.length > 0 && setAberto(true)}
        placeholder={placeholder} autoComplete="off" autoFocus={autoFocus} />
      {aberto && sugestoes.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 500, background: '#fff', border: '1.5px solid #bfdbfe', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', maxHeight: 240, overflowY: 'auto' }}>
          {sugestoes.map((p, i) => (
            <button key={i} onMouseDown={() => selecionar(p)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '11px 14px', textAlign: 'left', background: 'none', border: 'none', borderBottom: i < sugestoes.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{exibirPrincipal(p)}</span>
              {exibirBadge(p) && <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 700, background: '#eff6ff', padding: '2px 8px', borderRadius: 6 }}>{exibirBadge(p)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Autocomplete: busca em sesmt_pessoas (carregada na Fase 1), pela
// matrícula OU pelo nome — os dois campos preenchem um ao outro ao escolher
// uma sugestão em qualquer um deles.
// onSelect(nome, chapa, pessoaId) — pessoaId só vem quando o fiscal
// realmente escolhe uma sugestão da lista carregada (não ao digitar texto
// livre); grava em participantes[].pessoa_id, quando disponível, pro
// vínculo com sesmt_pessoas ficar completo também nesse canal.
function AutocompleteSesmt({ onSelect }) {
  const [chapa, setChapa] = useState('')
  const [nome,  setNome]  = useState('')

  const selecionarPorChapa = (p) => {
    setChapa(p.chapa || ''); setNome(p.nome)
    onSelect(p.nome, p.chapa || '', p.id)
  }
  const selecionarPorNome = (p) => {
    setNome(p.nome); setChapa(p.chapa || '')
    onSelect(p.nome, p.chapa || '', p.id)
  }

  return (
    <div>
      <CampoBusca
        label="Matrícula *" placeholder="Digite a matrícula..." autoFocus
        value={chapa}
        onChangeTexto={v => { setChapa(v); onSelect(nome, v, null) }}
        onSelecionar={selecionarPorChapa}
        buscarFn={buscarPessoasSesmtPorChapa}
        exibirPrincipal={p => p.chapa}
        exibirBadge={p => p.nome}
      />
      <CampoBusca
        label="Nome *" placeholder="Digite para buscar..."
        value={nome}
        onChangeTexto={v => { setNome(v); onSelect(v, chapa, null) }}
        onSelecionar={selecionarPorNome}
        buscarFn={buscarPessoasSesmtPorNome}
        exibirPrincipal={p => p.nome}
        exibirBadge={p => p.chapa ? `Matrícula: ${p.chapa}` : ''}
      />
    </div>
  )
}

function FormParticipante({ onSolicitar, onCancelar }) {
  const [nome, setNome] = useState('')
  const [chapa, setChapa] = useState('')
  const [pessoaId, setPessoaId] = useState(null)
  return (
    <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 14, padding: 16, marginBottom: 12 }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>Novo participante presencial</p>
      <AutocompleteSesmt onSelect={(n, c, id) => { setNome(n); setChapa(c); setPessoaId(id || null) }} />
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        {onCancelar && <button onClick={onCancelar} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>}
        <button onClick={() => onSolicitar(nome.trim(), chapa.trim(), pessoaId)} disabled={!nome.trim()}
          style={{ flex: 2, padding: 11, borderRadius: 10, border: 'none', background: nome.trim() ? '#1e3a5f' : '#e2e8f0', color: nome.trim() ? '#fff' : '#94a3b8', fontSize: 13, fontWeight: 700, cursor: nome.trim() ? 'pointer' : 'not-allowed' }}>
          ✍️ Solicitar Assinatura
        </button>
      </div>
    </div>
  )
}

function FormParticipanteOnline({ onAdicionar, onCancelar }) {
  const [nome, setNome] = useState('')
  const [chapa, setChapa] = useState('')
  const [pessoaId, setPessoaId] = useState(null)
  return (
    <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 14, padding: 16, marginBottom: 12 }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: '#1d4ed8', marginBottom: 4 }}>Participante online</p>
      <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Irá assinar via link/QR Code — sem assinatura agora</p>
      <AutocompleteSesmt onSelect={(n, c, id) => { setNome(n); setChapa(c); setPessoaId(id || null) }} />
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        {onCancelar && <button onClick={onCancelar} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>}
        <button onClick={() => onAdicionar(nome.trim(), chapa.trim(), pessoaId)} disabled={!nome.trim()}
          style={{ flex: 2, padding: 11, borderRadius: 10, border: 'none', background: nome.trim() ? '#2563eb' : '#e2e8f0', color: nome.trim() ? '#fff' : '#94a3b8', fontSize: 13, fontWeight: 700, cursor: nome.trim() ? 'pointer' : 'not-allowed' }}>
          + Adicionar à lista
        </button>
      </div>
    </div>
  )
}

async function capturarLocalizacao() {
  let lat = null, lng = null, endereco_assinatura = null
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation
        ? navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000, enableHighAccuracy: true })
        : rej()
    )
    lat = pos.coords.latitude; lng = pos.coords.longitude
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=pt-BR`,
        { headers: { 'User-Agent': 'DPL-Auditoria-Campo/1.0' } }
      )
      const d = await r.json()
      if (d?.address) {
        const a = d.address
        endereco_assinatura = [a.road || a.pedestrian, a.suburb || a.neighbourhood, a.city || a.town || a.village, a.state].filter(Boolean).join(', ')
      }
    } catch { /* silencioso */ }
  } catch { /* GPS negado */ }
  return { lat, lng, endereco_assinatura }
}

// ── Componente principal ──────────────────────────────────────────────────────
// Só entram na lista final quem realmente assinou (presencial na hora) ou vai
// assinar (online, via link gerado na tela de Resultado) — nunca uma lista de
// convidados sem confirmação.
export default function SS3Participantes({ form, upd, next, prev }) {
  const tipoConfig = TIPOS_ACAO_SESMT[form.tipo]
  const [assinandoPart, setAssinandoPart] = useState(null)
  const [adicionando,   setAdicionando]   = useState(false)
  const [modoAdd,       setModoAdd]       = useState(null)
  const [confirmarPend, setConfirmarPend] = useState(false)
  const [qrAberto,      setQrAberto]      = useState(false)
  const [preparandoQr,  setPreparandoQr]  = useState(false)
  const [erroQr,        setErroQr]        = useState('')

  const podeProsseguir = form.participantes.length > 0
  const presenciaisPendentes = form.participantes.filter(p => p.modo === 'presencial' && !p.assinatura && !p.assinatura_url).length

  // A forma de assinar (presencial/online) só é perguntada no primeiro
  // participante — os demais seguem automaticamente a mesma escolha.
  const modoTravado = form.participantes.length > 0 ? form.participantes[0].modo : null
  const presencialAtivo = modoTravado === 'presencial' || modoAdd === 'presencial'

  useEffect(() => {
    if (form.participantes.length === 0 && !adicionando) setAdicionando(true)
  }, [])

  const iniciarAdicao = () => {
    setAdicionando(true)
    setModoAdd(modoTravado)
  }

  // Gera (na 1ª vez) a ação como rascunho no banco — precisa de um acao_id
  // real pra apontar o token do QR — e abre o modal do QR de autoatendimento.
  const abrirQrAutoatendimento = async () => {
    setErroQr('')
    if (form.acaoRascunhoId) { setQrAberto(true); return }
    setPreparandoQr(true)
    try {
      const payload = await prepararPayloadSesmt(form)
      const rascunho = await criarAcaoRascunhoSesmt(payload)
      upd('acaoRascunhoId', rascunho.id)
      setQrAberto(true)
    } catch (e) {
      setErroQr('Erro ao preparar o QR: ' + e.message)
    } finally {
      setPreparandoQr(false)
    }
  }

  // Assinaturas coletadas via QR de autoatendimento entram na lista de
  // participantes como presenciais já assinados (sem duplicar quem já
  // estiver lá pelo nome).
  const onImportarAssinadosAutoatendimento = (assinadasList) => {
    const jaTem = new Set(form.participantes.map(p => p.nome?.trim().toLowerCase()))
    const novos = (assinadasList || [])
      .filter(a => !jaTem.has(a.nome?.trim().toLowerCase()))
      .map(a => ({
        nome: a.nome, chapa: a.matricula || '', pessoa_id: a.pessoa_id || null,
        assinatura: null, assinatura_url: a.assinatura_url,
        assinado_em: a.assinado_em, modo: 'presencial',
        lat: a.latitude, lng: a.longitude, endereco_assinatura: a.endereco_assinatura,
      }))
    if (novos.length > 0) upd('participantes', [...form.participantes, ...novos])
  }

  const onSolicitarAssinatura = (nome, chapa, pessoaId) => {
    if (!nome) return
    setAdicionando(false); setModoAdd(null)
    setAssinandoPart({ nome, chapa, pessoaId })
  }

  const assinarExistente = (idx) => {
    const p = form.participantes[idx]
    setAssinandoPart({ nome: p.nome, idx })
  }

  const onConfirmarAssinatura = async (png) => {
    const { lat, lng, endereco_assinatura } = await capturarLocalizacao()

    if (assinandoPart.idx !== undefined && assinandoPart.idx !== null) {
      const novos = form.participantes.map((p, i) =>
        i === assinandoPart.idx
          ? { ...p, assinatura: png, assinado_em: new Date().toISOString(), modo: 'presencial', lat, lng, endereco_assinatura }
          : p
      )
      upd('participantes', novos)
      setAssinandoPart(null)
      return
    }

    upd('participantes', [...form.participantes, {
      nome: assinandoPart.nome, chapa: assinandoPart.chapa || '', pessoa_id: assinandoPart.pessoaId || null,
      assinatura: png, assinado_em: new Date().toISOString(), modo: 'presencial',
      lat, lng, endereco_assinatura,
    }])
    setAssinandoPart(null)
  }

  const onAdicionarOnline = (nome, chapa, pessoaId) => {
    if (!nome) return
    upd('participantes', [...form.participantes, {
      nome, chapa: chapa || '', pessoa_id: pessoaId || null, assinatura: null, assinado_em: null, modo: 'online',
    }])
    setAdicionando(false); setModoAdd(null)
  }

  const remover = (idx) => upd('participantes', form.participantes.filter((_, i) => i !== idx))

  const tentarContinuar = () => {
    if (presenciaisPendentes > 0) setConfirmarPend(true)
    else next()
  }

  return (
    <div style={{ padding: '0 0 80px' }}>
      <div style={{ background: tipoConfig?.bg, border: `1.5px solid ${tipoConfig?.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>{tipoConfig?.emoji}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: tipoConfig?.color }}>{tipoConfig?.label}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: '#1e293b' }}>Participantes</h2>
        <span style={{ fontSize: 12, color: '#64748b' }}>{form.participantes.length}</span>
      </div>

      {presenciaisPendentes > 0 && (
        <div style={{ background: '#fef3c7', border: '1.5px solid #f59e0b', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#92400e', margin: 0 }}>✍️ {presenciaisPendentes} participante(s) presencial(is) ainda não assinaram</p>
          <p style={{ fontSize: 12, color: '#b45309', margin: '4px 0 0' }}>Toque em <strong>✍️ Assinar</strong> ao lado de cada um para coletar a assinatura.</p>
        </div>
      )}

      {form.participantes.map((p, i) => {
        const assinado = Boolean(p.assinatura || p.assinatura_url)
        const pendentePresencial = p.modo === 'presencial' && !assinado
        const nomeColor = p.modo === 'online' ? '#1d4ed8' : pendentePresencial ? '#92400e' : '#15803d'
        return (
          <div key={i} style={{
            background: p.modo === 'online' ? '#eff6ff' : pendentePresencial ? '#fffbeb' : '#f0fdf4',
            border: `1.5px solid ${p.modo === 'online' ? '#bfdbfe' : pendentePresencial ? '#fcd34d' : '#86efac'}`,
            borderRadius: 12, padding: '12px 14px', marginBottom: 10,
            display: 'flex', alignItems: 'flex-start', gap: 12,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: nomeColor }}>{i + 1}. {p.nome}</p>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 6, background: p.modo === 'online' ? '#dbeafe' : '#dcfce7', color: p.modo === 'online' ? '#1d4ed8' : '#15803d' }}>
                  {p.modo === 'online' ? '🔗 Online' : '✍️ Presencial'}
                </span>
              </div>
              {p.chapa && <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 6px' }}>Matrícula: {p.chapa}</p>}
              {assinado && <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>✅ Assinado{p.assinado_em ? ` · ${new Date(p.assinado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}</p>}
              {!assinado && p.modo === 'online' && <p style={{ fontSize: 11, color: '#2563eb', margin: 0 }}>⏳ Assinará via link</p>}
              {pendentePresencial && <p style={{ fontSize: 11, color: '#d97706', fontWeight: 600, margin: 0 }}>⚠️ Aguardando assinatura</p>}
            </div>

            {assinado && <img src={p.assinatura || p.assinatura_url} alt="assinatura" style={{ width: 80, height: 40, objectFit: 'contain', borderRadius: 6, background: '#fff', border: '1px solid #e2e8f0', flexShrink: 0 }} />}

            {pendentePresencial && (
              <button onClick={() => assinarExistente(i)} style={{ padding: '8px 12px', borderRadius: 10, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>✍️ Assinar</button>
            )}

            <button onClick={() => remover(i)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>✕</button>
          </div>
        )
      })}

      {adicionando && !modoAdd && (
        <div style={{ background: '#f8fafc', border: '1.5px dashed #e2e8f0', borderRadius: 14, padding: 16, marginBottom: 12 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>Como este participante irá assinar?</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button onClick={() => setModoAdd('presencial')} style={{ padding: '16px 10px', borderRadius: 12, border: '2px solid #16a34a', background: '#f0fdf4', cursor: 'pointer', textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>✍️</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>Presencial</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Assina agora no celular</div>
            </button>
            <button onClick={() => setModoAdd('online')} style={{ padding: '16px 10px', borderRadius: 12, border: '2px solid #2563eb', background: '#eff6ff', cursor: 'pointer', textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>🔗</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>Online</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Assina via link/QR Code</div>
            </button>
          </div>
          {form.participantes.length > 0 && (
            <button onClick={() => { setAdicionando(false); setModoAdd(null) }} style={{ width: '100%', marginTop: 10, padding: 10, borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
          )}
        </div>
      )}

      {adicionando && modoAdd === 'presencial' && (
        <FormParticipante onSolicitar={onSolicitarAssinatura} onCancelar={() => { setAdicionando(false); setModoAdd(null) }} />
      )}
      {adicionando && modoAdd === 'online' && (
        <FormParticipanteOnline onAdicionar={onAdicionarOnline} onCancelar={() => { setAdicionando(false); setModoAdd(null) }} />
      )}

      {!adicionando && (
        <button onClick={iniciarAdicao} style={{ width: '100%', padding: 13, borderRadius: 12, border: '2px dashed #2563eb', background: '#eff6ff', color: '#2563eb', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 12 }}>
          + Adicionar participante
        </button>
      )}

      {presencialAtivo && (
        <div style={{ background: '#f0fdfa', border: '1.5px solid #99f6e4', borderRadius: 14, padding: 14, marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#0f766e', marginBottom: 4 }}>🖨️ Prefere autoatendimento?</p>
          <p style={{ fontSize: 12, color: '#64748b', marginBottom: 10, lineHeight: 1.5 }}>
            Gere um QR Code pra imprimir e fixar no local — qualquer pessoa da lista pode escanear, digitar o nome ou a matrícula e assinar sozinha, sem passar o celular.
            {form.tokenAutoatendimento && ' O mesmo QR fica disponível pra reabrir e reenviar/imprimir até expirar.'}
          </p>
          <button onClick={abrirQrAutoatendimento} disabled={preparandoQr} style={{
            width: '100%', padding: 12, borderRadius: 10, border: '1.5px solid #0f766e',
            background: '#fff', color: '#0f766e', fontSize: 13, fontWeight: 700,
            cursor: preparandoQr ? 'not-allowed' : 'pointer',
          }}>
            {preparandoQr ? '⏳ Preparando...' : form.tokenAutoatendimento ? '🖨️ Ver QR de Autoatendimento' : '🖨️ Gerar QR para Autoatendimento'}
          </button>
          {erroQr && <p style={{ fontSize: 12, color: '#dc2626', marginTop: 8 }}>{erroQr}</p>}
        </div>
      )}

      {form.participantes.length === 0 && !adicionando && (
        <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '12px 14px', marginBottom: 12, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#92400e' }}>Adicione pelo menos 1 participante para continuar.</p>
        </div>
      )}

      <button onClick={tentarContinuar} disabled={!podeProsseguir} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: podeProsseguir ? '#1e3a5f' : '#e2e8f0', color: podeProsseguir ? '#fff' : '#94a3b8', fontSize: 15, fontWeight: 700, cursor: podeProsseguir ? 'pointer' : 'not-allowed', marginBottom: 10 }}>
        Continuar →
      </button>
      <button onClick={prev} style={{ width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>← Voltar</button>

      {assinandoPart && (
        <AssinaturaPad nomeParticipante={assinandoPart.nome} onConfirmar={onConfirmarAssinatura} onCancelar={() => setAssinandoPart(null)} />
      )}

      {qrAberto && form.acaoRascunhoId && (
        <ModalLinkAssinaturaSesmt
          acaoId={form.acaoRascunhoId}
          tipoLabel={tipoConfig?.label}
          modo="AUTOATENDIMENTO"
          tokenInicial={form.tokenAutoatendimento}
          onTokenAtualizado={t => upd('tokenAutoatendimento', t)}
          onImportarAssinados={onImportarAssinadosAutoatendimento}
          onFechar={() => setQrAberto(false)}
        />
      )}

      {confirmarPend && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100, padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setConfirmarPend(false) }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: '26px 22px', width: '100%', maxWidth: 380, textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>✍️</div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', marginBottom: 10 }}>Assinaturas pendentes</h3>
            <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, marginBottom: 6 }}>
              {presenciaisPendentes === 1 ? 'Há 1 participante presencial que ainda não assinou.' : `Há ${presenciaisPendentes} participantes presenciais que ainda não assinaram.`}
            </p>
            <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 22 }}>
              Você pode coletar as assinaturas agora ou continuar mesmo assim.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => setConfirmarPend(false)} style={{ width: '100%', padding: 13, borderRadius: 12, border: 'none', background: '#16a34a', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>✍️ Voltar e coletar assinaturas</button>
              <button onClick={() => { setConfirmarPend(false); next() }} style={{ width: '100%', padding: 13, borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Continuar mesmo assim →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
