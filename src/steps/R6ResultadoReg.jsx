import { useState } from 'react'
import { TIPOS_REGISTRO, MODALIDADES } from '../data/registros_config.js'
import { salvarRegistroBD, prepararPayload } from '../lib/registros.js'
import { salvarRegistroOffline } from '../lib/registros_offline.js'
import ModalLinkAssinatura from '../components/ModalLinkAssinatura.jsx'

export default function R6ResultadoReg({ form, onConcluir, prev, isOnline }) {
  const [status,          setStatus]          = useState('idle')
  const [erro,            setErro]            = useState('')
  const [capturando,      setCapturando]      = useState(false)
  const [salvoOffline,    setSalvoOffline]    = useState(false)
  const [registroSalvoId, setRegistroSalvoId] = useState(null)
  const [mostrarModal,    setMostrarModal]    = useState(false)

  const tipoConfig = TIPOS_REGISTRO[form.tipo]
  const modConfig  = MODALIDADES[form.modalidade]
  const online     = isOnline !== undefined ? isOnline : navigator.onLine

  const TIPO_MEDIDA_LABEL = {
    FEEDBACK:            'Feedback',
    ADVERTENCIA_VERBAL:  'Advertência Verbal',
    ADVERTENCIA_ESCRITA: 'Advertência Escrita',
    SUSPENSAO:           'Suspensão',
  }

  const salvar = async () => {
    setStatus('saving')
    setErro('')
    if (!online) {
      try {
        await salvarRegistroOffline(form)
        setSalvoOffline(true)
        setStatus('saved')
      } catch (err) {
        setErro('Erro ao salvar offline: ' + err.message)
        setStatus('error')
      }
      return
    }
    try {
      const payload = await prepararPayload(form)
      const saved   = await salvarRegistroBD(payload)
      setSalvoOffline(false)
      setRegistroSalvoId(saved?.id || null)
      setStatus('saved')
    } catch (err) {
      console.error('Erro ao salvar registro:', err)
      setErro(err.message || 'Erro ao salvar. Verifique a conexão.')
      setStatus('error')
    }
  }

  // ── Status visual de cada participante ────────────────────────────────────
  // p.modo === 'ONLINE'     → aguardando assinatura via link
  // p.modo === 'PRESENCIAL' → já assinou (tem assinatura no pad)
  const statusParticipante = (p) => {
    if (p.modo === 'ONLINE') {
      return `<span style="font-size:13px;color:#2563eb;font-weight:700;">🔗 Aguardando (via link)</span>`
    }
    return `<span style="font-size:13px;color:#16a34a;font-weight:700;">✓ Assinado</span>`
  }

  const gerarImagemWhatsApp = async () => {
    setCapturando(true)
    try {
      const html2canvas = (await import('html2canvas')).default

      const infoRow = (label, value) => value ? `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9;">
          <span style="color:#94a3b8;font-weight:700;font-size:15px;min-width:120px;flex-shrink:0;">${label}</span>
          <span style="color:#1e293b;font-weight:700;font-size:15px;text-align:right;flex:1;padding-left:10px;">${value}</span>
        </div>` : ''

      const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4f8;padding:20px;box-sizing:border-box;width:520px;">

          ${salvoOffline ? `
          <div style="background:#fef3c7;border:2px solid #fcd34d;border-radius:12px;padding:10px 16px;margin-bottom:14px;font-size:14px;color:#92400e;font-weight:800;text-align:center;">
            📵 Salvo offline — será enviado ao banco quando a internet voltar
          </div>` : ''}

          <div style="background:${tipoConfig?.bg};border:3px solid ${tipoConfig?.border};border-radius:18px;padding:24px;text-align:center;margin-bottom:16px;">
            <div style="font-size:52px;margin-bottom:10px;">${tipoConfig?.emoji}</div>
            <div style="font-size:26px;font-weight:900;color:${tipoConfig?.color};margin-bottom:6px;">${tipoConfig?.label}</div>
            <div style="font-size:15px;color:${tipoConfig?.color};opacity:0.9;font-weight:600;">
              ${modConfig?.label} · ${form.participantes.length} participante(s)
            </div>
            ${form.tipo === 'DISCIPLINAR' && form.tipo_medida ? `
            <div style="margin-top:10px;background:${tipoConfig?.color};color:#fff;padding:6px 16px;border-radius:10px;display:inline-block;font-size:15px;font-weight:800;">
              ${TIPO_MEDIDA_LABEL[form.tipo_medida] || form.tipo_medida}
            </div>` : ''}
          </div>

          <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:18px;margin-bottom:16px;">
            <p style="font-size:15px;font-weight:800;color:#374151;margin:0 0 12px 0;">Dados do Registro</p>
            ${infoRow('Fiscal',       form.fiscal)}
            ${infoRow('Matrícula',    form.matricula_fiscal)}
            ${infoRow('Data / Hora',  `${form.data} às ${form.hora}`)}
            ${form.endereco      ? infoRow('Local',         form.endereco) : ''}
            ${form.lat           ? infoRow('GPS',           `${form.lat?.toFixed(5)}, ${form.lng?.toFixed(5)}`) : ''}
            ${form.tema          ? infoRow('Tema',           form.tema) : ''}
            ${form.carga_horaria ? infoRow('Carga Horária', form.carga_horaria) : ''}
          </div>

          ${form.pauta ? `
          <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:18px;margin-bottom:16px;">
            <p style="font-size:15px;font-weight:800;color:#374151;margin:0 0 10px 0;">
              ${form.tipo === 'DISCIPLINAR' ? 'Descrição da Ocorrência' : 'Pauta / Conteúdo'}
            </p>
            <p style="font-size:15px;color:#475569;line-height:1.6;margin:0;">${form.pauta}</p>
          </div>` : ''}

          <!-- Lista de frequência — status real por p.modo -->
          <div style="background:#f0fdf4;border:2px solid #86efac;border-radius:16px;padding:18px;margin-bottom:16px;">
            <p style="font-size:15px;font-weight:800;color:#15803d;margin:0 0 12px 0;">
              ✅ Lista de Frequência (${form.participantes.length})
            </p>
            ${form.participantes.map((p, i) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;${i < form.participantes.length - 1 ? 'border-bottom:1px solid #bbf7d0;' : ''}">
                <div>
                  <span style="font-size:15px;font-weight:800;color:#15803d;">${i+1}. ${p.nome}</span>
                  ${p.matricula ? `<span style="font-size:13px;color:#64748b;margin-left:8px;">Mat: ${p.matricula}</span>` : ''}
                </div>
                ${statusParticipante(p)}
              </div>`).join('')}
          </div>

          ${!salvoOffline && form.fotos.length > 0 ? `
          <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:14px 18px;margin-bottom:16px;">
            <p style="font-size:15px;color:#64748b;text-align:center;margin:0;font-weight:600;">
              📷 ${form.fotos.length} foto(s) de evidência registradas
            </p>
          </div>` : ''}

          ${salvoOffline ? `
          <div style="background:#fef3c7;border:2px solid #fcd34d;border-radius:16px;padding:14px 18px;margin-bottom:16px;text-align:center;">
            <p style="font-size:14px;color:#92400e;margin:0;font-weight:600;">
              ℹ️ Fotos serão enviadas ao banco quando a internet voltar
            </p>
          </div>` : ''}

          <div style="border-top:2px solid #e2e8f0;padding-top:14px;text-align:center;">
            <p style="font-size:13px;color:#94a3b8;margin:0;font-weight:600;">DPL Construções — Contrato Equatorial Energia 1021/2024</p>
            <p style="font-size:12px;color:#cbd5e1;margin:4px 0 0 0;">
              Gerado em ${new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })}
            </p>
          </div>
        </div>`

      const div = document.createElement('div')
      div.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;'
      div.innerHTML = html
      document.body.appendChild(div)

      const canvas = await html2canvas(div.firstElementChild, {
        scale:           5,
        useCORS:         true,
        allowTaint:      true,
        backgroundColor: '#f0f4f8',
        logging:         false,
        windowWidth:     520,
      })
      document.body.removeChild(div)

      const nomeArq = `Registro_${form.tipo}_${form.data}.png`.replace(/\s+/g, '_')
      if (navigator.share && navigator.canShare) {
        canvas.toBlob(async blob => {
          const file = new File([blob], nomeArq, { type: 'image/png' })
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: tipoConfig?.label })
          } else {
            const link = document.createElement('a')
            link.download = nomeArq; link.href = canvas.toDataURL('image/png'); link.click()
          }
        }, 'image/png')
      } else {
        const link = document.createElement('a')
        link.download = nomeArq; link.href = canvas.toDataURL('image/png'); link.click()
      }
    } catch {
      alert('Não foi possível gerar a imagem.')
    } finally {
      setCapturando(false)
    }
  }

  const imprimirPDF = () => {
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
    <title>${tipoConfig?.label}</title>
    <style>*{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4f8;padding:24px;color:#1e293b;}
    @media print{body{background:#fff;padding:0;}.no-print{display:none!important;}@page{margin:15mm;}}</style>
    </head><body>
    <div style="background:linear-gradient(135deg,#1e3a5f,#1d4ed8);color:#fff;padding:20px 24px;border-radius:14px;margin-bottom:16px;">
      <div style="font-size:11px;opacity:0.7;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">DPL Construções — Equatorial Energia</div>
      <div style="font-size:20px;font-weight:800;">${tipoConfig?.emoji} ${tipoConfig?.label}</div>
      <div style="font-size:13px;opacity:0.8;margin-top:2px;">${modConfig?.label} · Contrato 1021/2024</div>
    </div>
    ${form.tipo === 'DISCIPLINAR' && form.tipo_medida
      ? `<div style="background:${tipoConfig?.bg};border:2px solid ${tipoConfig?.color};border-radius:12px;padding:12px 16px;margin-bottom:16px;text-align:center;">
          <span style="font-size:16px;font-weight:800;color:${tipoConfig?.color};">${TIPO_MEDIDA_LABEL[form.tipo_medida]}</span>
         </div>` : ''}
    <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:4px 0;margin-bottom:16px;">
      <table style="width:100%;border-collapse:collapse;">
        ${[['Fiscal',form.fiscal],['Matrícula',form.matricula_fiscal],['Data/Hora',`${form.data} às ${form.hora}`],
           ['Local',form.endereco],['GPS',form.lat?`${form.lat?.toFixed(5)}, ${form.lng?.toFixed(5)}`:null],
           ['Tema',form.tema],['Carga Horária',form.carga_horaria]]
          .filter(([,v])=>v)
          .map(([l,v])=>`<tr><td style="padding:8px 12px;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;width:140px;">${l}</td><td style="padding:8px 12px;color:#1e293b;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">${v}</td></tr>`)
          .join('')}
      </table>
    </div>
    ${form.pauta ? `
    <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px;">
      <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;">${form.tipo==='DISCIPLINAR'?'Descrição da Ocorrência':'Pauta / Conteúdo'}</div>
      <div style="font-size:13px;color:#475569;line-height:1.7;">${form.pauta}</div>
    </div>` : ''}
    <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;margin-bottom:16px;">
      <div style="padding:12px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;font-weight:700;color:#374151;">
        LISTA DE FREQUÊNCIA (${form.participantes.length})
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="background:#1e3a5f;">
          <th style="padding:8px 10px;color:#fff;font-size:12px;text-align:left;width:30px;">Nº</th>
          <th style="padding:8px 10px;color:#fff;font-size:12px;text-align:left;">Nome</th>
          <th style="padding:8px 10px;color:#fff;font-size:12px;">Matrícula</th>
          <th style="padding:8px 10px;color:#fff;font-size:12px;">Assinatura / Status</th>
        </tr>
        ${form.participantes.map((p,i)=>`
          <tr style="border-bottom:1px solid #f1f5f9;${p.modo==='ONLINE'?'background:#eff6ff;':''}">
            <td style="padding:8px 10px;font-size:13px;">${i+1}</td>
            <td style="padding:8px 10px;font-size:13px;font-weight:600;">
              ${p.nome}
              ${p.modo==='ONLINE'?'<span style="font-size:10px;color:#1d4ed8;background:#dbeafe;padding:1px 5px;border-radius:4px;margin-left:4px;">🔗 online</span>':''}
            </td>
            <td style="padding:8px 10px;font-size:13px;text-align:center;">${p.matricula||'—'}</td>
            <td style="padding:4px 8px;">
              ${p.modo === 'ONLINE'
                ? '<span style="font-size:11px;color:#f59e0b;background:#fef3c7;padding:2px 8px;border-radius:4px;border:1px solid #fcd34d;">⏳ Aguardando assinatura online</span>'
                : p.assinatura
                  ? `<img src="${p.assinatura}" style="height:40px;max-width:120px;object-fit:contain;"/>`
                  : '<span style="font-size:11px;color:#94a3b8;">—</span>'
              }
            </td>
          </tr>`).join('')}
      </table>
    </div>
    <div style="border-top:1px solid #e2e8f0;padding-top:14px;text-align:center;">
      <p style="font-size:11px;color:#94a3b8;">DPL Construções — Contrato Equatorial Energia 1021/2024</p>
      <p style="font-size:10px;color:#cbd5e1;margin-top:2px;">Gerado em ${new Date().toLocaleDateString('pt-BR',{dateStyle:'long'})}</p>
    </div>
    <div class="no-print" style="text-align:center;margin-top:24px;">
      <button onclick="window.print()" style="padding:12px 32px;background:#1e3a5f;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;">🖨️ Imprimir / Salvar PDF</button>
    </div>
    </body></html>`

    const janela = window.open('', '_blank', 'width=700,height=900')
    if (!janela) { alert('Permita pop-ups.'); return }
    janela.document.write(html)
    janela.document.close()
    janela.onload = () => setTimeout(() => janela.print(), 600)
  }

  return (
    <>
    <div style={{ padding: '0 0 40px' }}>

      {!online && (
        <div style={{ background: '#fef3c7', border: '1.5px solid #f59e0b', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#92400e', fontWeight: 700 }}>
          📵 Sem internet — o registro será salvo localmente e enviado ao banco quando a conexão voltar.
        </div>
      )}

      <div style={{ background: tipoConfig?.bg, border: `2px solid ${tipoConfig?.border}`, borderRadius: 16, padding: 20, textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>{tipoConfig?.emoji}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: tipoConfig?.color, marginBottom: 4 }}>{tipoConfig?.label}</div>
        <div style={{ fontSize: 13, color: tipoConfig?.color, opacity: 0.85 }}>
          {modConfig?.label} · {form.participantes.length} participante(s)
        </div>
        {form.tipo === 'DISCIPLINAR' && form.tipo_medida && (
          <div style={{ marginTop: 8, background: tipoConfig?.color, color: '#fff', padding: '4px 14px', borderRadius: 8, display: 'inline-block', fontSize: 13, fontWeight: 700 }}>
            {TIPO_MEDIDA_LABEL[form.tipo_medida]}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>Resumo</p>
        {[
          ['Fiscal',        form.fiscal],
          ['Data/Hora',     `${form.data} às ${form.hora}`],
          ['Local',         form.endereco],
          ['Participantes', `${form.participantes.length}`],
          ['Fotos',         form.fotos.length > 0 ? `${form.fotos.length} foto(s)` : null],
          ['Lista impressa', form.lista_impressa ? 'Anexada' : null],
        ].filter(([, v]) => v).map(([l, v]) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
            <span style={{ color: '#94a3b8', fontWeight: 500 }}>{l}</span>
            <span style={{ color: '#1e293b', fontWeight: 600 }}>{v}</span>
          </div>
        ))}
      </div>

      {form.pauta && (
        <div className="card" style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
            {form.tipo === 'DISCIPLINAR' ? 'DESCRIÇÃO:' : 'PAUTA:'}
          </p>
          <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
            {form.pauta.length > 200 ? form.pauta.slice(0, 200) + '...' : form.pauta}
          </p>
        </div>
      )}

      {status === 'idle' && (
        <>
          <button onClick={salvar} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: online ? '#1e3a5f' : '#dc2626', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
            {online ? '💾 Salvar Registro' : '📵 Salvar Offline'}
          </button>
          <button onClick={prev} style={{ width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>← Voltar e editar</button>
        </>
      )}

      {status === 'saving' && (
        <button disabled style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#64748b', color: '#fff', fontSize: 16, fontWeight: 700 }}>
          ⏳ {online ? 'Salvando...' : 'Salvando localmente...'}
        </button>
      )}

      {status === 'error' && (
        <>
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px', marginBottom: 10, fontSize: 13, color: '#b91c1c' }}>❌ {erro}</div>
          <button onClick={salvar} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#dc2626', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>🔄 Tentar novamente</button>
          <button onClick={prev} style={{ width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>← Voltar</button>
        </>
      )}

      {status === 'saved' && (
        <>
          <div style={{ background: salvoOffline ? '#fef3c7' : '#f0fdf4', border: `1px solid ${salvoOffline ? '#fcd34d' : '#86efac'}`, borderRadius: 12, padding: '14px 16px', marginBottom: 14, textAlign: 'center' }}>
            <p style={{ color: salvoOffline ? '#92400e' : '#15803d', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
              {salvoOffline ? '📵 Registro salvo localmente!' : '✅ Registro salvo com sucesso!'}
            </p>
            <p style={{ color: '#64748b', fontSize: 12 }}>
              {salvoOffline
                ? 'Quando a internet voltar, será enviado automaticamente ao banco com todas as fotos e assinaturas.'
                : 'Dados, fotos e assinaturas enviados ao banco.'}
            </p>
            {salvoOffline && <p style={{ color: '#92400e', fontSize: 11, marginTop: 6, fontStyle: 'italic' }}>ℹ️ No modo offline, a imagem compartilhada não incluirá as fotos.</p>}
          </div>

          <button onClick={gerarImagemWhatsApp} disabled={capturando} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: capturando ? '#64748b' : '#25d366', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
            {capturando ? '⏳ Gerando...' : '📸 Compartilhar no WhatsApp'}
          </button>

          {/* FIX A: passa tipoLabel para o modal */}
          <button onClick={() => setMostrarModal(true)} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#0f766e', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
            🔗 Gerar Link + QR Code para Assinatura
          </button>

          <button onClick={imprimirPDF} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#7c3aed', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
            🖨️ Gerar PDF / Imprimir
          </button>

          <button onClick={onConcluir} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#15803d', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            + Novo Registro
          </button>
        </>
      )}
    </div>

    {mostrarModal && registroSalvoId && (
      <ModalLinkAssinatura
        registroId={registroSalvoId}
        tipoLabel={tipoConfig?.label}
        onFechar={() => setMostrarModal(false)}
      />
    )}
    </>
  )
}
