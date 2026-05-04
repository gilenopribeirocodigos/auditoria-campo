import { SectionTitle, NavBar, Textarea } from '../components/Shared.jsx'

export default function S4Fotos({ form, upd, setForm, next, prev }) {
  const addFoto = e => {
    const files = Array.from(e.target.files)
    files.forEach(file => {
      const reader = new FileReader()
      reader.onloadend = () =>
        setForm(f => ({ ...f, fotos: [...f.fotos, { url: reader.result, name: file.name }] }))
      reader.readAsDataURL(file)
    })
    // Reset input para permitir reselecionar a mesma foto
    e.target.value = ''
  }

  const remover = idx =>
    setForm(f => ({ ...f, fotos: f.fotos.filter((_, i) => i !== idx) }))

  return (
    <div>
      <SectionTitle>Registro Fotográfico</SectionTitle>

      <label style={{ cursor: 'pointer', display: 'block' }}>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={addFoto}
          style={{ display: 'none' }}
        />
        <div className="upload-zone">
          <div style={{ fontSize: 36, marginBottom: 8 }}>📷</div>
          <p style={{ color: '#1d4ed8', fontWeight: 700, fontSize: 14 }}>
            Tirar foto / Selecionar da galeria
          </p>
          <p style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
            {form.fotos.length === 0
              ? 'Nenhuma foto adicionada'
              : `${form.fotos.length} foto(s) adicionada(s)`}
          </p>
        </div>
      </label>

      {form.fotos.length > 0 && (
        <div className="photo-grid">
          {form.fotos.map((foto, i) => (
            <div key={i} className="photo-thumb">
              <img src={foto.url} alt={`Foto ${i + 1}`} />
              <button className="photo-remove" onClick={() => remover(i)}>×</button>
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 9,
                padding: '2px 4px', textAlign: 'center',
              }}>
                Foto {i + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      <SectionTitle>Observações</SectionTitle>
      <Textarea
        label=""
        value={form.observacoes}
        onChange={v => upd('observacoes', v)}
        placeholder="Descreva detalhes relevantes, condições encontradas, não conformidades observadas..."
        rows={4}
      />

      <div style={{ height: 80 }} />
      <NavBar onPrev={prev} onNext={next} nextLabel="Continuar →" />
    </div>
  )
}
