import { useState } from 'react'
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

// ── Bloco de upload de fotos reutilizável (usado tanto pras fotos normais
// quanto pras fotos do Motivo da Auditoria) ──────────────────────────────────
function BlocoFotos({ fotos, onAdd, onRemover, corLabel, labelTirar, labelGaleria }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <label style={{ flex: 1, cursor: 'pointer' }}>
          <input type="file" accept="image/*" capture="environment" multiple onChange={onAdd} style={{ display: 'none' }} />
          <div className="upload-zone" style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>📷</div>
            <p style={{ color: corLabel, fontWeight: 700, fontSize: 13 }}>{labelTirar}</p>
            <p style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Câmera</p>
          </div>
        </label>

        <label style={{ flex: 1, cursor: 'pointer' }}>
          <input type="file" accept="image/*" multiple onChange={onAdd} style={{ display: 'none' }} />
          <div className="upload-zone" style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>🖼️</div>
            <p style={{ color: '#7c3aed', fontWeight: 700, fontSize: 13 }}>{labelGaleria}</p>
            <p style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Galeria</p>
          </div>
        </label>
      </div>

      {fotos.length > 0 && (
        <div className="photo-grid" style={{ marginBottom: 12 }}>
          {fotos.map((foto, i) => (
            <div key={i} className="photo-thumb">
              <img src={foto.url} alt={`Foto ${i + 1}`} />
              <button className="photo-remove" onClick={() => onRemover(i)}>×</button>
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 9,
                padding: '2px 4px', textAlign: 'center',
              }}>
                Foto {i + 1} ✓
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

export default function S4Fotos({ form, upd, setForm, next, prev, modoEdicao, fotosAntigas }) {
  const faltam        = Math.max(0, MIN_FOTOS - form.fotos.length)
  const podeContinuarFotos = modoEdicao ? true : form.fotos.length >= MIN_FOTOS

  // ── Bloco condicional: só existe se a auditoria tiver Motivo da Auditoria ──
  const temMotivo = !!form.motivoAuditoria

  // Validação do bloco de motivo (só exige se temMotivo)
  const motivoOk = !temMotivo || (
    (form.fotosMotivo?.length || 0) >= 1 &&
    form.statusMotivoAuditoria !== null &&
    form.statusMotivoAuditoria !== undefined &&
    (form.observacoesMotivoAuditoria || '').trim().length > 0
  )

  const podeContinuar = podeContinuarFotos && motivoOk

  const addFoto = async e => {
    const files = Array.from(e.target.files)
    for (const file of files) {
      const foto = await processarFoto(file, form.lat, form.lng, form.prefixo, form.fiscal)
      setForm(f => ({ ...f, fotos: [...f.fotos, foto] }))
    }
    e.target.value = ''
  }

  const remover = i => setForm(f => ({ ...f, fotos: f.fotos.filter((_, j) => j !== i) }))

  // ── Fotos do Motivo da Auditoria (estado separado: form.fotosMotivo) ──
  const addFotoMotivo = async e => {
    const files = Array.from(e.target.files)
    for (const file of files) {
      const foto = await processarFoto(file, form.lat, form.lng, form.prefixo, form.fiscal)
      setForm(f => ({ ...f, fotosMotivo: [...(f.fotosMotivo || []), foto] }))
    }
    e.target.value = ''
  }
  const removerFotoMotivo = i => setForm(f => ({ ...f, fotosMotivo: (f.fotosMotivo || []).filter((_, j) => j !== i) }))

  return (
    <div>
      {/* ── ITEM 1: título acima das fotos ── */}
      <SectionTitle>Fotos da Auditoria</SectionTitle>

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

      <BlocoFotos
        fotos={form.fotos}
        onAdd={addFoto}
        onRemover={remover}
        corLabel="#1d4ed8"
        labelTirar="Tirar foto"
        labelGaleria="Da galeria"
      />

      {/* Status */}
      <p style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 12 }}>
        {modoEdicao
          ? form.fotos.length > 0
            ? `✅ ${form.fotos.length} nova(s) foto(s) — serão somadas às anteriores`
            : 'As fotos anteriores serão mantidas'
          : form.fotos.length === 0
            ? `Obrigatório: mínimo ${MIN_FOTOS} fotos`
            : form.fotos.length < MIN_FOTOS
              ? `Falta ${faltam} foto(s) — mínimo ${MIN_FOTOS}`
              : `✅ ${form.fotos.length} foto(s) adicionada(s)`}
      </p>

      {!podeContinuarFotos && (
        <div className="alert alert-warning">
          📸 Obrigatório pelo menos <strong>{MIN_FOTOS} fotos</strong> com data/hora e GPS para continuar.
        </div>
      )}

      <div className="alert alert-info" style={{ fontSize: 11 }}>
        🕐 Timestamp (data/hora) e coordenadas GPS são gravados automaticamente em cada foto.
      </div>

      {/* ── ITEM 2: Observações renomeadas ── */}
      <SectionTitle>Observações da Auditoria</SectionTitle>
      <Textarea value={form.observacoes} onChange={v => upd('observacoes', v)} label=""
        placeholder="Descreva detalhes relevantes, condições encontradas, não conformidades..." rows={4} />

      {/* ═══════════════════════════════════════════════════════════════════
          BLOCO CONDICIONAL — só aparece se houver Motivo da Auditoria
          (vem da pauta, ex: "MATERIAL APLICADO EM CAMPO")
          ITEM 3: Fotos Motivo Auditoria
          ITEM 4: Check Conforme / Não Conforme
          ITEM 5: Observações Motivo Auditoria
      ═══════════════════════════════════════════════════════════════════ */}
      {temMotivo && (
        <div style={{
          background: '#fff7ed', border: '2px solid #fb923c', borderRadius: 14,
          padding: '16px', marginTop: 20,
        }}>
          <div style={{
            display: 'inline-block', background: '#fff', border: '1.5px solid #fed7aa',
            color: '#c2410c', fontWeight: 800, fontSize: 13,
            padding: '6px 12px', borderRadius: 8, marginBottom: 14,
          }}>
            🎯 Motivo da Auditoria: {form.motivoAuditoria}
          </div>

          {/* ITEM 3: Fotos Motivo Auditoria */}
          <p style={{ fontSize: 12, fontWeight: 800, color: '#9a3412', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            📷 Fotos Motivo Auditoria *
          </p>
          <BlocoFotos
            fotos={form.fotosMotivo || []}
            onAdd={addFotoMotivo}
            onRemover={removerFotoMotivo}
            corLabel="#c2410c"
            labelTirar="Tirar foto"
            labelGaleria="Da galeria"
          />
          {(form.fotosMotivo?.length || 0) === 0 && (
            <div className="alert alert-warning" style={{ marginBottom: 14 }}>
              📸 Obrigatório pelo menos <strong>1 foto</strong> referente ao motivo da auditoria.
            </div>
          )}

          {/* ITEM 4: Check Conforme / Não Conforme */}
          <p style={{ fontSize: 12, fontWeight: 800, color: '#9a3412', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 10 }}>
            ✅ Avaliação do Motivo *
          </p>
          <div style={{ display: 'flex', gap: 10, marginBottom: form.statusMotivoAuditoria === null ? 8 : 14 }}>
            <button
              onClick={() => upd('statusMotivoAuditoria', true)}
              style={{
                flex: 1, padding: '12px', borderRadius: 10, cursor: 'pointer',
                fontSize: 14, fontWeight: 800,
                border: `2px solid ${form.statusMotivoAuditoria === true ? '#16a34a' : '#cbd5e1'}`,
                background: form.statusMotivoAuditoria === true ? '#16a34a' : '#fff',
                color: form.statusMotivoAuditoria === true ? '#fff' : '#64748b',
              }}>✓ CONFORME</button>
            <button
              onClick={() => upd('statusMotivoAuditoria', false)}
              style={{
                flex: 1, padding: '12px', borderRadius: 10, cursor: 'pointer',
                fontSize: 14, fontWeight: 800,
                border: `2px solid ${form.statusMotivoAuditoria === false ? '#dc2626' : '#cbd5e1'}`,
                background: form.statusMotivoAuditoria === false ? '#dc2626' : '#fff',
                color: form.statusMotivoAuditoria === false ? '#fff' : '#64748b',
              }}>✗ NÃO CONFORME</button>
          </div>
          {(form.statusMotivoAuditoria === null || form.statusMotivoAuditoria === undefined) && (
            <p style={{ fontSize: 11, color: '#dc2626', marginBottom: 14, fontWeight: 700 }}>
              ⚠️ Selecione Conforme ou Não Conforme para continuar.
            </p>
          )}

          {/* ITEM 5: Observações Motivo Auditoria */}
          <p style={{ fontSize: 12, fontWeight: 800, color: '#9a3412', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            💬 Observações Motivo Auditoria *
          </p>
          <Textarea
            value={form.observacoesMotivoAuditoria || ''}
            onChange={v => upd('observacoesMotivoAuditoria', v)}
            label=""
            placeholder="Descreva o que foi observado em relação ao motivo desta auditoria..."
            rows={4}
          />
          {(form.observacoesMotivoAuditoria || '').trim().length === 0 && (
            <p style={{ fontSize: 11, color: '#dc2626', marginTop: -8, fontWeight: 700 }}>
              ⚠️ Obrigatório descrever a observação do motivo da auditoria.
            </p>
          )}
        </div>
      )}

      <div style={{ height: 80 }} />
      <NavBar onPrev={prev} onNext={podeContinuar ? next : undefined} nextDisabled={!podeContinuar} />
    </div>
  )
}
