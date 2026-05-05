import { useRef, useEffect, useState } from 'react'
import { Field, NavBar, Alert } from '../components/Shared.jsx'

function PainelAssinatura({ label, nome, onNome, assinatura, onAssinatura, obrigatorio }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [signed, setSigned] = useState(!!assinatura)

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (assinatura) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0)
      img.src = assinatura
    }
  }, [])

  const getPos = (e, c) => {
    const rect = c.getBoundingClientRect()
    // Fator de escala entre tamanho real do canvas e tamanho visual
    const scaleX = c.width / rect.width
    const scaleY = c.height / rect.height
    if (e.touches) return {
      x: (e.touches[0].clientX - rect.left) * scaleX,
      y: (e.touches[0].clientY - rect.top) * scaleY,
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const startDraw = e => {
    e.preventDefault(); drawing.current = true
    const c = canvasRef.current; const ctx = c.getContext('2d')
    const p = getPos(e, c); ctx.beginPath(); ctx.moveTo(p.x, p.y)
  }
  const draw = e => {
    e.preventDefault(); if (!drawing.current) return
    const c = canvasRef.current; const ctx = c.getContext('2d')
    const p = getPos(e, c); ctx.lineTo(p.x, p.y); ctx.stroke()
  }
  const endDraw = e => {
    e.preventDefault(); if (!drawing.current) return
    drawing.current = false
    const dataURL = canvasRef.current.toDataURL()
    onAssinatura(dataURL); setSigned(true)
  }
  const limpar = () => {
    canvasRef.current.getContext('2d').clearRect(0, 0, 560, 150)
    onAssinatura(null); setSigned(false)
  }

  return (
    <div style={{
      background: '#fff', borderRadius: 14,
      border: `1.5px solid ${signed ? '#86efac' : obrigatorio ? '#fcd34d' : '#e2e8f0'}`,
      padding: 14, marginBottom: 14,
    }}>
      {/* Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
          background: obrigatorio ? '#fef3c7' : '#f1f5f9',
          color: obrigatorio ? '#92400e' : '#64748b',
        }}>
          {label} {obrigatorio ? '— obrigatório' : '— opcional'}
        </span>
        {signed && <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>✓ Assinado</span>}
      </div>

      {/* Nome */}
      <Field
        label={`Nome do ${label}`}
        value={nome}
        onChange={onNome}
        placeholder="Nome completo"
      />

      {/* Canvas */}
      <p style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
        {signed ? 'Assinatura registrada — desenhe novamente para alterar:' : 'Assine abaixo:'}
      </p>
      <canvas
        ref={canvasRef}
        width={560} height={150}
        className="signature-canvas"
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <p style={{ fontSize: 11, color: '#94a3b8' }}>Use o dedo para assinar</p>
        <button onClick={limpar} style={{ fontSize: 12, color: '#ef4444', textDecoration: 'underline', padding: 0, background: 'none', border: 'none', cursor: 'pointer' }}>
          Limpar
        </button>
      </div>
    </div>
  )
}

export default function S5Assinatura({ form, upd, next, prev }) {
  // Pelo menos o Eletricista 1 deve ter assinado
  const ok = !!form.assinatura

  return (
    <div>
      <PainelAssinatura
        label="Eletricista 1"
        nome={form.nomeEletricista}
        onNome={v => upd('nomeEletricista', v)}
        assinatura={form.assinatura}
        onAssinatura={v => upd('assinatura', v)}
        obrigatorio={true}
      />

      <PainelAssinatura
        label="Eletricista 2"
        nome={form.nomeEletricista2 || ''}
        onNome={v => upd('nomeEletricista2', v)}
        assinatura={form.assinatura2 || null}
        onAssinatura={v => upd('assinatura2', v)}
        obrigatorio={false}
      />

      <Alert type="warning">
        ⚠️ Ao assinar, o eletricista declara ciência da auditoria realizada pelo fiscal{' '}
        <strong>{form.fiscal || '(fiscal)'}</strong> em {form.data} às {form.hora}.
      </Alert>

      <div style={{ height: 80 }} />
      <NavBar onPrev={prev} onNext={ok ? next : undefined} nextDisabled={!ok} nextLabel="Ver Resultado →" />
    </div>
  )
}
