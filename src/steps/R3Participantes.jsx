import { useState, useRef, useEffect } from 'react'
import { TIPOS_REGISTRO, MODALIDADES } from '../data/registros_config.js'
import { supabase } from '../lib/supabase.js'

// ── Canvas de assinatura ──────────────────────────────────────────────────────
function AssinaturaPad({ nomeParticipante, onConfirmar, onCancelar }) {
  const canvasRef = useRef(null)
  const [desenhando, setDesenhando] = useState(false)
  const [temTraco, setTemTraco] = useState(false)
  const ultRef = useRef({ x: 0, y: 0 })

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
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    const src = e.touches ? e.touches[0] : e
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top)  * scaleY,
    }
  }

  const iniciar = e => {
    e.preventDefault()
    const canvas = canvasRef.current
    const pos = getPos(e, canvas)
    ultRef.current = pos
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
    const ctx = canvas.getContext('2d')
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    ultRef.current = pos
  }

  const parar = e => { e.preventDefault(); setDesenhando(false) }

  const limpar = () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fafafa'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setTemTraco(false)
  }

  const confirmar = () => {
    if (!temTraco) return
    onConfirmar(canvasRef.current.toDataURL('image/png'))
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000, padding: 16,
    }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '20px', width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 2 }}>Assinatura de</p>
          <p style={{ fontSize: 17, fontWeight: 800, color: '#1e293b' }}>{nomeParticipante}</p>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Assine abaixo para confirmar participação</p>
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
          <button onClick={limpar} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>🔄 Limpar</button>
          <button onClick={onCancelar} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>✕ Cancelar</button>
          <button onClick={confirmar} disabled={!temTraco} style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: temTraco ? '#16a34a' : '#e2e8f0', color: temTraco ? '#fff' : '#94a3b8', fontSize: 14, fontWeight: 700, cursor: temTraco ? 'pointer' : 'not-allowed' }}>✅ Confirmar</button>
        </div>
      </div>
    </div>
  )
}

// ── Autocomplete de eletricista ───────────────────────────────────────────────
function AutocompleteEletricista({ onSelect }) {
  const [termo, setTermo] = useState('')
  const [sugestoes, setSugestoes] = useState([])
  const [aberto, setAberto] = useState(false)
  const [matricula, setMatricula] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const buscar = async (v) => {
    setTermo(v)
    setMatricula('')
    if (v.length < 2) { setSugestoes([]); setAberto(false); return }

    try {
      // Tenta buscar eletricistas na estrutura_equipes
      // Adapte os nomes das colunas conforme o seu banco:
      // Tentativa 1: colunas eletricista_1 / matricula_1 / eletricista_2 / matricula_2
      const { data, error } = await supabase
        .from('estrutura_equipes')
        .select('eletricista_1, matricula_1, eletricista_2, matricula_2')
        .or(`eletricista_1.ilike.%${v}%,eletricista_2.ilike.%${v}%`)
        .limit(20)

      if (!error && data?.length > 0) {
        const resultados = []
        const vistos = new Set()
        data.forEach(row => {
          if (row.eletricista_1 && row.eletricista_1.toLowerCase().includes(v.toLowerCase())) {
            const key = `${row.eletricista_1}|${row.matricula_1}`
            if (!vistos.has(key)) {
              vistos.add(key)
              resultados.push({ nome: row.eletricista_1, matricula: row.matricula_1 || '' })
            }
          }
          if (row.eletricista_2 && row.eletricista_2.toLowerCase().includes(v.toLowerCase())) {
            const key = `${row.eletricista_2}|${row.matricula_2}`
            if (!vistos.has(key)) {
              vistos.add(key)
              resultados.push({ nome: row.eletricista_2, matricula: row.matricula_2 || '' })
            }
          }
        })
        setSugestoes(resultados)
        setAberto(resultados.length > 0)
        return
      }
    } catch (e) { /* tenta próxima abordagem */ }

    try {
      // Tentativa 2: colunas nome / matricula diretamente
      const { data, error } = await supabase
        .from('estrutura_equipes')
        .select('nome, matricula')
        .ilike('nome', `%${v}%`)
        .limit(10)

      if (!error && data?.length > 0) {
        setSugestoes(data.map(r => ({ nome: r.nome, matricula: r.matricula || '' })))
        setAberto(true)
        return
      }
    } catch (e) { /* silencioso */ }

    setSugestoes([])
    setAberto(false)
  }

  const selecionar = (item) => {
    setTermo(item.nome)
    setMatricula(item.matricula || '')
    setSugestoes([])
    setAberto(false)
    onSelect(item.nome, item.matricula || '')
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div className="form-group">
        <label className="form-label">Nome completo *</label>
        <input
          className="form-input"
          value={termo}
          onChange={e => buscar(e.target.value)}
          onFocus={() => sugestoes.length > 0 && setAberto(true)}
          placeholder="Digite para buscar o eletricista..."
          autoFocus
        />
      </div>

      {aberto && sugestoes.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
          background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto',
        }}>
          {sugestoes.map((s, i) => (
            <button key={i}
              onMouseDown={() => selecionar(s)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                width: '100%', padding: '10px 14px', textAlign: 'left',
                background: 'none', border: 'none',
                borderBottom: i < sugestoes.length - 1 ? '1px solid #f1f5f9' : 'none',
                fontSize: 13, color: '#1e293b', cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <span style={{ fontWeight: 600 }}>{s.nome}</span>
              {s.matricula && <span style={{ fontSize: 11, color: '#64748b' }}>Mat: {s.matricula}</span>}
            </button>
          ))}
        </div>
      )}

      {matricula && (
        <div className="form-group" style={{ marginTop: 8 }}>
          <label className="form-label">Matrícula</label>
          <input
            className="form-input"
            value={matricula}
            onChange={e => setMatricula(e.target.value)}
            placeholder="Matrícula"
            inputMode="numeric"
            style={{ background: '#f0fdf4', borderColor: '#86efac' }}
            onBlur={() => onSelect(termo, matricula)}
          />
        </div>
      )}

      {!matricula && termo && (
        <div className="form-group" style={{ marginTop: 8 }}>
          <label className="form-label">Matrícula (opcional)</label>
          <input
            className="form-input"
            placeholder="Matrícula"
            inputMode="numeric"
            onChange={e => { setMatricula(e.target.value); onSelect(termo, e.target.value) }}
          />
        </div>
      )}
    </div>
  )
}

// ── Formulário de novo participante ───────────────────────────────────────────
function FormParticipante({ onSolicitar, onCancelar }) {
  const [nome, setNome] = useState('')
  const [matricula, setMatricula] = useState('')

  const handleSelect = (n, m) => {
    setNome(n)
    setMatricula(m)
  }

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
            flex: 1, padding: 11, borderRadius: 10, border: '1px solid #e2e8f0',
            background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer',
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
        >
          ✍️ Solicitar Assinatura
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

  const maxPart       = modConfig?.maxPart || 100
  const isDisciplinar = form.tipo === 'DISCIPLINAR'

  useEffect(() => {
    if (form.participantes.length === 0 && !adicionando) {
      setAdicionando(true)
    }
  }, [])

  const onSolicitarAssinatura = (nome, matricula) => {
    if (!nome) return
    setAdicionando(false)
    setAssinandoPart({ nome, matricula })
  }

  const onConfirmarAssinatura = (assinaturaPng) => {
    const novo = {
      nome:        assinandoPart.nome,
      matricula:   assinandoPart.matricula,
      assinatura:  assinaturaPng,
      assinado_em: new Date().toISOString(),
    }
    upd('participantes', [...form.participantes, novo])
    setAssinandoPart(null)

    if (form.modalidade === 'DUPLA' && form.participantes.length + 1 < 2) {
      setAdicionando(true)
    }
  }

  const removerParticipante = (idx) => {
    upd('participantes', form.participantes.filter((_, i) => i !== idx))
  }

  const podeProsseguir = form.participantes.length > 0

  return (
    <div style={{ padding: '0 0 80px' }}>

      <div style={{
        background: tipoConfig?.bg, border: `1.5px solid ${tipoConfig?.border}`,
        borderRadius: 10, padding: '10px 14px', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 18 }}>{tipoConfig?.emoji}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: tipoConfig?.color }}>{tipoConfig?.label}</span>
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

      {/* Participantes assinados */}
      {form.participantes.map((p, i) => (
        <div key={i} style={{
          background: '#f0fdf4', border: '1.5px solid #86efac',
          borderRadius: 12, padding: '12px 14px', marginBottom: 10,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#15803d' }}>{i + 1}. {p.nome}</p>
            {p.matricula && <p style={{ fontSize: 12, color: '#64748b' }}>Mat: {p.matricula}</p>}
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              ✅ Assinado · {new Date(p.assinado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          {p.assinatura && (
            <img src={p.assinatura} alt="assinatura"
              style={{ width: 80, height: 40, objectFit: 'contain', borderRadius: 6, background: '#fff', border: '1px solid #e2e8f0' }} />
          )}
          <button onClick={() => removerParticipante(i)} style={{
            width: 32, height: 32, borderRadius: 8, border: 'none',
            background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: 14, flexShrink: 0,
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

      {/* Botão adicionar coletivo */}
      {!adicionando && form.modalidade === 'COLETIVO' && form.participantes.length < maxPart && (
        <button onClick={() => setAdicionando(true)} style={{
          width: '100%', padding: 13, borderRadius: 12,
          border: '2px dashed #2563eb', background: '#eff6ff',
          color: '#2563eb', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 12,
        }}>
          + Adicionar participante
        </button>
      )}

      {/* Botão adicionar dupla com 1 */}
      {!adicionando && form.modalidade === 'DUPLA' && form.participantes.length < 2 && (
        <button onClick={() => setAdicionando(true)} style={{
          width: '100%', padding: 13, borderRadius: 12,
          border: '2px dashed #2563eb', background: '#eff6ff',
          color: '#2563eb', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 12,
        }}>
          + Adicionar 2º participante
        </button>
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
      }}>
        Continuar →
      </button>
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
