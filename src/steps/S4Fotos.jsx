import { SectionTitle, NavBar, Textarea } from '../components/Shared.jsx'

const MIN_FOTOS = 2

// Adiciona timestamp + GPS na foto via Canvas
function processarFoto(file, lat, lng) {
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

        // Número de linhas: timestamp + GPS (se disponível)
        const linhas = [ts]
        if (lat && lng) linhas.push(`GPS: ${lat}, ${lng}`)

        const boxH = linhas.length * lineH + pad * 2
        const boxY = img.height - boxH - 10

        // Fundo semitransparente
        ctx.fillStyle = 'rgba(0,0,0,0.65)'
        ctx.fillRect(0, boxY, img.width, boxH + 10)

        ctx.font = `bold ${fontSize}px monospace`

        linhas.forEach((linha, i) => {
          const y = boxY + pad + fontSize + i * lineH
          // Sombra
          ctx.fillStyle = 'rgba(0,0,0,0.8)'
          ctx.fillText(linha, pad + 2, y + 2)
          // Texto branco (timestamp) ou verde (GPS)
          ctx.fillStyle = i === 0 ? '#ffffff' : '#4ade80'
          ctx.fillText(linha, pad, y)
        })

        resolve({ url: canvas.toDataURL('image/jpeg', 0.88), name: file.name })
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

export default function S4Fotos({ form, upd, setForm, next, prev }) {
  const faltam = Math.max(0, MIN_FOTOS - form.fotos.length)
  const podeContinuar = form.fotos.length >= MIN_FOTOS

  const addFoto = async e => {
    const files = Array.from(e.target.files)
    for (const file of files) {
      const foto = await processarFoto(file, form.lat, form.lng)
      setForm(f => ({ ...f, fotos: [...f.fotos, foto] }))
    }
    e.target.value = ''
  }

  const remover = i => setForm(f => ({ ...f, fotos: f.fotos.filter((_, j) => j !== i) }))

  return (
    <div>
      <SectionTitle>Registro Fotográfico</SectionTitle>

      {/* Zona de upload */}
      <label style={{ cursor: 'pointer', display: 'block' }}>
        <input type="file" accept="image/*" capture="environment" multiple onChange={addFoto} style={{ display: 'none' }} />
        <div className="upload-zone">
          <div style={{ fontSize: 36, marginBottom: 8 }}>📷</div>
          <p style={{ color: '#1d4ed8', fontWeight: 700, fontSize: 14 }}>
            Tirar foto / Selecionar da galeria
          </p>
          <p style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
            {form.fotos.length === 0
              ? `Mínimo ${MIN_FOTOS} fotos obrigatórias`
              : form.fotos.length < MIN_FOTOS
                ? `Falta ${faltam} foto(s) — mínimo ${MIN_FOTOS}`
                : `✅ ${form.fotos.length} foto(s) — timestamp aplicado automaticamente`}
          </p>
        </div>
      </label>

      {/* Alerta de mínimo */}
      {!podeContinuar && (
        <div className="alert alert-warning">
          📸 São obrigatórias pelo menos <strong>{MIN_FOTOS} fotos</strong> com timestamp para continuar.
          {faltam > 0 && ` Adicione mais ${faltam} foto(s).`}
        </div>
      )}

      {/* Grade de fotos */}
      {form.fotos.length > 0 && (
        <div className="photo-grid">
          {form.fotos.map((foto, i) => (
            <div key={i} className="photo-thumb">
              <img src={foto.url} alt={`Foto ${i + 1}`} />
              <button className="photo-remove" onClick={() => remover(i)}>×</button>
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'rgba(0,0,0,0.55)', color: '#fff',
                fontSize: 9, padding: '2px 4px', textAlign: 'center',
              }}>
                Foto {i + 1} {form.fotos.length >= MIN_FOTOS ? '✓' : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info do timestamp */}
      <div className="alert alert-info" style={{ fontSize: 11 }}>
        🕐 Cada foto recebe automaticamente: <strong>data/hora</strong> e{' '}
        <strong>coordenadas GPS</strong> {form.lat ? `(${form.lat}, ${form.lng})` : '(capture o GPS na etapa anterior)'} gravados diretamente na imagem.
      </div>

      <SectionTitle>Observações</SectionTitle>
      <Textarea value={form.observacoes} onChange={v => upd('observacoes', v)} label=""
        placeholder="Descreva detalhes relevantes, condições encontradas, não conformidades observadas..."
        rows={4} />

      <div style={{ height: 80 }} />
      <NavBar onPrev={prev} onNext={podeContinuar ? next : undefined} nextDisabled={!podeContinuar} />
    </div>
  )
}
