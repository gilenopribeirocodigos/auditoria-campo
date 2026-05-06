import { useState, useRef } from 'react'
import { CHECKLISTS, CAT_META, calcNota, getStatus, isDisqualified, FORM_INICIAL } from '../data/checklists.js'
import { InfoRow, StatCard } from '../components/Shared.jsx'
import { uploadBase64, salvarAuditoriaBD } from '../lib/supabase.js'

export default function S6Resultado({ form, setForm, setStep, onAuditoriaSalva }) {
  const nota      = calcNota(form)
  const st        = getStatus(nota)
  const tipo      = form.produtivo ? 'PRODUTIVO' : 'IMPRODUTIVO'
  const cl        = CHECKLISTS[form.tipoServico]?.[tipo]
  const items     = cl?.items || []
  const eliminado = isDisqualified(form)

  const sim     = items.filter(i => i.inverted ? form.respostas[i.id] === false : form.respostas[i.id] === true).length
  const nao     = items.filter(i => i.inverted ? form.respostas[i.id] === true  : form.respostas[i.id] === false).length
  const ncItems = items.filter(i => i.inverted ? form.respostas[i.id] === true  : form.respostas[i.id] === false)

  const [saveStatus, setSaveStatus] = useState('idle')
  const [saveError,  setSaveError]  = useState('')
  const [savedId,    setSavedId]    = useState(null)
  const [capturando, setCapturando] = useState(false)

  const printAreaRef = useRef(null)

  const cats = ['COMPORTAMENTO', 'QUALIDADE', 'DESEMPENHO']
  const catStats = cats.map(cat => {
    const catItems = items.filter(i => i.cat === cat)
    const catSim   = catItems.filter(i => i.inverted ? form.respostas[i.id] === false : form.respostas[i.id] === true).length
    const pct      = catItems.length > 0 ? Math.round(catSim / catItems.length * 100) : 0
    return { cat, total: catItems.length, sim: catSim, pct }
  }).filter(c => c.total > 0)

  const catBarColor = pct => pct >= 90 ? '#16a34a' : pct >= 80 ? '#d97706' : '#dc2626'
  const nova = () => { setForm(FORM_INICIAL()); setStep(0) }

  const labelTipoAuditoria = form.tipoAuditoria === 'DESEMPENHO'
    ? '📊 Desempenho Operacional'
    : form.tipoAuditoria === 'POS_SERVICO'
      ? '✅ Pós Serviço'
      : '—'

  const msgEliminado = form.tipoServico === 'CORTE'
    ? '🚫 EQUIPE NÃO EXECUTOU O CORTE'
    : '🚫 EQUIPE NÃO EXECUTOU A ATIVIDADE'

  const gerarImagemWhatsApp = async () => {
    setCapturando(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const elemento = printAreaRef.current
      if (!elemento) return
      const canvas = await html2canvas(elemento, {
        scale: 2, useCORS: true, allowTaint: true,
        backgroundColor: '#f0f4f8', logging: false, windowWidth: 480,
      })
      const nomeArquivo = `Auditoria_${form.prefixo}_OS${form.os}_${form.data}.png`.replace(/\s+/g, '_')
      if (navigator.share && navigator.canShare) {
        canvas.toBlob(async blob => {
          const file = new File([blob], nomeArquivo, { type: 'image/png' })
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `Auditoria ${form.prefixo}`,
              text: `Auditoria de Campo — ${form.prefixo} — OS ${form.os} — ${st.label}`,
            })
          } else {
            baixarImagem(canvas, nomeArquivo)
          }
        }, 'image/png')
      } else {
        baixarImagem(canvas, nomeArquivo)
      }
    } catch (err) {
      console.error('Erro ao gerar imagem:', err)
      alert('Não foi possível gerar a imagem. Tente novamente.')
    } finally {
      setCapturando(false)
    }
  }

  const baixarImagem = (canvas, nomeArquivo) => {
    const link = document.createElement('a')
    link.download = nomeArquivo
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const salvar = async () => {
    setSaveStatus('saving')
    setSaveError('')
    try {
      const auditId = `${Date.now()}_OS${form.os}_${form.prefixo}`.replace(/\s+/g, '_')

      const fotosUrls = []
      for (let i = 0; i < form.fotos.length; i++) {
        const url = await uploadBase64(form.fotos[i].url, `${auditId}/foto_${i + 1}.jpg`)
        fotosUrls.push(url)
      }

      let assinaturaUrl = null
      if (form.assinatura) {
        assinaturaUrl = await uploadBase64(form.assinatura, `${auditId}/assinatura_1.png`)
      }

      let assinatura2Url = null
      if (form.assinatura2) {
        assinatura2Url = await uploadBase64(form.assinatura2, `${auditId}/assinatura_2.png`)
      }

      const saved = await salvarAuditoriaBD({
        fiscal:            form.fiscal,
        matricula:         form.matricula,
        prefixo:           form.prefixo,
        os:                form.os,
        uc:                form.uc,
        endereco:          form.endereco,
        lat:               form.lat,
        lng:               form.lng,
        data_auditoria:    form.data,
        hora_auditoria:    form.hora,
        tipo_auditoria:    form.tipoAuditoria,
        tipo_servico:      form.tipoServico,
        produtivo:         form.produtivo,
        nota,
        status:            st.label,
        respostas:         form.respostas,
        feedback:          form.feedback,
        observacoes:       form.observacoes,
        nome_eletricista:  form.nomeEletricista,
        assinatura_url:    assinaturaUrl,
        nome_eletricista2: form.nomeEletricista2 || null,
        assinatura2_url:   assinatura2Url,
        fotos_urls:        fotosUrls,
      })

      setSavedId(saved.id)
      setSaveStatus('saved')

      // ← NOVO: avisa o App que a auditoria foi salva (para concluir pauta)
      if (onAuditoriaSalva) onAuditoriaSalva(saved.id)

    } catch (err) {
      console.error('Erro ao salvar:', err)
      setSaveError(err.message || 'Erro ao salvar. Verifique a conexão.')
      setSaveStatus('error')
    }
  }

  return (
    <div>
      <div ref={printAreaRef} className="print-area"
        style={{ background: '#f0f4f8', padding: 16, borderRadius: 12 }}>

        {/* STATUS PRINCIPAL */}
        <div className="result-card" style={{ background: st.bg, borderColor: st.border }}>
          {eliminado && (
            <div style={{ fontSize: 11, background: '#dc2626', color: '#fff', padding: '3px 12px', borderRadius: 8, marginBottom: 10, display: 'inline-block', fontWeight: 700 }}>
              {msgEliminado}
            </div>
          )}
          <div style={{ fontSize: 50, marginBottom: 8 }}>{st.icon}</div>
          <div className="result-score" style={{ color: st.color }}>{nota.toFixed(0)}</div>
          <div style={{ fontSize: 13, color: st.color, fontWeight: 500 }}>pontos</div>
          <div className="result-label" style={{ color: st.color }}>{st.label}</div>
          <div style={{ fontSize: 12, color: st.color, marginTop: 6, opacity: 0.8 }}>
            {labelTipoAuditoria} — {CHECKLISTS[form.tipoServico]?.label} — {form.produtivo ? 'Produtivo' : 'Improdutivo'}
          </div>
        </div>

        {/* CONTADORES */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
          <StatCard label="Conformes"   value={sim}          color="#16a34a" />
          <StatCard label="Não conf."   value={nao}          color="#dc2626" />
          <StatCard label="Total itens" value={items.length} color="#2563eb" />
        </div>

        {/* POR CATEGORIA */}
        <div className="card">
          <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 12 }}>Por Categoria</p>
          {catStats.map(c => (
            <div key={c.cat} className="cat-bar">
              <div className="cat-bar-header">
                <span className={`badge ${CAT_META[c.cat].cls}`}>{CAT_META[c.cat].label}</span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{c.sim}/{c.total} — {c.pct}%</span>
              </div>
              <div className="cat-bar-track">
                <div className="cat-bar-fill" style={{ width: `${c.pct}%`, background: catBarColor(c.pct) }} />
              </div>
            </div>
          ))}
        </div>

        {/* DADOS */}
        <div className="card">
          <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>Dados da Auditoria</p>
          <InfoRow label="Tipo Auditoria" value={labelTipoAuditoria} />
          <InfoRow label="Fiscal"         value={form.fiscal} />
          <InfoRow label="Matrícula"      value={form.matricula} />
          <InfoRow label="Equipe"         value={form.prefixo} />
          <InfoRow label="OS"             value={form.os} />
          <InfoRow label="UC"             value={form.uc} />
          <InfoRow label="Endereço"       value={form.endereco} />
          <InfoRow label="Data / Hora"    value={`${form.data} às ${form.hora}`} />
          {form.lat              && <InfoRow label="GPS"           value={`${form.lat}, ${form.lng}`} />}
          {form.nomeEletricista  && <InfoRow label="Eletricista 1" value={form.nomeEletricista} />}
          {form.nomeEletricista2 && <InfoRow label="Eletricista 2" value={form.nomeEletricista2} />}
        </div>

        {/* NÃO CONFORMIDADES */}
        {ncItems.length > 0 && (
          <div className="card" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c', marginBottom: 10 }}>
              ❌ Itens Não Conformes ({ncItems.length})
            </p>
            {ncItems.map((item, i) => (
              <div key={item.id} style={{ fontSize: 12, color: '#991b1b', padding: '5px 0', borderBottom: i < ncItems.length - 1 ? '1px solid #fecaca' : 'none', lineHeight: 1.5 }}>
                <strong>{i + 1}.</strong> {item.p}
                {item.inverted && <span style={{ fontSize: 10, color: '#7c3aed', marginLeft: 6 }}>(invertida)</span>}
              </div>
            ))}
          </div>
        )}

        {/* FEEDBACK / OBS */}
        {(form.feedback || form.observacoes) && (
          <div className="card">
            {form.feedback && <>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>FEEDBACK DO FISCAL:</p>
              <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.5, marginBottom: form.observacoes ? 12 : 0 }}>{form.feedback}</p>
            </>}
            {form.observacoes && <>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>OBSERVAÇÕES:</p>
              <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>{form.observacoes}</p>
            </>}
          </div>
        )}

        {/* FOTOS */}
        {form.fotos.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
              Registro Fotográfico ({form.fotos.length})
            </p>
            <div className="photo-grid">
              {form.fotos.map((foto, i) => (
                <div key={i} className="photo-thumb">
                  <img src={foto.url} alt={`Foto ${i + 1}`} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 9, padding: '2px 4px', textAlign: 'center' }}>
                    Foto {i + 1}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ASSINATURA 1 */}
        {form.assinatura && (
          <div className="card">
            <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
              Assinatura — {form.nomeEletricista || 'Eletricista 1'}
            </p>
            <img src={form.assinatura} alt="Assinatura 1"
              style={{ width: '100%', borderRadius: 8, border: '1px solid #f1f5f9', background: '#fafafa' }} />
            <p style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', marginTop: 6 }}>
              Registrado em {form.data} às {form.hora}
            </p>
          </div>
        )}

        {/* ASSINATURA 2 */}
        {form.assinatura2 && (
          <div className="card">
            <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
              Assinatura — {form.nomeEletricista2 || 'Eletricista 2'}
            </p>
            <img src={form.assinatura2} alt="Assinatura 2"
              style={{ width: '100%', borderRadius: 8, border: '1px solid #f1f5f9', background: '#fafafa' }} />
            <p style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', marginTop: 6 }}>
              Registrado em {form.data} às {form.hora}
            </p>
          </div>
        )}

        {/* RODAPÉ */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, marginBottom: 8, textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: '#94a3b8' }}>DPL Construções — Contrato Equatorial Energia 1021/2024</p>
          <p style={{ fontSize: 10, color: '#cbd5e1', marginTop: 2 }}>
            Gerado em {new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })}
          </p>
        </div>

      </div>

      {/* AÇÕES */}
      <div className="no-print" style={{ marginBottom: 40, marginTop: 16 }}>

        {saveStatus === 'idle' && (
          <button className="btn-primary" onClick={salvar}
            style={{ background: '#1e3a5f', marginBottom: 10, fontSize: 16 }}>
            💾 Salvar Auditoria
          </button>
        )}

        {saveStatus === 'saving' && (
          <button className="btn-primary" disabled
            style={{ background: '#64748b', marginBottom: 10, fontSize: 16 }}>
            ⏳ Salvando no banco de dados...
          </button>
        )}

        {saveStatus === 'error' && (
          <>
            <div className="alert alert-danger" style={{ marginBottom: 10 }}>❌ {saveError}</div>
            <button className="btn-primary" onClick={salvar}
              style={{ background: '#dc2626', marginBottom: 10 }}>
              🔄 Tentar novamente
            </button>
            <button className="btn-secondary" onClick={() => setStep(2)} style={{ marginBottom: 10 }}>
              ← Voltar ao Checklist
            </button>
          </>
        )}

        {saveStatus === 'saved' && (
          <>
            <div style={{
              background: '#f0fdf4', border: '1px solid #86efac',
              borderRadius: 12, padding: '14px 16px', marginBottom: 14, textAlign: 'center',
            }}>
              <p style={{ color: '#15803d', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                ✅ Auditoria salva com sucesso!
              </p>
              <p style={{ color: '#64748b', fontSize: 11 }}>
                Dados e fotos enviados ao banco. Esta auditoria não pode mais ser alterada.
              </p>
            </div>

            <button className="btn-primary" onClick={gerarImagemWhatsApp} disabled={capturando}
              style={{ background: capturando ? '#64748b' : '#25d366', marginBottom: 10 }}>
              {capturando ? '⏳ Gerando imagem...' : '📸 Compartilhar no WhatsApp'}
            </button>

            <button className="btn-primary" onClick={() => window.print()}
              style={{ background: '#7c3aed', marginBottom: 10 }}>
              🖨️ Gerar PDF / Imprimir
            </button>

            <button className="btn-primary" onClick={nova} style={{ background: '#15803d' }}>
              + Iniciar Nova Auditoria
            </button>
          </>
        )}

      </div>
    </div>
  )
}
