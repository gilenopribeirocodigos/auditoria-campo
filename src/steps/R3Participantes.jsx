import { useState, useRef, useEffect } from 'react'
import { TIPOS_REGISTRO, MODALIDADES } from '../data/registros_config.js'
import { supabase } from '../lib/supabase.js'

// ── Canvas de assinatura ──────────────────────────────────────────────────────
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
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const src  = e.touches ? e.touches[0] : e
    return {
      x: (src.clientX - rect.left) * (canvas.width  / rect.width),
      y: (src.clientY - rect.top)  * (canvas.height / rect.height),
    }
  }

  const iniciar = e => {
    e.preventDefault()
    const pos = getPos(e, canvasRef.current)
    setDesenhando(true)
    setTemTraco(true)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y)
  }
  const desenhar = e => {
    e.preventDefault()
    if (!desenhando) return
    const pos = getPos(e, canvasRef.current)
    const ctx = canvasRef.current.getContext('2d')
    ctx.lineTo(pos.x, pos.y); ctx.stroke()
  }
  const parar = e => { e.preventDefault(); setDesenhando(false) }
  const limpar = () => {
    const ctx = canvasRef.current.getContext('2d')
    ctx.fillStyle = '#fafafa'
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    setTemTraco(false)
  }

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
          style={{ width: '100%', height: 180, borderRadius: 12, border: '2px solid #e2e8f0', background: '#fafafa', cursor: 'crosshair', display: 'block', touchAction: 'none' }}
        />
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

// ── Autocomplete de eletricista ───────────────────────────────────────────────
function AutocompleteEletricista({ onSelect }) {
  const [termo,     setTermo]     = useState('')
  const [sugestoes, setSugestoes] = useState([])
  const [aberto,    setAberto]    = useState(false)
  const [mat,       setMat]       = useState('')
  const [nomeFinal, setNomeFinal] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const buscar = async (v) => {
    setTermo(v); setNomeFinal(v); setMat('')
    if (v.length < 2) { setSugestoes([]); setAberto(false); return }
    try {
      const { data, error } = await supabase.from('estrutura_equipes')
        .select('colaborador, matricula').ilike('colaborador', `%${v}%`).order('colaborador').limit(15)
      if (!error && data?.length > 0) {
        const vistos = new Set()
        const unicos = data.filter(r => { const k = `${r.colaborador}|${r.matricula}`; if (vistos.has(k)) return false; vistos.add(k); return true })
        setSugestoes(unicos); setAberto(true)
      } else { setSugestoes([]); setAberto(false) }
    } catch { setSugestoes([]); setAberto(false) }
  }

  const selecionar = (item) => {
    setTermo(item.colaborador); setNomeFinal(item.colaborador); setMat(item.matricula || '')
    setSugestoes([]); setAberto(false)
    onSelect(item.colaborador, item.matricula || '')
  }

  return (
    <div ref={ref}>
      <div className="form-group" style={{ position: 'relative' }}>
        <label className="form-label">Nome completo *</label>
        <input className="form-input" value={termo} onChange={e => buscar(e.target.value)}
          onFocus={() => sugestoes.length > 0 && setAberto(true)}
          placeholder="Digite para buscar o eletricista..." autoComplete="off" autoFocus />
        {aberto && sugestoes.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 500, background: '#fff', border: '1.5px solid #bfdbfe', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', maxHeight: 240, overflowY: 'auto' }}>
            {sugestoes.map((s, i) => (
              <button key={i} onMouseDown={() => selecionar(s)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '11px 14px', textAlign: 'left', background: 'none', border: 'none', borderBottom: i < sugestoes.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{s.colaborador}</span>
                {s.matricula && <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 700, background: '#eff6ff', padding: '2px 8px', borderRadius: 6 }}>Mat: {s.matricula}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="form-group">
        <label className="form-label">Matrícula</label>
        <input className="form-input" value={mat} onChange={e => { setMat(e.target.value); onSelect(nomeFinal, e.target.value) }}
          placeholder="Preenchida automaticamente" inputMode="numeric"
          style={{ background: mat ? '#f0fdf4' : '#fff', borderColor: mat ? '#86efac' : undefined }} />
        {mat && <p style={{ fontSize: 11, color: '#16a34a', marginTop: 3 }}>✅ Preenchida automaticamente</p>}
      </div>
    </div>
  )
}

// ── Formulário de novo participante presencial ────────────────────────────────
function FormParticipante({ onSolicitar, onCancelar }) {
  const [nome, setNome] = useState('')
  const [mat,  setMat]  = useState('')
  const handleSelect = (n, m) => { setNome(n); setMat(m) }
  return (
    <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 14, padding: 16, marginBottom: 12 }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>Novo participante presencial</p>
      <AutocompleteEletricista onSelect={handleSelect} />
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        {onCancelar && <button onClick={onCancelar} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>}
        <button onClick={() => onSolicitar(nome.trim(), mat.trim())} disabled={!nome.trim()}
          style={{ flex: 2, padding: 11, borderRadius: 10, border: 'none', background: nome.trim() ? '#1e3a5f' : '#e2e8f0', color: nome.trim() ? '#fff' : '#94a3b8', fontSize: 13, fontWeight: 700, cursor: nome.trim() ? 'pointer' : 'not-allowed' }}>
          ✍️ Solicitar Assinatura
        </button>
      </div>
    </div>
  )
}

// ── Formulário de novo participante online ────────────────────────────────────
function FormParticipanteOnline({ onAdicionar, onCancelar }) {
  const [nome, setNome] = useState('')
  const [mat,  setMat]  = useState('')
  const handleSelect = (n, m) => { setNome(n); setMat(m) }
  return (
    <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 14, padding: 16, marginBottom: 12 }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: '#1d4ed8', marginBottom: 4 }}>Participante online</p>
      <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Irá assinar via link/QR Code — sem assinatura agora</p>
      <AutocompleteEletricista onSelect={handleSelect} />
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        {onCancelar && <button onClick={onCancelar} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>}
        <button onClick={() => onAdicionar(nome.trim(), mat.trim())} disabled={!nome.trim()}
          style={{ flex: 2, padding: 11, borderRadius: 10, border: 'none', background: nome.trim() ? '#2563eb' : '#e2e8f0', color: nome.trim() ? '#fff' : '#94a3b8', fontSize: 13, fontWeight: 700, cursor: nome.trim() ? 'pointer' : 'not-allowed' }}>
          + Adicionar à lista
        </button>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function R3Participantes({ form, upd, next, prev }) {
  const tipoConfig  = TIPOS_REGISTRO[form.tipo]
  const modConfig   = MODALIDADES[form.modalidade]
  const [assinandoPart, setAssinandoPart] = useState(null)
  const [adicionando,   setAdicionando]   = useState(false)
  const [modoAdd,       setModoAdd]       = useState(null) // 'presencial' | 'online' | null

  const maxPart = modConfig?.maxPart || 100

  const podeProsseguir = form.participantes.length > 0

  useEffect(() => {
    if (form.participantes.length === 0 && !adicionando) setAdicionando(true)
  }, [])

  // Adiciona presencial (requer assinatura imediata)
  const onSolicitarAssinatura = (nome, mat) => {
    if (!nome) return
    setAdicionando(false); setModoAdd(null)
    setAssinandoPart({ nome, matricula: mat })
  }

  const onConfirmarAssinatura = (png) => {
    upd('participantes', [...form.participantes, {
      nome: assinandoPart.nome, matricula: assinandoPart.matricula,
      assinatura: png, assinado_em: new Date().toISOString(), modo: 'presencial',
    }])
    setAssinandoPart(null)
    if (form.modalidade === 'DUPLA' && form.participantes.length + 1 < 2) setAdicionando(true)
  }

  // Adiciona online (sem assinatura — vai assinar via link)
  const onAdicionarOnline = (nome, mat) => {
    if (!nome) return
    upd('participantes', [...form.participantes, {
      nome, matricula: mat, assinatura: null,
      assinado_em: null, modo: 'online',
    }])
    setAdicionando(false); setModoAdd(null)
    if (form.modalidade === 'DUPLA' && form.participantes.length + 1 < 2) setAdicionando(true)
  }

  const remover = (idx) => upd('participantes', form.participantes.filter((_, i) => i !== idx))

  return (
    <div style={{ padding: '0 0 80px' }}>

      {/* Banner tipo */}
      <div style={{ background: tipoConfig?.bg, border: `1.5px solid ${tipoConfig?.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>{tipoConfig?.emoji}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: tipoConfig?.color }}>{tipoConfig?.label}</span>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>· {modConfig?.label}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: '#1e293b' }}>Participantes</h2>
        <span style={{ fontSize: 12, color: '#64748b' }}>{form.participantes.length}/{maxPart === 100 ? '∞' : maxPart}</span>
      </div>

      {/* Participantes já adicionados */}
      {form.participantes.map((p, i) => (
        <div key={i} style={{
          background: p.modo === 'online' ? '#eff6ff' : '#f0fdf4',
          border: `1.5px solid ${p.modo === 'online' ? '#bfdbfe' : '#86efac'}`,
          borderRadius: 12, padding: '12px 14px', marginBottom: 10,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: p.modo === 'online' ? '#1d4ed8' : '#15803d' }}>
                {i + 1}. {p.nome}
              </p>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 6, background: p.modo === 'online' ? '#dbeafe' : '#dcfce7', color: p.modo === 'online' ? '#1d4ed8' : '#15803d' }}>
                {p.modo === 'online' ? '🔗 Online' : '✍️ Presencial'}
              </span>
            </div>
            {p.matricula && <p style={{ fontSize: 12, color: '#64748b' }}>Mat: {p.matricula}</p>}
            {p.assinatura && <p style={{ fontSize: 11, color: '#94a3b8' }}>✅ Assinado · {new Date(p.assinado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>}
            {!p.assinatura && p.modo === 'online' && <p style={{ fontSize: 11, color: '#2563eb' }}>⏳ Assinará via link</p>}
          </div>
          {p.assinatura && <img src={p.assinatura} alt="assinatura" style={{ width: 80, height: 40, objectFit: 'contain', borderRadius: 6, background: '#fff', border: '1px solid #e2e8f0' }} />}
          <button onClick={() => remover(i)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>✕</button>
        </div>
      ))}

      {/* Escolha do modo de adição */}
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
            <button onClick={() => { setAdicionando(false); setModoAdd(null) }} style={{ width: '100%', marginTop: 10, padding: 10, borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Cancelar
            </button>
          )}
        </div>
      )}

      {/* Formulários conforme modo */}
      {adicionando && modoAdd === 'presencial' && (
        <FormParticipante
          onSolicitar={onSolicitarAssinatura}
          onCancelar={() => { setModoAdd(null); if (form.participantes.length === 0) setAdicionando(true) }}
        />
      )}
      {adicionando && modoAdd === 'online' && (
        <FormParticipanteOnline
          onAdicionar={onAdicionarOnline}
          onCancelar={() => { setModoAdd(null); if (form.participantes.length === 0) setAdicionando(true) }}
        />
      )}

      {/* Botões de adicionar mais */}
      {!adicionando && form.participantes.length < maxPart && (
        <button onClick={() => { setAdicionando(true); setModoAdd(null) }} style={{ width: '100%', padding: 13, borderRadius: 12, border: '2px dashed #2563eb', background: '#eff6ff', color: '#2563eb', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 12 }}>
          + Adicionar participante
        </button>
      )}

      {form.participantes.length === 0 && !adicionando && (
        <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '12px 14px', marginBottom: 12, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#92400e' }}>Adicione pelo menos 1 participante para continuar.</p>
        </div>
      )}

      <button onClick={next} disabled={!podeProsseguir} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: podeProsseguir ? '#1e3a5f' : '#e2e8f0', color: podeProsseguir ? '#fff' : '#94a3b8', fontSize: 15, fontWeight: 700, cursor: podeProsseguir ? 'pointer' : 'not-allowed', marginBottom: 10 }}>
        Continuar →
      </button>
      <button onClick={prev} style={{ width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>← Voltar</button>

      {assinandoPart && (
        <AssinaturaPad nomeParticipante={assinandoPart.nome} onConfirmar={onConfirmarAssinatura} onCancelar={() => setAssinandoPart(null)} />
      )}
    </div>
  )
}
