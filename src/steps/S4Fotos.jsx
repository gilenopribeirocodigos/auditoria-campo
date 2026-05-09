import { SectionTitle, NavBar, Textarea } from '../components/Shared.jsx'

const MIN_FOTOS = 2

function processarFoto(file, lat, lng, prefixo, fiscal) {
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

        const linhas = [ts]
        if (lat && lng) linhas.push(`GPS: ${lat}, ${lng}`)
        if (prefixo)   linhas.push(`Equipe: ${prefixo}`)
        if (fiscal)    linhas.push(`Fiscal: ${fiscal}`)

        const boxH = linhas.length * lineH + pad * 2
        const boxY = img.height - boxH - 10

        ctx.fillStyle = 'rgba(0,0,0,0.65)'
        ctx.fillRect(0, boxY, img.width, boxH + 10)
        ctx.font = `bold ${fontSize}px monospace`

        linhas.forEach((linha, i) => {
          const y = boxY + pad + fontSize + i * lineH
          ctx.fillStyle = 'rgba(0,0,0,0.8)'
          ctx.fillText(linha, pad + 2, y + 2)
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

export default function S4Fotos({ form, upd, setForm, next, prev, modoEdicao, fotosAntigas }) {
  const faltam        = Math.max(0, MIN_FOTOS - form.fotos.length)
  // Em modo edição não exige mínimo — fotos antigas já existem
  const podeContinuar = modoEdicao ? true : form.fotos.length >= MIN_FOTOS

  const addFoto = async e => {
    const files = Array.from(e.target.files)
    for (const file of files) {
      const foto = await processarFoto(file, form.lat, form.lng, form.prefixo, form.fiscal)
      setForm(f => ({ ...f, fotos: [...f.fotos, foto] }))
    }
    e.target.value = ''
  }

  const remover = i => setForm(f => ({ ...f, fotos: f.fotos.filter((_, j) => j !== i) }))

  return (
    <div>
      <SectionTitle>Registro Fotográfico</SectionTitle>

      {/* FOTOS ANTIGAS — modo edição */}
      {modoEdicao && fotosAntigas?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
            📁 Fotos anteriores ({fotosAntigas.length}) — já salvas no banco
          </p>
          <div className="photo-grid">
            {fotosAntigas.map((url, i) => (
              <div key={i} className="photo-thumb">
                <img src={url} alt={`Foto anterior ${i + 1}`} />
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'rgba(15,118,110,0.7)', color: '#fff', fontSize: 9,
                  padding: '2px 4px', textAlign: 'center',
                }}>
                  Anterior {i + 1} ✓
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NOVAS FOTOS */}
      <label style={{ cursor: 'pointer', display: 'block' }}>
        <input type="file" accept="image/*" capture="environment" multiple onChange={addFoto} style={{ display: 'none' }} />
        <div className="upload-zone">
          <div style={{ fontSize: 36, marginBottom: 8 }}>📷</div>
          <p style={{ color: '#1d4ed8', fontWeight: 700, fontSize: 14 }}>
            {modoEdicao ? 'Adicionar novas fotos (opcional)' : 'Tirar foto / Selecionar da galeria'}
          </p>
          <p style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
            {modoEdicao
              ? form.fotos.length > 0
                ? `✅ ${form.fotos.length} nova(s) foto(s) — serão somadas às anteriores`
                : 'As fotos anteriores serão mantidas'
              : form.fotos.length === 0
                ? `Obrigatório: mínimo ${MIN_FOTOS} fotos`
                : form.fotos.length < MIN_FOTOS
                  ? `Falta ${faltam} foto(s) — mínimo ${MIN_FOTOS}`
                  : `✅ ${form.fotos.length} foto(s) com timestamp gravado`}
          </p>
        </div>
      </label>

      {!podeContinuar && (
        <div className="alert alert-warning">
          📸 Obrigatório pelo menos <strong>{MIN_FOTOS} fotos</strong> com data/hora e GPS para continuar.
        </div>
      )}

      {form.fotos.length > 0 && (
        <div className="photo-grid">
          {form.fotos.map((foto, i) => (
            <div key={i} className="photo-thumb">
              <img src={foto.url} alt={`Foto ${i + 1}`} />
              <button className="photo-remove" onClick={() => remover(i)}>×</button>
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 9,
                padding: '2px 4px', textAlign: 'center',
              }}>
                Nova {i + 1} ✓
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="alert alert-info" style={{ fontSize: 11 }}>
        🕐 Timestamp (data/hora) e coordenadas GPS são gravados automaticamente em cada foto.
      </div>

      <SectionTitle>Observações</SectionTitle>
      <Textarea value={form.observacoes} onChange={v => upd('observacoes', v)} label=""
        placeholder="Descreva detalhes relevantes, condições encontradas, não conformidades..." rows={4} />

      <div style={{ height: 80 }} />
      <NavBar onPrev={prev} onNext={podeContinuar ? next : undefined} nextDisabled={!podeContinuar} />
    </div>
  )
}
