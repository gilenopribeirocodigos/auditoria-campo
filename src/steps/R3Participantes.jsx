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

// ── Modal: importar em lote por supervisor ────────────────────────────────────
function ModalImportarSupervisor({ participantesJaAdicionados, onImportar, onFechar }) {
  const [aba,             setAba]             = useState('supervisor') // 'supervisor' | 'usuarios'
  const [supervisores,    setSupervisores]    = useState([])
  const [selecionados,    setSelecionados]    = useState([])
  const [preview,         setPreview]         = useState([])
  const [loadingSup,      setLoadingSup]      = useState(true)
  const [loadingPreview,  setLoadingPreview]  = useState(false)
  const [modoImport,      setModoImport]      = useState('online')
  // aba usuarios
  const [usuarios,        setUsuarios]        = useState([])
  const [loadingUs,       setLoadingUs]       = useState(false)
  const [usuariosSel,     setUsuariosSel]     = useState([])

  const jaAdicionados = new Set(participantesJaAdicionados.map(p => p.nome?.trim().toLowerCase()))

  // Carrega supervisores
  useEffect(() => {
    supabase.from('estrutura_equipes')
      .select('superv_campo').not('superv_campo', 'is', null).neq('superv_campo', '')
      .then(({ data }) => {
        const unicos = [...new Set((data || []).map(r => r.superv_campo?.trim()).filter(Boolean))].sort()
        setSupervisores(unicos); setLoadingSup(false)
      })
  }, [])

  // Carrega usuarios quando muda para aba usuarios
  useEffect(() => {
    if (aba !== 'usuarios' || usuarios.length > 0) return
    setLoadingUs(true)
    supabase.from('usuarios')
      .select('nome, matricula, perfil').neq('perfil', 'ADMIN').eq('status', 'ATIVO').order('nome')
      .then(({ data }) => { setUsuarios(data || []); setLoadingUs(false) })
  }, [aba])

  // Preview supervisores
  useEffect(() => {
    if (aba !== 'supervisor') return
    if (selecionados.length === 0) { setPreview([]); return }
    setLoadingPreview(true)
    supabase.from('estrutura_equipes')
      .select('colaborador, matricula, superv_campo')
      .in('superv_campo', selecionados).order('superv_campo').order('colaborador')
      .then(({ data }) => {
        const vistos = new Set()
        const lista = (data || []).filter(r => {
          const k = r.colaborador?.trim().toLowerCase()
          if (!k || vistos.has(k) || jaAdicionados.has(k)) return false
          vistos.add(k); return true
        })
        setPreview(lista); setLoadingPreview(false)
      })
  }, [selecionados])

  // Preview usuarios selecionados
  const previewUsuarios = usuarios.filter(u => {
    const k = u.nome?.trim().toLowerCase()
    return usuariosSel.includes(u.nome) && !jaAdicionados.has(k)
  })

  const toggleSupervisor = (sup) =>
    setSelecionados(prev => prev.includes(sup) ? prev.filter(s => s !== sup) : [...prev, sup])

  const toggleUsuario = (nome) =>
    setUsuariosSel(prev => prev.includes(nome) ? prev.filter(n => n !== nome) : [...prev, nome])

  const selecionarTodosUsuarios = () => {
    const disponiveis = usuarios.filter(u => !jaAdicionados.has(u.nome?.trim().toLowerCase())).map(u => u.nome)
    setUsuariosSel(disponiveis)
  }

  const confirmar = () => {
    if (aba === 'supervisor') {
      if (preview.length === 0) return
      onImportar(preview, modoImport)
    } else {
      if (previewUsuarios.length === 0) return
      const lista = previewUsuarios.map(u => ({ colaborador: u.nome, matricula: u.matricula || '' }))
      onImportar(lista, modoImport)
    }
  }

  const totalPreview = aba === 'supervisor' ? preview.length : previewUsuarios.length

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', padding: '24px 18px 40px' }}>

        <div style={{ width: 40, height: 4, background: '#e2e8f0', borderRadius: 2, margin: '0 auto 20px' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', margin: 0 }}>👥 Importar participantes</h2>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
        </div>

        {/* Abas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 16 }}>
          <button onClick={() => setAba('supervisor')} style={{ padding: '10px 8px', borderRadius: 10, border: `2px solid ${aba === 'supervisor' ? '#7c3aed' : '#e2e8f0'}`, background: aba === 'supervisor' ? '#faf5ff' : '#f8fafc', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 16, marginBottom: 2 }}>👷</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: aba === 'supervisor' ? '#7c3aed' : '#374151' }}>Por Supervisor</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>Eletricistas de campo</div>
          </button>
          <button onClick={() => setAba('usuarios')} style={{ padding: '10px 8px', borderRadius: 10, border: `2px solid ${aba === 'usuarios' ? '#0f766e' : '#e2e8f0'}`, background: aba === 'usuarios' ? '#f0fdfa' : '#f8fafc', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 16, marginBottom: 2 }}>🧑‍💼</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: aba === 'usuarios' ? '#0f766e' : '#374151' }}>Usuários do Sistema</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>Supervisores e fiscais</div>
          </button>
        </div>

        {/* Modo de assinatura */}
        <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>Como irão assinar?</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button onClick={() => setModoImport('online')} style={{ padding: '10px 8px', borderRadius: 10, border: `2px solid ${modoImport === 'online' ? '#2563eb' : '#e2e8f0'}`, background: modoImport === 'online' ? '#eff6ff' : '#fff', cursor: 'pointer', textAlign: 'center' }}>
              <div style={{ fontSize: 18, marginBottom: 3 }}>🔗</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: modoImport === 'online' ? '#1d4ed8' : '#374151' }}>Online</div>
              <div style={{ fontSize: 10, color: '#64748b' }}>Via link/QR Code</div>
            </button>
            <button onClick={() => setModoImport('presencial')} style={{ padding: '10px 8px', borderRadius: 10, border: `2px solid ${modoImport === 'presencial' ? '#16a34a' : '#e2e8f0'}`, background: modoImport === 'presencial' ? '#f0fdf4' : '#fff', cursor: 'pointer', textAlign: 'center' }}>
              <div style={{ fontSize: 18, marginBottom: 3 }}>✍️</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: modoImport === 'presencial' ? '#15803d' : '#374151' }}>Presencial</div>
              <div style={{ fontSize: 10, color: '#64748b' }}>Assina no celular</div>
            </button>
          </div>
          {modoImport === 'presencial' && (
            <p style={{ fontSize: 11, color: '#15803d', marginTop: 10, lineHeight: 1.5 }}>
              ℹ️ Após importar, toque em <strong>✍️ Assinar</strong> em cada participante para coletar a assinatura no celular.
            </p>
          )}
        </div>

        {/* ── ABA: POR SUPERVISOR ─────────────────────────────────────────── */}
        {aba === 'supervisor' && (
          <>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Supervisores disponíveis:</p>
            {loadingSup ? (
              <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 20 }}>⏳ Carregando...</p>
            ) : (
              <div style={{ marginBottom: 16 }}>
                {supervisores.map(sup => {
                  const marcado = selecionados.includes(sup)
                  return (
                    <button key={sup} onClick={() => toggleSupervisor(sup)} style={{
                      display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                      padding: '12px 14px', marginBottom: 6, borderRadius: 12, cursor: 'pointer',
                      border: `2px solid ${marcado ? '#7c3aed' : '#e2e8f0'}`,
                      background: marcado ? '#faf5ff' : '#f8fafc', textAlign: 'left',
                    }}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${marcado ? '#7c3aed' : '#cbd5e1'}`, background: marcado ? '#7c3aed' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {marcado && <span style={{ color: '#fff', fontSize: 13, fontWeight: 800 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 14, fontWeight: marcado ? 700 : 600, color: marcado ? '#7c3aed' : '#1e293b' }}>{sup}</span>
                    </button>
                  )
                })}
              </div>
            )}
            {selecionados.length > 0 && (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: 14, marginBottom: 16 }}>
                {loadingPreview ? (
                  <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center' }}>⏳ Carregando equipe...</p>
                ) : (
                  <>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 8 }}>✅ {preview.length} participante(s) serão adicionados:</p>
                    <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                      {preview.map((p, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: i < preview.length - 1 ? '1px solid #bbf7d0' : 'none', fontSize: 13 }}>
                          <span style={{ color: '#15803d', fontWeight: 600 }}>{i + 1}. {p.colaborador}</span>
                          <span style={{ color: '#94a3b8', fontSize: 11 }}>{p.superv_campo}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {selecionados.length === 0 && !loadingSup && (
              <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400e', textAlign: 'center' }}>
                Selecione pelo menos um supervisor acima.
              </div>
            )}
          </>
        )}

        {/* ── ABA: USUÁRIOS DO SISTEMA ────────────────────────────────────── */}
        {aba === 'usuarios' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', margin: 0 }}>Usuários do sistema (exceto Admin):</p>
              <button onClick={selecionarTodosUsuarios} style={{ fontSize: 11, color: '#0f766e', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                ✅ Selecionar todos
              </button>
            </div>
            {loadingUs ? (
              <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 20 }}>⏳ Carregando usuários...</p>
            ) : (
              <div style={{ marginBottom: 16 }}>
                {usuarios.map(u => {
                  const marcado = usuariosSel.includes(u.nome)
                  const jaNaLista = jaAdicionados.has(u.nome?.trim().toLowerCase())
                  return (
                    <button key={u.nome} onClick={() => !jaNaLista && toggleUsuario(u.nome)} style={{
                      display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                      padding: '10px 14px', marginBottom: 6, borderRadius: 12, cursor: jaNaLista ? 'not-allowed' : 'pointer',
                      border: `2px solid ${jaNaLista ? '#f1f5f9' : marcado ? '#0f766e' : '#e2e8f0'}`,
                      background: jaNaLista ? '#f8fafc' : marcado ? '#f0fdfa' : '#f8fafc', textAlign: 'left',
                      opacity: jaNaLista ? 0.5 : 1,
                    }}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${marcado ? '#0f766e' : '#cbd5e1'}`, background: marcado ? '#0f766e' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {marcado && <span style={{ color: '#fff', fontSize: 13, fontWeight: 800 }}>✓</span>}
                        {jaNaLista && <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: marcado ? 700 : 600, color: marcado ? '#0f766e' : '#1e293b' }}>{u.nome}</span>
                        {jaNaLista && <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 8 }}>já na lista</span>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {u.matricula && <span style={{ fontSize: 11, color: '#64748b' }}>Mat: {u.matricula}</span>}
                        <div style={{ fontSize: 10, color: '#94a3b8' }}>{u.perfil}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
            {usuariosSel.length > 0 && (
              <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 12, padding: '10px 14px', marginBottom: 16 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#0f766e', margin: 0 }}>
                  ✅ {previewUsuarios.length} usuário(s) selecionado(s)
                </p>
              </div>
            )}
          </>
        )}

        <button onClick={confirmar} disabled={totalPreview === 0}
          style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', marginBottom: 10,
            background: totalPreview > 0 ? '#1e3a5f' : '#e2e8f0',
            color: totalPreview > 0 ? '#fff' : '#94a3b8',
            fontSize: 15, fontWeight: 700, cursor: totalPreview > 0 ? 'pointer' : 'not-allowed',
          }}>
          ✅ Adicionar {totalPreview > 0 ? `${totalPreview} participante(s)` : ''}
        </button>

        <button onClick={onFechar} style={{ width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ── Autocomplete: busca em estrutura_equipes + usuarios (exceto ADMIN) ────────
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
      const { data: dataEq } = await supabase.from('estrutura_equipes')
        .select('colaborador, matricula').ilike('colaborador', `%${v}%`).order('colaborador').limit(15)
      const { data: dataUs } = await supabase.from('usuarios')
        .select('nome, matricula').ilike('nome', `%${v}%`).neq('perfil', 'ADMIN').eq('status', 'ATIVO').order('nome').limit(10)

      const vistos = new Set()
      const unicos = []
      for (const r of (dataEq || [])) {
        const k = r.colaborador?.trim().toLowerCase()
        if (k && !vistos.has(k)) { vistos.add(k); unicos.push({ colaborador: r.colaborador, matricula: r.matricula || '' }) }
      }
      for (const r of (dataUs || [])) {
        const k = r.nome?.trim().toLowerCase()
        if (k && !vistos.has(k)) { vistos.add(k); unicos.push({ colaborador: r.nome, matricula: r.matricula || '' }) }
      }
      if (unicos.length > 0) { setSugestoes(unicos); setAberto(true) }
      else { setSugestoes([]); setAberto(false) }
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
          placeholder="Digite para buscar..." autoComplete="off" autoFocus />
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

// ── Formulário presencial ─────────────────────────────────────────────────────
function FormParticipante({ onSolicitar, onCancelar }) {
  const [nome, setNome] = useState('')
  const [mat,  setMat]  = useState('')
  return (
    <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 14, padding: 16, marginBottom: 12 }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>Novo participante presencial</p>
      <AutocompleteEletricista onSelect={(n, m) => { setNome(n); setMat(m) }} />
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

// ── Formulário online ─────────────────────────────────────────────────────────
function FormParticipanteOnline({ onAdicionar, onCancelar }) {
  const [nome, setNome] = useState('')
  const [mat,  setMat]  = useState('')
  return (
    <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 14, padding: 16, marginBottom: 12 }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: '#1d4ed8', marginBottom: 4 }}>Participante online</p>
      <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Irá assinar via link/QR Code — sem assinatura agora</p>
      <AutocompleteEletricista onSelect={(n, m) => { setNome(n); setMat(m) }} />
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

// ── Captura GPS + geocodificação (reutilizável) ───────────────────────────────
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
export default function R3Participantes({ form, upd, next, prev }) {
  const tipoConfig = TIPOS_REGISTRO[form.tipo]
  const modConfig  = MODALIDADES[form.modalidade]
  const [assinandoPart,    setAssinandoPart]    = useState(null) // { nome, matricula } (novo) OU { nome, idx } (existente)
  const [adicionando,      setAdicionando]      = useState(false)
  const [modoAdd,          setModoAdd]          = useState(null) // 'presencial' | 'online' | null
  const [modalImportar,    setModalImportar]    = useState(false)

  const maxPart = modConfig?.maxPart || 100
  const podeProsseguir = form.participantes.length > 0

  // Conta presenciais que ainda não assinaram
  const presenciaisPendentes = form.participantes.filter(p => p.modo === 'presencial' && !p.assinatura).length

  useEffect(() => {
    if (form.participantes.length === 0 && !adicionando) setAdicionando(true)
  }, [])

  const onSolicitarAssinatura = (nome, mat) => {
    if (!nome) return
    setAdicionando(false); setModoAdd(null)
    setAssinandoPart({ nome, matricula: mat }) // sem idx = participante novo
  }

  // Abre o canvas para um participante JÁ existente na lista (ex.: importado em lote)
  const assinarExistente = (idx) => {
    const p = form.participantes[idx]
    setAssinandoPart({ nome: p.nome, idx })
  }

  const onConfirmarAssinatura = async (png) => {
    const { lat, lng, endereco_assinatura } = await capturarLocalizacao()

    // Caso 1: assinatura de participante EXISTENTE (tem idx) — atualiza no lugar
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

    // Caso 2: participante NOVO — adiciona à lista
    upd('participantes', [...form.participantes, {
      nome: assinandoPart.nome, matricula: assinandoPart.matricula,
      assinatura: png, assinado_em: new Date().toISOString(), modo: 'presencial',
      lat, lng, endereco_assinatura,
    }])
    setAssinandoPart(null)
    if (form.modalidade === 'DUPLA' && form.participantes.length + 1 < 2) setAdicionando(true)
  }

  const onAdicionarOnline = (nome, mat) => {
    if (!nome) return
    upd('participantes', [...form.participantes, {
      nome, matricula: mat, assinatura: null, assinado_em: null, modo: 'online',
    }])
    setAdicionando(false); setModoAdd(null)
    if (form.modalidade === 'DUPLA' && form.participantes.length + 1 < 2) setAdicionando(true)
  }

  // ── Importação em lote por supervisor ──────────────────────────────────────
  const onImportarLote = (lista, modo) => {
    const novos = lista.map(p => ({
      nome: p.colaborador, matricula: p.matricula || '',
      assinatura: null, assinado_em: null, modo,
    }))
    upd('participantes', [...form.participantes, ...novos])
    setModalImportar(false)
    setAdicionando(false)
  }

  const remover = (idx) => upd('participantes', form.participantes.filter((_, i) => i !== idx))

  return (
    <div style={{ padding: '0 0 80px' }}>

      <div style={{ background: tipoConfig?.bg, border: `1.5px solid ${tipoConfig?.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>{tipoConfig?.emoji}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: tipoConfig?.color }}>{tipoConfig?.label}</span>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>· {modConfig?.label}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: '#1e293b' }}>Participantes</h2>
        <span style={{ fontSize: 12, color: '#64748b' }}>{form.participantes.length}/{maxPart === 100 ? '∞' : maxPart}</span>
      </div>

      {/* Botão de importação em lote — sempre visível no topo */}
      <button onClick={() => setModalImportar(true)} style={{
        width: '100%', padding: 13, borderRadius: 12, marginBottom: 14,
        border: '2px solid #7c3aed', background: '#faf5ff', color: '#7c3aed',
        fontSize: 14, fontWeight: 700, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        👥 Importar por Supervisor de Campo
      </button>

      {/* Aviso de pendências de assinatura presencial */}
      {presenciaisPendentes > 0 && (
        <div style={{ background: '#fef3c7', border: '1.5px solid #f59e0b', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#92400e', margin: 0 }}>
            ✍️ {presenciaisPendentes} participante(s) presencial(is) ainda não assinaram
          </p>
          <p style={{ fontSize: 12, color: '#b45309', margin: '4px 0 0' }}>
            Toque em <strong>✍️ Assinar</strong> ao lado de cada um para coletar a assinatura. Você pode salvar mesmo com pendências, mas o ideal é coletar todas.
          </p>
        </div>
      )}

      {/* Lista de participantes já adicionados */}
      {form.participantes.map((p, i) => {
        const pendentePresencial = p.modo === 'presencial' && !p.assinatura
        return (
          <div key={i} style={{
            background: p.modo === 'online' ? '#eff6ff' : pendentePresencial ? '#fffbeb' : '#f0fdf4',
            border: `1.5px solid ${p.modo === 'online' ? '#bfdbfe' : pendentePresencial ? '#fcd34d' : '#86efac'}`,
            borderRadius: 12, padding: '12px 14px', marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: p.modo === 'online' ? '#1d4ed8' : pendentePresencial ? '#92400e' : '#15803d' }}>
                  {i + 1}. {p.nome}
                </p>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 6, background: p.modo === 'online' ? '#dbeafe' : '#dcfce7', color: p.modo === 'online' ? '#1d4ed8' : '#15803d' }}>
                  {p.modo === 'online' ? '🔗 Online' : '✍️ Presencial'}
                </span>
              </div>
              {p.matricula && <p style={{ fontSize: 12, color: '#64748b' }}>Mat: {p.matricula}</p>}
              {p.assinatura && <p style={{ fontSize: 11, color: '#94a3b8' }}>✅ Assinado · {new Date(p.assinado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>}
              {!p.assinatura && p.modo === 'online' && <p style={{ fontSize: 11, color: '#2563eb' }}>⏳ Assinará via link</p>}
              {pendentePresencial && <p style={{ fontSize: 11, color: '#d97706', fontWeight: 600 }}>⚠️ Aguardando assinatura</p>}
            </div>

            {p.assinatura && <img src={p.assinatura} alt="assinatura" style={{ width: 80, height: 40, objectFit: 'contain', borderRadius: 6, background: '#fff', border: '1px solid #e2e8f0' }} />}

            {/* Botão Assinar para presencial pendente */}
            {pendentePresencial && (
              <button onClick={() => assinarExistente(i)} style={{
                padding: '8px 12px', borderRadius: 10, border: 'none',
                background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
              }}>✍️ Assinar</button>
            )}

            <button onClick={() => remover(i)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>✕</button>
          </div>
        )
      })}

      {/* Escolha do modo individual */}
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

      {!adicionando && form.participantes.length < maxPart && (
        <button onClick={() => { setAdicionando(true); setModoAdd(null) }} style={{ width: '100%', padding: 13, borderRadius: 12, border: '2px dashed #2563eb', background: '#eff6ff', color: '#2563eb', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 12 }}>
          + Adicionar participante individual
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

      {modalImportar && (
        <ModalImportarSupervisor
          participantesJaAdicionados={form.participantes}
          onImportar={onImportarLote}
          onFechar={() => setModalImportar(false)}
        />
      )}
    </div>
  )
}
