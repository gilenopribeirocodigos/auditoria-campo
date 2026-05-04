import { useRef, useEffect, useState } from 'react'
import { Field, NavBar, Alert } from '../components/Shared.jsx'

export default function S5Assinatura({ form, upd, next, prev }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [signed, setSigned] = useState(!!form.assinatura)

  // Configura o canvas e restaura assinatura salva
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (form.assinatura) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0)
      img.src = form.assinatura
    }
  }, [])

  // Redimensiona canvas para resolução correta (evita desenho distorcido)
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const rect = c.getBoundingClientRect()
    if (c.width !== rect.width || c.height !== rect.height) {
      const ctx = c.getContext('2d')
      const imgData = ctx.getImageData(0, 0, c.width, c.height)
      c.width = rect.width
      c.height = rect.height
      ctx.putImageData(imgData, 0, 0)
      ctx.strokeStyle = '#1e293b'
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    }
  })

  const getPos = (e, c) => {
    const rect = c.getBoundingClientRect()
    if (e.touches) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      }
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const startDraw = e => {
    e.preventDefault()
    drawing.current = true
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    const p = getPos(e, c)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  const draw = e => {
    e.preventDefault()
    if (!drawing.current) return
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    const p = getPos(e, c)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }

  const endDraw = e => {
    e.preventDefault()
    if (!drawing.current) return
    drawing.current = false
    const dataURL = canvasRef.current.toDataURL()
    upd('assinatura', dataURL)
    setSigned(true)
  }

  const limpar = () => {
    const c = canvasRef.current
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
    upd('assinatura', null)
    setSigned(false)
  }

  return (
    <div>
      <Field
        label="Nome do Eletricista"
        value={form.nomeEletricista}
        onChange={v => upd('nomeEletricista', v)}
        placeholder="Nome completo do responsável da equipe"
      />

      <div className="card" style={{ padding: 14 }}>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
          {signed ? '✅ Assinatura registrada — desenhe novamente para alterar:' : 'Assine no campo abaixo:'}
        </p>
        <canvas
          ref={canvasRef}
          className="signature-canvas"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <p style={{ fontSize: 11, color: '#94a3b8' }}>Use o dedo para assinar</p>
          <button onClick={limpar} style={{ fontSize: 12, color: '#ef4444', textDecoration: 'underline', padding: 0 }}>
            Limpar
          </button>
        </div>
      </div>

      <Alert type="warning">
        ⚠️ Ao assinar, o eletricista declara ciência da auditoria realizada pelo fiscal{' '}
        <strong>{form.fiscal || '(fiscal)'}</strong> em {form.data} às {form.hora}.
      </Alert>

      <div style={{ height: 80 }} />
      <NavBar onPrev={prev} onNext={next} nextLabel="Ver Resultado →" />
    </div>
  )
}
