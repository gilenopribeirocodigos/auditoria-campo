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
    const canvas = canvasRef.current
    const pos = getPos(e, canvas)
    setDesenhando(true)
    setTemTraco(true)
    const ctx = canvas.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  const desenhar = e => {
    e.preventDefault()
    if (!desenhando) return
    const canvas = canvasRef.current
    const pos = getPos(e, canvas)
    canvas.getContext('2d').lineTo(pos.x, pos.y)
    canvas.getContext('2d').stroke()
  }

  const parar = e => { e.preventDefault(); setDesenhando(false) }

  const limpar = () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fafafa'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setTemTraco(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000, padding: 16,
    }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 20, width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <p style={{ fontSize: 12, color: '#64748b' }}>Assinatura de</p>
          <p style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>{nomeParticipante}</p>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            Assine abaixo para confirmar participação
          </p>
        </div>

        <canvas
          ref={canvasRef} width={380} height={180}
          onMouseDown={iniciar} onMouseMove={desenhar} onMouseUp={parar} onMouseLeave={parar}
          onTouchStart={iniciar} onTouchMove={desenhar} onTouchEnd={parar}
          style={{
            width: '100%', height: 180, borderRadius: 12,
            border: '2px solid #e2e8f0', background: '#fafafa',
            cursor: 'crosshair', display: 'block', touchAction: 'none',
          }}
        />

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={limpar} style={{
            flex: 1, padding: 12, borderRadius: 10,
            border: '1px solid #e2e8f0', background: '#f8fafc',
            color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>🔄 Limpar</button>

          <button onClick={onCancelar} style={{
            flex: 1, padding: 12, borderRadius: 10,
            border: '1px solid #fecaca', background: '#fef2f2',
            color: '#dc2626', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>✕ Cancelar</button>

          <button onClick={() => temTraco && onConfirmar(canvasRef.current.toDataURL('image/png'))}
            disabled={!temTraco} style={{
              flex: 1, padding: 12, borderRadius: 10, border: 'none',
              background: temTraco ? '#16a34a' : '#e2e8f0',
              color: temTraco ? '#fff' : '#94a3b8',
              fontSize: 14, fontWeight: 700,
              cursor: temTraco ? 'pointer' : 'not-allowed',
            }}>✅ Confirmar</button>
        </div>
      </div>
    </div>
  )
}

// ── Autocomplete de eletricista — busca em estrutura_equipes ──────────────────
// Colunas confirmadas: colaborador (nome), matricula
function AutocompleteEletricista({ onSelect }) {
  const [termo,     setTermo]     = useState('')
  const [sugestoes, setSugestoes] = useState([])
  const [aberto,    setAberto]    = useState(false)
  const [mat,       setMat]       = useState('')
  const [nomeFinal, setNomeFinal] = useState('')
  const ref = useRef(null)

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const buscar = async (v) => {
    setTermo(v)
    setNomeFinal(v)
    setMat('')

    if (v.length < 2) { setSugestoes([]); setAberto(false); return }

    try {
      const { data, error } = await supabase
        .from('estrutura_equipes')
        .select('colaborador, matricula')
        .ilike('colaborador', `%${v}%`)
        .order('colaborador')
        .limit(15)

      if (!error && data?.length > 0) {
        // Remove duplicatas por colaborador+matricula
        const vistos = new Set()
        const unicos = data.filter(r => {
          const key = `${r.colaborador}|${r.matricula}`
          if (vistos.has(key)) return false
          vistos.add(key)
          return true
        })
        setSugestoes(unicos)
        setAberto(true)
      } else {
        setSugestoes([])
        setAberto(false)
      }
    } catch (e) {
      setSugestoes([])
      setAberto(false)
    }
  }

  const selecionar = (item) => {
    setTermo(item.colaborador)
    setNomeFinal(item.colaborador)
    setMat(item.matricula || '')
    setSugestoes([])
    setAberto(false)
    onSelect(item.colaborador, item.matricula || '')
  }

  const onChangeMat = (v) => {
    setMat(v)
    onSelect(nomeFinal, v)
  }

  return (
    <div ref={ref}>
      {/* Campo nome com dropdown */}
      <div className="form-group" style={{ position: 'relative' }}>
        <label className="form-label">Nome completo *</label>
        <input
          className="form-input"
          value={termo}
          onChange={e => buscar(e.target.value)}
          onFocus={() => sugestoes.length > 0 && setAberto(true)}
          placeholder="Digite para buscar o eletricista..."
          autoComplete="off"
          autoFocus
        />

        {/* Dropdown de sugestões */}
        {aberto && sugestoes.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 500,
            background: '#fff', border: '1.5px solid #bfdbfe',
            borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
            maxHeight: 240, overflowY: 'auto',
          }}>
            {sugestoes.map((s, i) => (
              <button
                key={i}
                onMouseDown={() => selecionar(s)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  width: '100%', padding: '11px 14px', textAlign: 'left',
                  background: 'none', border: 'none',
                  borderBottom: i < sugestoes.length - 1 ? '1px solid #f1f5f9' : 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>
                  {s.colaborador}
                </span>
                {s.matricula && (
                  <span style={{
                    fontSize: 12, color: '#2563eb', fontWeight: 700,
                    background: '#eff6ff', padding: '2px 8px', borderRadius: 6,
                  }}>
                    Mat: {s.matricula}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Campo matrícula — pré-preenchido ao selecionar */}
      <div className="form-group">
        <label className="form-label">Matrícula</label>
        <input
          className="form-input"
          value={mat}
          onChange={e => onChangeMat(e.target.value)}
          placeholder="Preenchida automaticamente ao selecionar"
          inputMode="numeric"
          style={{
            background: mat ? '#f0fdf4' : '#fff',
            borderColor: mat ? '#86efac' : undefined,
          }}
        />
        {mat && (
          <p style={{ fontSize: 11, color: '#16a34a', marginTop: 3 }}>
            ✅ Preenchida automaticamente
          </p>
        )}
      </div>
    </div>
  )
}

// ── Formulário de novo participante ───────────────────────────────────────────
function FormParticipante({ onSolicitar, onCancelar }) {
  const [nome,      setNome]      = useState('')
  const [matricula, setMatricula] = useState('')

  const handleSelect = (n, m) => { setNome(n); setMatricula(m) }

  return (
    <div style={{
      background: '#f8fafc', border: '1.5px solid #e2e8f0',
      borderRadius: 14, padding: 16, marginBottom: 12,
    }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>
        Novo participante
      </p>

      <AutocompleteEletricista onSelect={handleSelect} />

      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        {onCancelar && (
          <button onClick={onCancelar} style={{
            flex: 1, padding: 11, borderRadius: 10,
            border: '1px solid #e2e8f0', background: '#fff',
            color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Cancelar</button>
        )}
        <button
          onClick={() => onSolicitar(nome.trim(), matricula.trim())}
          disabled={!nome.trim()}
          style={{
            flex: 2, padding: 11, borderRadius: 10, border: 'none',
            background: nome.trim() ? '#1e3a5f' : '#e2e8f0',
            color: nome.trim() ? '#fff' : '#94a3b8',
            fontSize: 13, fontWeight: 700,
            cursor: nome.trim() ? 'pointer' : 'not-allowed',
          }}
        >✍️ Solicitar Assinatura</button>
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

  const maxPart       = modConfig?.maxPart || 100
  const isDisciplinar = form.tipo === 'DISCIPLINAR'

  useEffect(() => {
    if (form.participantes.length === 0 && !adicionando) setAdicionando(true)
  }, [])

  const onSolicitarAssinatura = (nome, matricula) => {
    if (!nome) return
    setAdicionando(false)
    setAssinandoPart({ nome, matricula })
  }

  const onConfirmarAssinatura = (png) => {
    upd('participantes', [...form.participantes, {
      nome:        assinandoPart.nome,
      matricula:   assinandoPart.matricula,
      assinatura:  png,
      assinado_em: new Date().toISOString(),
    }])
    setAssinandoPart(null)
    if (form.modalidade === 'DUPLA' && form.participantes.length + 1 < 2) setAdicionando(true)
  }

  const remover = (idx) => upd('participantes', form.participantes.filter((_, i) => i !== idx))

  const podeProsseguir = form.participantes.length > 0

  return (
    <div style={{ padding: '0 0 80px' }}>

      {/* Banner tipo */}
      <div style={{
        background: tipoConfig?.bg, border: `1.5px solid ${tipoConfig?.border}`,
        borderRadius: 10, padding: '10px 14px', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 18 }}>{tipoConfig?.emoji}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: tipoConfig?.color }}>
          {tipoConfig?.label}
        </span>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>· {modConfig?.label}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: '#1e293b' }}>
          {isDisciplinar ? 'Empregado' : 'Participantes'}
        </h2>
        <span style={{ fontSize: 12, color: '#64748b' }}>
          {form.participantes.length}/{maxPart === 100 ? '∞' : maxPart} assinados
        </span>
      </div>

      {/* Participantes já assinados */}
      {form.participantes.map((p, i) => (
        <div key={i} style={{
          background: '#f0fdf4', border: '1.5px solid #86efac',
          borderRadius: 12, padding: '12px 14px', marginBottom: 10,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#15803d' }}>{i+1}. {p.nome}</p>
            {p.matricula && <p style={{ fontSize: 12, color: '#64748b' }}>Mat: {p.matricula}</p>}
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              ✅ {new Date(p.assinado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          {p.assinatura && (
            <img src={p.assinatura} alt="assinatura" style={{
              width: 80, height: 40, objectFit: 'contain',
              borderRadius: 6, background: '#fff', border: '1px solid #e2e8f0',
            }} />
          )}
          <button onClick={() => remover(i)} style={{
            width: 32, height: 32, borderRadius: 8, border: 'none',
            background: '#fee2e2', color: '#dc2626', cursor: 'pointer',
            fontSize: 14, flexShrink: 0,
          }}>✕</button>
        </div>
      ))}

      {/* Formulário de adicionar */}
      {adicionando && (
        <FormParticipante
          onSolicitar={onSolicitarAssinatura}
          onCancelar={form.participantes.length > 0 ? () => setAdicionando(false) : null}
        />
      )}

      {/* Botão + para coletivo */}
      {!adicionando && form.modalidade === 'COLETIVO' && form.participantes.length < maxPart && (
        <button onClick={() => setAdicionando(true)} style={{
          width: '100%', padding: 13, borderRadius: 12,
          border: '2px dashed #2563eb', background: '#eff6ff',
          color: '#2563eb', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 12,
        }}>+ Adicionar participante</button>
      )}

      {/* Botão 2º participante (dupla) */}
      {!adicionando && form.modalidade === 'DUPLA' && form.participantes.length < 2 && (
        <button onClick={() => setAdicionando(true)} style={{
          width: '100%', padding: 13, borderRadius: 12,
          border: '2px dashed #2563eb', background: '#eff6ff',
          color: '#2563eb', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 12,
        }}>+ Adicionar 2º participante</button>
      )}

      {form.participantes.length === 0 && !adicionando && (
        <div style={{
          background: '#fef3c7', border: '1px solid #fcd34d',
          borderRadius: 10, padding: '12px 14px', marginBottom: 12, textAlign: 'center',
        }}>
          <p style={{ fontSize: 13, color: '#92400e' }}>
            Nenhum participante assinado ainda.<br />Adicione pelo menos 1 para continuar.
          </p>
        </div>
      )}

      <button onClick={next} disabled={!podeProsseguir} style={{
        width: '100%', padding: 14, borderRadius: 12, border: 'none',
        background: podeProsseguir ? '#1e3a5f' : '#e2e8f0',
        color: podeProsseguir ? '#fff' : '#94a3b8',
        fontSize: 15, fontWeight: 700,
        cursor: podeProsseguir ? 'pointer' : 'not-allowed', marginBottom: 10,
      }}>Continuar →</button>

      <button onClick={prev} style={{
        width: '100%', padding: 13, borderRadius: 10,
        border: '1px solid #e2e8f0', background: '#f8fafc',
        color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer',
      }}>← Voltar</button>

      {assinandoPart && (
        <AssinaturaPad
          nomeParticipante={assinandoPart.nome}
          onConfirmar={onConfirmarAssinatura}
          onCancelar={() => setAssinandoPart(null)}
        />
      )}
    </div>
  )
}
