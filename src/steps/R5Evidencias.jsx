import { useRef } from 'react'
import { TIPOS_REGISTRO } from '../data/registros_config.js'

const MAX_FOTOS = 5

// ── Watermark: GPS + fiscal + data/hora ───────────────────────────────────────
async function adicionarWatermark(base64, form) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width  = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)

      const barH    = Math.max(Math.round(img.height * 0.09), 44)
      const fSize   = Math.max(Math.round(img.height * 0.028), 13)
      const fSizeSm = Math.max(Math.round(img.height * 0.022), 10)
      const pad     = 10

      ctx.fillStyle = 'rgba(0,0,0,0.68)'
      ctx.fillRect(0, img.height - barH, img.width, barH)

      ctx.fillStyle = '#ffffff'
      ctx.font      = `bold ${fSize}px Arial`
      ctx.fillText(
        `${form.fiscal || '—'} · ${form.data || ''} às ${form.hora || ''}`,
        pad, img.height - barH + fSize + 4
      )

      if (form.lat) {
        ctx.font      = `${fSizeSm}px Arial`
        ctx.fillStyle = '#d1fae5'
        ctx.fillText(
          `📍 ${Number(form.lat).toFixed(5)}, ${Number(form.lng).toFixed(5)}`,
          pad, img.height - barH + fSize + fSizeSm + 10
        )
      }

      resolve(canvas.toDataURL('image/jpeg', 0.88))
    }
    img.onerror = () => resolve(base64)
    img.src = base64
  })
}

export default function R5Evidencias({ form, upd, next, prev }) {
  const tipoConfig = TIPOS_REGISTRO[form.tipo]
  const cameraRef  = useRef(null)
  const galeriaRef = useRef(null)
  const listaRef   = useRef(null)

  // ── FIX: processa TODAS as fotos primeiro, depois faz um único upd ──────────
  const processarFotos = async (files) => {
    const filesArray = Array.from(files || [])
    const disponiveis = MAX_FOTOS - form.fotos.length
    if (disponiveis <= 0) return

    const selecionadas = filesArray.slice(0, disponiveis)
    const novasFotos = []

    for (const file of selecionadas) {
      const base64 = await new Promise(res => {
        const reader = new FileReader()
        reader.onload = ev => res(ev.target.result)
        reader.readAsDataURL(file)
      })
      const comMarca = await adicionarWatermark(base64, form)
      novasFotos.push({ url: comMarca })
    }

    // Um único upd com todas as fotos acumuladas
    upd('fotos', [...form.fotos, ...novasFotos])
  }

  const onCamera  = async (e) => { await processarFotos(e.target.files); e.target.value = '' }
  const onGaleria = async (e) => { await processarFotos(e.target.files); e.target.value = '' }

  const removerFoto = (idx) => {
    upd('fotos', form.fotos.filter((_, i) => i !== idx))
  }

  const onListaImpressaFoto = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => upd('lista_impressa', ev.target.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const podeProsseguir = form.fotos.length >= 1
  const fotasRestantes = MAX_FOTOS - form.fotos.length

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
      </div>

      <h2 style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>
        Evidências
      </h2>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>
        Adicione pelo menos <strong>1 foto</strong> de evidência.
      </p>
      <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20, lineHeight: 1.5 }}>
        📍 As fotos serão marcadas com GPS, nome do fiscal e data/hora automaticamente.
      </p>

      {/* ── Fotos de evidência ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>
            📷 Fotos de Evidência ({form.fotos.length}/{MAX_FOTOS})
          </p>
          {form.fotos.length === 0 && (
            <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700 }}>
              obrigatório — mínimo 1
            </span>
          )}
        </div>

        {/* Grade de fotos adicionadas */}
        {form.fotos.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
            {form.fotos.map((foto, i) => (
              <div key={i} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', aspectRatio: '1' }}>
                <img src={foto.url} alt={`Foto ${i+1}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <button onClick={() => removerFoto(i)} style={{
                  position: 'absolute', top: 4, right: 4, width: 24, height: 24,
                  borderRadius: '50%', border: 'none', background: 'rgba(220,38,38,0.85)',
                  color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 700,
                }}>✕</button>
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'rgba(0,0,0,0.5)', color: '#fff',
                  fontSize: 9, padding: '2px 4px', textAlign: 'center',
                }}>Foto {i+1}</div>
              </div>
            ))}
          </div>
        )}

        {/* Botões Tirar Foto / Da Galeria */}
        {form.fotos.length < MAX_FOTOS && (
          <>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onCamera}
              style={{ display: 'none' }}
            />
            {/* multiple permite selecionar várias fotos de uma vez */}
            <input
              ref={galeriaRef}
              type="file"
              accept="image/*"
              multiple
              onChange={onGaleria}
              style={{ display: 'none' }}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

              <button
                onClick={() => cameraRef.current?.click()}
                style={{
                  padding: '20px 12px', borderRadius: 14,
                  border: `2px dashed ${form.fotos.length === 0 ? '#dc2626' : '#2563eb'}`,
                  background: form.fotos.length === 0 ? '#fef2f2' : '#eff6ff',
                  cursor: 'pointer', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 8,
                }}
              >
                <span style={{ fontSize: 32 }}>📷</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: form.fotos.length === 0 ? '#dc2626' : '#2563eb' }}>
                  Tirar foto
                </span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>Câmera</span>
              </button>

              <button
                onClick={() => galeriaRef.current?.click()}
                style={{
                  padding: '20px 12px', borderRadius: 14,
                  border: `2px dashed ${form.fotos.length === 0 ? '#dc2626' : '#2563eb'}`,
                  background: form.fotos.length === 0 ? '#fef2f2' : '#eff6ff',
                  cursor: 'pointer', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 8,
                }}
              >
                <span style={{ fontSize: 32 }}>🖼️</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: form.fotos.length === 0 ? '#dc2626' : '#2563eb' }}>
                  Da galeria
                </span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  {fotasRestantes > 1 ? `até ${fotasRestantes} fotos` : 'Galeria'}
                </span>
              </button>
            </div>

            {form.fotos.length === 0 && (
              <div style={{
                marginTop: 10, background: '#fef3c7', border: '1px solid #fcd34d',
                borderRadius: 10, padding: '8px 14px', textAlign: 'center',
              }}>
                <p style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>
                  ⚠️ Adicione pelo menos 1 foto
                </p>
              </div>
            )}

            {/* Dica de seleção múltipla */}
            {form.fotos.length > 0 && fotasRestantes > 1 && (
              <div style={{ marginTop: 8, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: '#0369a1' }}>
                  💡 Na galeria, mantenha pressionado para selecionar até {fotasRestantes} fotos de uma vez
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Lista de Frequência Impressa ── */}
      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 20 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
          📄 Lista de Frequência Impressa (opcional)
        </p>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12, lineHeight: 1.5 }}>
          Se você usou uma lista impressa assinada manualmente, tire uma foto e adicione aqui.
        </p>

        {form.lista_impressa ? (
          <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
            <img src={form.lista_impressa} alt="Lista impressa"
              style={{ width: '100%', borderRadius: 12, display: 'block', border: '1.5px solid #e2e8f0' }} />
            <button onClick={() => upd('lista_impressa', null)} style={{
              position: 'absolute', top: 8, right: 8, padding: '4px 10px',
              borderRadius: 8, border: 'none', background: 'rgba(220,38,38,0.85)',
              color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 700,
            }}>✕ Remover</button>
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'rgba(0,0,0,0.5)', color: '#fff',
              fontSize: 11, padding: '4px 8px', textAlign: 'center',
            }}>📄 Lista de frequência impressa</div>
          </div>
        ) : (
          <>
            <input
              ref={listaRef}
              type="file"
              accept="image/*"
              onChange={onListaImpressaFoto}
              style={{ display: 'none' }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button onClick={() => {
                if (listaRef.current) {
                  listaRef.current.removeAttribute('multiple')
                  listaRef.current.setAttribute('capture', 'environment')
                  listaRef.current.click()
                }
              }} style={{
                padding: '16px 12px', borderRadius: 14,
                border: '2px dashed #64748b', background: '#f8fafc',
                cursor: 'pointer', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 26 }}>📷</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>Tirar foto</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>da lista</span>
              </button>

              <button onClick={() => {
                if (listaRef.current) {
                  listaRef.current.removeAttribute('capture')
                  listaRef.current.click()
                }
              }} style={{
                padding: '16px 12px', borderRadius: 14,
                border: '2px dashed #64748b', background: '#f8fafc',
                cursor: 'pointer', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 26 }}>🖼️</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>Da galeria</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>da lista</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Navegação */}
      <div style={{ marginTop: 24 }}>
        <button onClick={next} disabled={!podeProsseguir} style={{
          width: '100%', padding: 14, borderRadius: 12, border: 'none',
          background: podeProsseguir ? '#1e3a5f' : '#e2e8f0',
          color: podeProsseguir ? '#fff' : '#94a3b8',
          fontSize: 15, fontWeight: 700,
          cursor: podeProsseguir ? 'pointer' : 'not-allowed',
          marginBottom: 10,
        }}>
          {podeProsseguir ? 'Continuar →' : '⚠️ Adicione pelo menos 1 foto'}
        </button>
        <button onClick={prev} style={{
          width: '100%', padding: 13, borderRadius: 10,
          border: '1px solid #e2e8f0', background: '#f8fafc',
          color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>← Voltar</button>
      </div>
    </div>
  )
}
