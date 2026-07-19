import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { TIPOS_REGISTRO, MODALIDADES } from '../data/registros_config.js'
import { salvarRegistroBD, prepararPayload } from '../lib/registros.js'
import { salvarRegistroOffline } from '../lib/registros_offline.js'
import { compartilharImagemNativo, compartilharPDFNativo, renderizarHtmlParaCanvas } from '../lib/compartilhar.js'
import ModalLinkAssinatura from '../components/ModalLinkAssinatura.jsx'

export default function R6ResultadoReg({ form, onConcluir, prev, isOnline }) {
  const [status,          setStatus]          = useState('idle')
  const [erro,            setErro]            = useState('')
  const [capturando,      setCapturando]      = useState(false)
  const [gerandoPDF,      setGerandoPDF]      = useState(false)
  const [salvoOffline,    setSalvoOffline]    = useState(false)
  const [registroSalvoId, setRegistroSalvoId] = useState(null)
  const [mostrarModal,    setMostrarModal]    = useState(false)

  const tipoConfig = TIPOS_REGISTRO[form.tipo]
  const modConfig  = MODALIDADES[form.modalidade]
  const online     = isOnline !== undefined ? isOnline : navigator.onLine

  // ── Lista de prefixos únicos (vinda dos participantes) ──────────────────────
  // Usamos isso tanto no card da tela quanto na imagem WhatsApp e no PDF.
  const prefixosUnicos = [...new Set(
    (form.participantes || [])
      .map(p => p.prefixo?.trim())
      .filter(Boolean)
  )].sort()

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

  // ── Bloco de assinatura/status de cada participante na imagem WhatsApp ──────
  // Mostra a imagem da assinatura quando houver (online ou presencial).
  // Presencial sem assinatura → "Pendente". Online sem assinatura → "Aguardando via link".
  const blocoAssinatura = (p) => {
    if (p.assinatura) {
      return `<img src="${p.assinatura}" crossorigin="anonymous" style="height:48px;max-width:160px;object-fit:contain;background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:2px;" />`
    }
    if (p.modo === 'online') {
      return `<span style="font-size:14px;color:#1d4ed8;font-weight:900;background:#dbeafe;padding:5px 12px;border-radius:6px;border:1.5px solid #93c5fd;white-space:nowrap;">🔗 Aguardando</span>`
    }
    return `<span style="font-size:14px;color:#b45309;font-weight:900;background:#fef3c7;padding:5px 12px;border-radius:6px;border:1.5px solid #fcd34d;white-space:nowrap;">⚠️ Pendente</span>`
  }

  // ── HTML reutilizável: bloco de prefixos como chips (WhatsApp + PDF) ────────
  const blocoPrefixosHtml = (sizePx = 13) => {
    if (prefixosUnicos.length === 0) return ''
    return `
      <div style="background:#f0fdfa;border:2px solid #99f6e4;border-radius:16px;padding:16px 18px;margin-bottom:16px;">
        <p style="font-size:${sizePx + 4}px;font-weight:900;color:#0f766e;margin:0 0 12px 0;">
          🚧 Equipes / Prefixos (${prefixosUnicos.length})
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:7px;">
          ${prefixosUnicos.map(p => `
            <span style="font-size:${sizePx + 2}px;font-weight:900;color:#0f766e;background:#fff;border:2px solid #5eead4;padding:5px 12px;border-radius:6px;font-family:'Courier New',monospace;letter-spacing:0.5px;">
              ${p}
            </span>
          `).join('')}
        </div>
      </div>`
  }

  // ── Monta o resumo visual do registro como canvas (usado tanto pra
  // compartilhar como imagem quanto pra gerar o PDF nativo) ─────────────────
  const criarCanvasResumo = async () => {
      // Bloco de prefixos pré-gerado (mais robusto que chamar inline dentro do template)
      const htmlBlocoPrefixos = blocoPrefixosHtml(13)

      const infoRow = (label, value) => value ? `
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e2e8f0;">
          <span style="color:#475569;font-weight:800;font-size:17px;min-width:120px;flex-shrink:0;">${label}</span>
          <span style="color:#0f172a;font-weight:800;font-size:17px;text-align:right;flex:1;padding-left:10px;">${value}</span>
        </div>` : ''

      const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;background:#f0f4f8;padding:20px;box-sizing:border-box;width:520px;">

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
            <p style="font-size:17px;font-weight:900;color:#1e293b;margin:0 0 12px 0;">Dados do Registro</p>
            ${infoRow('Fiscal',       form.fiscal)}
            ${infoRow('Matrícula',    form.matricula_fiscal)}
            ${infoRow('Data / Hora',  `${form.data} às ${form.hora}`)}
            ${form.endereco      ? infoRow('Local',         form.endereco) : ''}
            ${form.lat           ? infoRow('GPS',           `${form.lat?.toFixed(5)}, ${form.lng?.toFixed(5)}`) : ''}
            ${form.tema          ? infoRow('Tema',           form.tema) : ''}
            ${form.carga_horaria ? infoRow('Carga Horária', form.carga_horaria) : ''}
          </div>

          ${htmlBlocoPrefixos}

          ${form.pauta ? `
          <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:18px;margin-bottom:16px;">
            <p style="font-size:17px;font-weight:900;color:#1e293b;margin:0 0 10px 0;">
              ${form.tipo === 'DISCIPLINAR' ? 'Descrição da Ocorrência' : 'Pauta / Conteúdo'}
            </p>
            <p style="font-size:16px;color:#1e293b;font-weight:500;line-height:1.6;margin:0;">${form.pauta}</p>
          </div>` : ''}

          ${form.observacoes ? `
          <div style="background:#fffbeb;border:2px solid #fcd34d;border-radius:16px;padding:18px;margin-bottom:16px;">
            <p style="font-size:14px;font-weight:900;color:#92400e;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:0.5px;">Observações:</p>
            <p style="font-size:17px;color:#1e293b;font-weight:600;line-height:1.6;margin:0;">${form.observacoes}</p>
          </div>` : ''}

          <!-- Lista de frequência — mostra imagem da assinatura ou status -->
          <div style="background:#f0fdf4;border:2px solid #86efac;border-radius:16px;padding:18px;margin-bottom:16px;">
            <p style="font-size:17px;font-weight:900;color:#15803d;margin:0 0 12px 0;">
              ✅ Lista de Frequência (${form.participantes.length})
            </p>
            ${form.participantes.map((p, i) => `
              <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 0;${i < form.participantes.length - 1 ? 'border-bottom:1px solid #bbf7d0;' : ''}">
                <div style="flex:1;min-width:0;">
                  <span style="font-size:17px;font-weight:900;color:#15803d;">${i+1}. ${p.nome}</span>
                  ${p.matricula ? `<span style="font-size:14px;color:#475569;font-weight:700;margin-left:8px;">Mat: ${p.matricula}</span>` : ''}
                  ${p.prefixo ? `<span style="font-size:13px;color:#0f766e;font-weight:900;background:#f0fdfa;border:1.5px solid #5eead4;padding:2px 8px;border-radius:5px;margin-left:6px;font-family:'Courier New',monospace;letter-spacing:0.3px;">${p.prefixo}</span>` : ''}
                </div>
                <div style="flex-shrink:0;text-align:right;">${blocoAssinatura(p)}</div>
              </div>`).join('')}
          </div>

          ${!salvoOffline && form.fotos.length > 0 ? `
          <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:16px 18px;margin-bottom:16px;">
            <p style="font-size:17px;font-weight:900;color:#1e293b;margin:0 0 12px 0;">
              📷 Fotos (${form.fotos.length})
            </p>
            <div style="display:grid;grid-template-columns:repeat(${Math.min(form.fotos.length, 3)},1fr);gap:8px;">
              ${form.fotos.map((f, i) => `
                <img src="${f.url}" crossorigin="anonymous"
                  style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;display:block;border:1px solid #e2e8f0;"
                  onerror="this.style.display='none'" />
              `).join('')}
            </div>
          </div>` : ''}

          ${salvoOffline ? `
          <div style="background:#fef3c7;border:2px solid #fcd34d;border-radius:16px;padding:14px 18px;margin-bottom:16px;text-align:center;">
            <p style="font-size:14px;color:#92400e;margin:0;font-weight:600;">
              ℹ️ Fotos serão enviadas ao banco quando a internet voltar
            </p>
          </div>` : ''}

          <div style="border-top:2px solid #e2e8f0;padding-top:14px;text-align:center;">
            <p style="font-size:13px;color:#64748b;margin:0;font-weight:700;">VérticeGP · Plataforma de Gestão Operacional</p>
            <p style="font-size:12px;color:#94a3b8;margin:4px 0 0 0;">
              Gerado em ${new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })}
            </p>
          </div>
        </div>`

      return renderizarHtmlParaCanvas(html, {
        largura: 520, escala: 6, aguardarImagens: true, esperaExtraMs: 80, exigirNaturalWidth: true,
      })
  }

  // ── Compartilhar no WhatsApp (imagem) ──────────────────────────────────────
  // No app Android nativo, a Web Share API com arquivo é inconsistente dentro
  // do WebView do Capacitor — usa a folha de compartilhamento nativa em vez
  // dela. Na web, mantém exatamente o comportamento de sempre.
  const gerarImagemWhatsApp = async () => {
    setCapturando(true)
    try {
      const canvas = await criarCanvasResumo()
      const nomeArq = `Registro_${form.tipo}_${form.data}.png`.replace(/\s+/g, '_')

      if (Capacitor.isNativePlatform()) {
        await compartilharImagemNativo(canvas, nomeArq, { titulo: tipoConfig?.label })
      } else if (navigator.share && navigator.canShare) {
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

  // ── HTML do relatório de impressão (tabela de frequência), sem o wrapper de
  // documento nem o botão — reaproveitado tanto no popup de impressão (web)
  // quanto na captura pra PDF nativo (Android).
  const montarConteudoImpressao = () => {
    const htmlBlocoPrefixosPdf = blocoPrefixosHtml(12)
    return `
    <div style="background:linear-gradient(135deg,#1e3a5f,#1d4ed8);color:#fff;padding:20px 24px;border-radius:14px;margin-bottom:16px;">
      <div style="font-size:11px;opacity:0.7;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">Plataforma de Gestão Operacional</div>
      <div style="font-size:20px;font-weight:800;">${tipoConfig?.emoji} ${tipoConfig?.label}</div>
      <div style="font-size:13px;opacity:0.8;margin-top:2px;">${modConfig?.label}</div>
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
    ${htmlBlocoPrefixosPdf}
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
          <th style="padding:8px 10px;color:#fff;font-size:12px;">Prefixo</th>
          <th style="padding:8px 10px;color:#fff;font-size:12px;">Assinatura / Status</th>
        </tr>
        ${form.participantes.map((p,i)=>`
          <tr style="border-bottom:1px solid #f1f5f9;${p.modo==='online'&&!p.assinatura?'background:#eff6ff;':''}">
            <td style="padding:8px 10px;font-size:13px;">${i+1}</td>
            <td style="padding:8px 10px;font-size:13px;font-weight:600;">
              ${p.nome}
              ${p.modo==='online'?'<span style="font-size:10px;color:#1d4ed8;background:#dbeafe;padding:1px 5px;border-radius:4px;margin-left:4px;">🔗 online</span>':''}
            </td>
            <td style="padding:8px 10px;font-size:13px;text-align:center;">${p.matricula||'—'}</td>
            <td style="padding:8px 10px;font-size:12px;text-align:center;font-family:'Courier New',monospace;color:#0f766e;font-weight:700;">${p.prefixo||'—'}</td>
            <td style="padding:4px 8px;">
              ${p.assinatura
                ? `<img src="${p.assinatura}" style="height:40px;max-width:120px;object-fit:contain;"/>`
                : p.modo === 'online'
                  ? '<span style="font-size:11px;color:#f59e0b;background:#fef3c7;padding:2px 8px;border-radius:4px;border:1px solid #fcd34d;">⏳ Aguardando assinatura online</span>'
                  : '<span style="font-size:11px;color:#d97706;background:#fef3c7;padding:2px 8px;border-radius:4px;border:1px solid #fcd34d;">⚠️ Pendente</span>'
              }
            </td>
          </tr>`).join('')}
      </table>
    </div>
    <div style="border-top:1px solid #e2e8f0;padding-top:14px;text-align:center;">
      <p style="font-size:11px;color:#94a3b8;">VérticeGP · Plataforma de Gestão Operacional</p>
      <p style="font-size:10px;color:#cbd5e1;margin-top:2px;">Gerado em ${new Date().toLocaleDateString('pt-BR',{dateStyle:'long'})}</p>
    </div>`
  }

  // Web: abre popup com o relatório e chama print() nele — igual sempre foi.
  const imprimirPDF = () => {
    const conteudo = montarConteudoImpressao()
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
    <title>${tipoConfig?.label}</title>
    <style>*{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4f8;padding:24px;color:#1e293b;}
    @media print{body{background:#fff;padding:0;}.no-print{display:none!important;}@page{margin:15mm;}}</style>
    </head><body>
    ${conteudo}
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

  // App Android nativo: window.open()/window.print() não funcionam dentro do
  // WebView — monta um PDF de verdade a partir do mesmo relatório e
  // compartilha via folha nativa do Android.
  const gerarPDF = async () => {
    if (!Capacitor.isNativePlatform()) { imprimirPDF(); return }
    setGerandoPDF(true)
    try {
      const conteudo = montarConteudoImpressao()
      const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;padding:24px;box-sizing:border-box;width:700px;color:#1e293b;">${conteudo}</div>`
      const canvas = await renderizarHtmlParaCanvas(html, {
        largura: 700, escala: 4, aguardarImagens: true, esperaExtraMs: 80, exigirNaturalWidth: true, corFundo: '#fff',
      })
      const nomeArq = `Registro_${form.tipo}_${form.data}.pdf`.replace(/\s+/g, '_')
      await compartilharPDFNativo(canvas, nomeArq, { titulo: tipoConfig?.label })
    } catch (err) {
      console.error('Erro ao gerar PDF:', err)
      alert('Não foi possível gerar o PDF. Tente novamente.')
    } finally {
      setGerandoPDF(false)
    }
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

      {/* ── Card de Prefixos (só aparece se houver) ──────────────────── */}
      {prefixosUnicos.length > 0 && (
        <div className="card" style={{
          marginBottom: 14,
          background: '#f0fdfa',
          border: '1.5px solid #99f6e4',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#0f766e', margin: 0 }}>
              🚧 Equipes / Prefixos
            </p>
            <span style={{
              fontSize: 11, fontWeight: 800, color: '#0f766e',
              background: '#fff', border: '1px solid #5eead4',
              padding: '2px 8px', borderRadius: 10,
            }}>
              {prefixosUnicos.length} {prefixosUnicos.length === 1 ? 'equipe' : 'equipes'}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {prefixosUnicos.map(p => (
              <span key={p} style={{
                fontSize: 12, fontWeight: 800, color: '#0f766e',
                background: '#fff', border: '1.5px solid #5eead4',
                padding: '4px 10px', borderRadius: 6,
                fontFamily: '"Courier New", monospace',
                letterSpacing: 0.3,
              }}>
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Lista de Frequência (nome + assinatura na tela) ─────────────── */}
      {form.participantes?.length > 0 && (
        <div className="card" style={{ marginBottom: 14, background: '#f0fdf4', border: '1.5px solid #86efac' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 10 }}>
            ✅ Lista de Frequência ({form.participantes.length})
          </p>
          {form.participantes.map((p, i) => {
            const pendentePresencial = p.modo === 'presencial' && !p.assinatura
            const nomeColor = p.modo === 'online' && !p.assinatura ? '#1d4ed8'
                            : pendentePresencial ? '#92400e' : '#15803d'
            return (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                padding: '9px 0',
                borderBottom: i < form.participantes.length - 1 ? '1px solid #bbf7d0' : 'none',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: nomeColor, margin: 0 }}>
                    {i + 1}. {p.nome}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                    {p.matricula && (
                      <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Mat: {p.matricula}</span>
                    )}
                    {p.prefixo && (
                      <span style={{
                        fontSize: 11, fontWeight: 800, color: '#0f766e',
                        background: '#f0fdfa', border: '1px solid #5eead4',
                        padding: '1px 7px', borderRadius: 5,
                        fontFamily: '"Courier New", monospace', letterSpacing: 0.3,
                      }}>{p.prefixo}</span>
                    )}
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {p.assinatura ? (
                    <img src={p.assinatura} alt="assinatura" style={{
                      height: 40, maxWidth: 100, objectFit: 'contain',
                      borderRadius: 6, background: '#fff', border: '1px solid #e2e8f0',
                    }} />
                  ) : p.modo === 'online' ? (
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: '#1d4ed8',
                      background: '#dbeafe', border: '1px solid #93c5fd',
                      padding: '4px 10px', borderRadius: 6, whiteSpace: 'nowrap',
                    }}>🔗 Aguardando</span>
                  ) : (
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: '#b45309',
                      background: '#fef3c7', border: '1px solid #fcd34d',
                      padding: '4px 10px', borderRadius: 6, whiteSpace: 'nowrap',
                    }}>⚠️ Pendente</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

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

      {form.observacoes && (
        <div className="card" style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>OBSERVAÇÕES:</p>
          <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
            {form.observacoes.length > 200 ? form.observacoes.slice(0, 200) + '...' : form.observacoes}
          </p>
        </div>
      )}

      {form.fotos?.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 10 }}>
            📷 FOTOS ({form.fotos.length})
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {form.fotos.map((f, i) => (
              <img key={i} src={f.url} alt={`Foto ${i+1}`}
                style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, display: 'block', border: '1px solid #e2e8f0' }} />
            ))}
          </div>
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

          <button onClick={() => setMostrarModal(true)} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#0f766e', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
            🔗 Gerar Link + QR Code para Assinatura
          </button>

          <button onClick={gerarPDF} disabled={gerandoPDF} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: gerandoPDF ? '#64748b' : '#7c3aed', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
            {gerandoPDF ? '⏳ Gerando PDF...' : '🖨️ Gerar PDF / Imprimir'}
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
