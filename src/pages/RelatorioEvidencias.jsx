import { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { listarRegistros } from '../lib/registros.js'
import { TIPOS_REGISTRO, MODALIDADES } from '../data/registros_config.js'
import { renderizarHtmlParaCanvas, compartilharPDFMultiplasPaginasNativo } from '../lib/compartilhar.js'

function calcMesAtual() {
  const hoje = new Date()
  return {
    ini: new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0],
    fim: new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0],
  }
}

const TIPO_MEDIDA_LABEL = {
  FEEDBACK:            'Feedback',
  ADVERTENCIA_VERBAL:  'Advertência Verbal',
  ADVERTENCIA_ESCRITA: 'Advertência Escrita',
  SUSPENSAO:           'Suspensão',
}

const formatDataSlide = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

// ── HTML de um slide individual (reaproveitado na apresentação web e no PDF nativo) ──
function montarSlideHtml(r, idx, total) {
    const formatData = formatDataSlide
    const tc    = TIPOS_REGISTRO[r.tipo] || {}
    const mc    = MODALIDADES[r.modalidade] || {}
    const fotos = Array.isArray(r.fotos_urls) ? r.fotos_urls : []
    const parts = Array.isArray(r.participantes) ? r.participantes : []

    // Layout de fotos: 1 foto = full width, 2 = metade cada, 3+ = grid
    const fotoGrid = fotos.length === 0 ? '' :
      fotos.length === 1 ? `
        <div style="flex:1;min-height:0;overflow:hidden;border-radius:10px;">
          <img src="${fotos[0]}" crossorigin="anonymous"
            style="width:100%;height:100%;object-fit:cover;display:block;border-radius:10px;"/>
        </div>` :
      fotos.length === 2 ? `
        <div style="flex:1;display:flex;gap:8px;min-height:0;">
          ${fotos.map(url => `
            <div style="flex:1;overflow:hidden;border-radius:10px;">
              <img src="${url}" crossorigin="anonymous" style="width:100%;height:100%;object-fit:cover;display:block;"/>
            </div>`).join('')}
        </div>` :
      `<div style="flex:1;display:grid;grid-template-columns:repeat(${Math.min(fotos.length, 3)},1fr);gap:8px;min-height:0;">
        ${fotos.slice(0, 6).map(url => `
          <div style="overflow:hidden;border-radius:8px;">
            <img src="${url}" crossorigin="anonymous" style="width:100%;height:100%;object-fit:cover;display:block;"/>
          </div>`).join('')}
      </div>`

    const nomesParticipantes = parts.map(p => p.nome).join(' · ')

    return `
      <div class="slide" style="
        width:960px; height:540px;
        background:#fff;
        border-radius:16px;
        overflow:hidden;
        display:flex;
        flex-direction:column;
        box-shadow:0 4px 32px rgba(0,0,0,0.18);
        margin-bottom:40px;
        page-break-inside:avoid;
        break-inside:avoid;
      ">
        <!-- Header colorido -->
        <div style="
          background:${tc.color || '#1e3a5f'};
          color:#fff;
          padding:14px 20px;
          display:flex;
          justify-content:space-between;
          align-items:center;
          flex-shrink:0;
        ">
          <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-size:28px;">${tc.emoji || '📝'}</span>
            <div>
              <div style="font-size:18px;font-weight:800;line-height:1.1;">${tc.label || r.tipo}</div>
              <div style="font-size:12px;opacity:0.85;margin-top:2px;">
                ${mc.label || r.modalidade}
                ${r.tipo_medida ? ` · ${TIPO_MEDIDA_LABEL[r.tipo_medida] || r.tipo_medida}` : ''}
              </div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:16px;font-weight:700;">${formatData(r.data_registro)}</div>
            <div style="font-size:12px;opacity:0.85;">${r.hora_registro || ''}</div>
          </div>
        </div>

        <!-- Conteúdo principal -->
        <div style="flex:1;display:flex;gap:0;min-height:0;overflow:hidden;">

          <!-- Coluna esquerda: fotos -->
          <div style="flex:${fotos.length > 0 ? '3' : '0'};display:flex;flex-direction:column;padding:${fotos.length > 0 ? '12px' : '0'};min-height:0;background:#f8fafc;">
            ${fotoGrid}
            ${fotos.length === 0 ? '' : `
              <div style="font-size:10px;color:#94a3b8;text-align:center;margin-top:4px;flex-shrink:0;">
                ${fotos.length} foto(s) de evidência
              </div>`}
          </div>

          <!-- Coluna direita: dados -->
          <div style="flex:2;display:flex;flex-direction:column;padding:14px 16px;border-left:1px solid #f1f5f9;overflow:hidden;">

            <!-- Fiscal -->
            <div style="margin-bottom:10px;flex-shrink:0;">
              <div style="font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:2px;">Fiscal Responsável</div>
              <div style="font-size:13px;font-weight:700;color:#1e293b;">${r.fiscal || '—'}</div>
              ${r.matricula_fiscal ? `<div style="font-size:11px;color:#64748b;">Mat: ${r.matricula_fiscal}</div>` : ''}
              ${r.endereco ? `<div style="font-size:11px;color:#64748b;margin-top:2px;">📍 ${r.endereco}</div>` : ''}
            </div>

            <!-- Pauta -->
            ${r.pauta ? `
            <div style="margin-bottom:10px;flex-shrink:0;">
              <div style="font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;">
                ${r.tipo === 'DISCIPLINAR' ? 'Ocorrência' : r.tipo === 'DS' ? 'Tópico de Segurança' : 'Pauta / Conteúdo'}
              </div>
              <div style="font-size:12px;color:#374151;line-height:1.5;max-height:90px;overflow:hidden;
                display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;">
                ${r.pauta}
              </div>
            </div>` : ''}

            <!-- Participantes -->
            ${parts.length > 0 ? `
            <div style="flex:1;overflow:hidden;">
              <div style="font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">
                Participantes (${parts.length})
              </div>
              <div style="display:flex;flex-direction:column;gap:4px;max-height:140px;overflow:hidden;">
                ${parts.slice(0, 6).map((p, i) => `
                  <div style="display:flex;justify-content:space-between;align-items:center;
                    background:#f0fdf4;border-radius:6px;padding:4px 8px;">
                    <div>
                      <span style="font-size:11px;font-weight:700;color:#15803d;">${i+1}. ${p.nome}</span>
                      ${p.matricula ? `<span style="font-size:10px;color:#64748b;margin-left:6px;">${p.matricula}</span>` : ''}
                    </div>
                    ${p.assinatura_url
                      ? `<img src="${p.assinatura_url}" crossorigin="anonymous" style="height:24px;max-width:60px;object-fit:contain;"/>`
                      : '<span style="font-size:9px;color:#94a3b8;">sem assinatura</span>'
                    }
                  </div>`).join('')}
                ${parts.length > 6 ? `
                  <div style="font-size:10px;color:#94a3b8;text-align:center;padding:4px;">
                    + ${parts.length - 6} participante(s) adicionais
                  </div>` : ''}
              </div>
            </div>` : ''}

          </div>
        </div>

        <!-- Footer -->
        <div style="
          background:#f8fafc;border-top:1px solid #f1f5f9;
          padding:6px 16px;
          display:flex;justify-content:space-between;align-items:center;
          flex-shrink:0;
        ">
          <span style="font-size:10px;color:#94a3b8;">DPL Construções — Equatorial Energia · Contrato 1021/2024</span>
          <span style="font-size:10px;color:#94a3b8;">Registro ${idx + 1} de ${total}</span>
        </div>
      </div>`
}

// ── Gera o HTML de apresentação (todos os slides, pra impressão web) ─────────
function gerarHTMLApresentacao(registros, titulo) {
  const slides = registros.map((r, idx) => montarSlideHtml(r, idx, registros.length)).join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>${titulo}</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #1e3a5f;
      padding: 40px 24px;
      min-height: 100vh;
    }
    .capa {
      width: 960px;
      margin: 0 auto 40px;
      text-align: center;
      color: #fff;
    }
    .container { width: 960px; margin: 0 auto; }
    .slide img { transition: opacity 0.3s; }

    @media print {
      body { background: #fff; padding: 10px; }
      .capa { color: #1e293b; }
      .no-print { display: none !important; }
      @page { margin: 10mm; size: landscape; }
    }
  </style>
</head>
<body>
  <!-- Capa -->
  <div class="capa">
    <div style="font-size:48px;margin-bottom:12px;">📊</div>
    <h1 style="font-size:28px;font-weight:900;margin-bottom:8px;">${titulo}</h1>
    <p style="font-size:14px;opacity:0.75;margin-bottom:4px;">DPL Construções — Equatorial Energia · Contrato 1021/2024</p>
    <p style="font-size:13px;opacity:0.6;">${registros.length} registro(s) · Gerado em ${new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })}</p>

    <!-- Resumo por tipo -->
    <div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin-top:24px;margin-bottom:8px;">
      ${Object.entries(TIPOS_REGISTRO).map(([k, t]) => {
        const qtd = registros.filter(r => r.tipo === k).length
        if (qtd === 0) return ''
        return `<div style="background:rgba(255,255,255,0.15);border-radius:10px;padding:8px 16px;text-align:center;">
          <div style="font-size:20px;">${t.emoji}</div>
          <div style="font-size:18px;font-weight:800;">${qtd}</div>
          <div style="font-size:10px;opacity:0.8;">${t.label}</div>
        </div>`
      }).join('')}
    </div>
  </div>

  <!-- Slides -->
  <div class="container">
    ${slides}
  </div>

  <!-- Botões (sem impressão) -->
  <div class="no-print" style="text-align:center;padding:32px;display:flex;gap:16px;justify-content:center;flex-wrap:wrap;">
    <button onclick="window.print()" style="
      padding:14px 32px;background:#fff;color:#1e3a5f;
      border:none;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer;
    ">🖨️ Exportar PDF (orientação paisagem)</button>
    <button onclick="window.close()" style="
      padding:14px 24px;background:rgba(255,255,255,0.2);color:#fff;
      border:2px solid rgba(255,255,255,0.4);border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;
    ">✕ Fechar</button>
  </div>
</body>
</html>`
}

// App Android nativo: window.open()/window.print() não funcionam dentro do
// WebView — gera um PDF de verdade com um slide (960x540, paisagem) por
// página e compartilha via folha nativa do Android. Renderiza cada slide
// separadamente pra virar uma página própria no PDF final.
async function gerarPDFEvidenciasNativo(registros, titulo) {
  const canvases = []
  for (let i = 0; i < registros.length; i++) {
    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${montarSlideHtml(registros[i], i, registros.length)}</div>`
    const canvas = await renderizarHtmlParaCanvas(html, {
      largura: 960, escala: 2.5, aguardarImagens: true, esperaExtraMs: 60, exigirNaturalWidth: true, corFundo: '#fff',
    })
    canvases.push(canvas)
  }
  const nomeArq = `Evidencias_${titulo}.pdf`.replace(/\s+/g, '_')
  await compartilharPDFMultiplasPaginasNativo(canvases, nomeArq, { titulo })
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function RelatorioEvidencias({ usuarioLogado, onVoltar }) {
  const [registros,  setRegistros]  = useState([])
  const [loading,    setLoading]    = useState(false)
  const [gerado,     setGerado]     = useState(false)
  const [gerandoPDF, setGerandoPDF] = useState(false)
  const [filtros,    setFiltros]    = useState({
    dataIni: calcMesAtual().ini,
    dataFim: calcMesAtual().fim,
    tipo:    '',
  })

  const upd = (k, v) => setFiltros(f => ({ ...f, [k]: v }))

  const buscar = async () => {
    setLoading(true)
    setGerado(false)
    try {
      const data = await listarRegistros(filtros, usuarioLogado)
      // Apenas registros com pelo menos 1 foto
      const comFoto = data.filter(r => Array.isArray(r.fotos_urls) && r.fotos_urls.length > 0)
      setRegistros(comFoto)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const gerar = async () => {
    const mesLabel = new Date(filtros.dataIni + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    const tipoLabel = filtros.tipo ? (TIPOS_REGISTRO[filtros.tipo]?.label || '') : 'Todos os tipos'
    const titulo = `Evidências — ${tipoLabel} · ${mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1)}`

    if (Capacitor.isNativePlatform()) {
      setGerandoPDF(true)
      try {
        await gerarPDFEvidenciasNativo(registros, titulo)
        setGerado(true)
      } catch (err) {
        console.error('Erro ao gerar PDF:', err)
        alert('Não foi possível gerar o PDF. Tente novamente.')
      } finally {
        setGerandoPDF(false)
      }
      return
    }

    const janela = window.open('', '_blank', 'width=1100,height=800')
    if (!janela) { alert('Permita pop-ups para gerar o relatório.'); return }
    janela.document.write(gerarHTMLApresentacao(registros, titulo))
    janela.document.close()
    setGerado(true)
  }

  // Preview dos cards de registros
  const totalFotos = registros.reduce((acc, r) => acc + (r.fotos_urls?.length || 0), 0)

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', padding: '18px 20px', color: '#fff' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14,
          }}>← Voltar</button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
            <span style={{ fontSize: 36 }}>📊</span>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800 }}>Relatório de Evidências</h1>
              <p style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}>
                Gera slides prontos para usar em apresentações PowerPoint / PDF
              </p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 16px 80px' }}>

        {/* Como funciona */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, marginBottom: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 }}>💡 Como funciona</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['1️⃣', 'Selecione o período e tipo de registro'],
              ['2️⃣', 'Clique em "Buscar" para carregar os registros com fotos'],
              ['3️⃣', 'Clique em "Gerar Apresentação" — abre uma janela com slides formatados'],
              ['4️⃣', 'Na janela, clique "Exportar PDF" — salva em orientação paisagem'],
              ['5️⃣', 'Insira as páginas do PDF no PowerPoint como imagens de fundo'],
            ].map(([num, txt]) => (
              <div key={num} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{num}</span>
                <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>{txt}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Filtros */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16, marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 14 }}>Filtros</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Data início</label>
              <input type="date" value={filtros.dataIni} onChange={e => upd('dataIni', e.target.value)}
                className="form-input" style={{ fontSize: 13, padding: '9px 10px' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Data fim</label>
              <input type="date" value={filtros.dataFim} onChange={e => upd('dataFim', e.target.value)}
                className="form-input" style={{ fontSize: 13, padding: '9px 10px' }} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Tipo de Registro</label>
            <select value={filtros.tipo} onChange={e => upd('tipo', e.target.value)}
              className="form-input" style={{ fontSize: 13, padding: '9px 10px' }}>
              <option value="">Todos os tipos</option>
              {Object.entries(TIPOS_REGISTRO).map(([k, t]) => (
                <option key={k} value={k}>{t.emoji} {t.label}</option>
              ))}
            </select>
          </div>

          <button onClick={buscar} disabled={loading} style={{
            width: '100%', padding: 13, borderRadius: 12, border: 'none',
            background: loading ? '#64748b' : '#1e3a5f',
            color: '#fff', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
          }}>
            {loading ? '⏳ Buscando...' : '🔍 Buscar Registros'}
          </button>
        </div>

        {/* Preview dos resultados */}
        {!loading && registros.length > 0 && (
          <>
            {/* Resumo */}
            <div style={{
              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              borderRadius: 14, padding: '16px 20px', marginBottom: 16, color: '#fff',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 800 }}>✅ {registros.length} slide(s) prontos</p>
                  <p style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{totalFotos} foto(s) de evidência no total</p>
                </div>
                <button onClick={gerar} disabled={gerandoPDF} style={{
                  background: '#fff', color: '#7c3aed', border: 'none',
                  padding: '12px 20px', borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: gerandoPDF ? 'not-allowed' : 'pointer',
                }}>
                  {gerandoPDF ? '⏳ Gerando PDF...' : '🎯 Gerar Apresentação'}
                </button>
              </div>

              {/* Contagem por tipo */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {Object.entries(TIPOS_REGISTRO).map(([k, t]) => {
                  const qtd = registros.filter(r => r.tipo === k).length
                  if (qtd === 0) return null
                  return (
                    <div key={k} style={{
                      background: 'rgba(255,255,255,0.18)', borderRadius: 8,
                      padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span style={{ fontSize: 14 }}>{t.emoji}</span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{qtd}</span>
                      <span style={{ fontSize: 11, opacity: 0.85 }}>{t.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Aviso de geração */}
            {gerado && (
              <div style={{
                background: '#f0fdf4', border: '1.5px solid #86efac',
                borderRadius: 12, padding: '12px 16px', marginBottom: 16,
                fontSize: 13, color: '#15803d', fontWeight: 600, textAlign: 'center',
              }}>
                {Capacitor.isNativePlatform()
                  ? '✅ PDF gerado! Escolha onde salvar ou compartilhar na folha que abriu.'
                  : '✅ Apresentação gerada! Salve como PDF na janela aberta e insira no PowerPoint.'}
              </div>
            )}

            {/* Preview mini dos slides */}
            <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 10, textTransform: 'uppercase' }}>
              Preview dos slides
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {registros.map((r, i) => {
                const tc    = TIPOS_REGISTRO[r.tipo] || {}
                const fotos = r.fotos_urls || []
                const parts = r.participantes || []
                return (
                  <div key={r.id} style={{
                    background: '#fff', borderRadius: 12,
                    border: `1.5px solid ${tc.border || '#e2e8f0'}`,
                    overflow: 'hidden',
                  }}>
                    {/* Mini header */}
                    <div style={{
                      background: tc.color, color: '#fff',
                      padding: '8px 14px',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>
                        {tc.emoji} Slide {i + 1} — {tc.label}
                        {r.tipo_medida ? ` · ${TIPO_MEDIDA_LABEL[r.tipo_medida]}` : ''}
                      </span>
                      <span style={{ fontSize: 11, opacity: 0.85 }}>
                        {new Date(r.data_registro + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </span>
                    </div>

                    {/* Mini conteúdo */}
                    <div style={{ padding: '10px 14px', display: 'flex', gap: 12 }}>
                      {/* Mini fotos */}
                      {fotos.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          {fotos.slice(0, 3).map((url, fi) => (
                            <img key={fi} src={url} alt="" style={{
                              width: 48, height: 48, objectFit: 'cover',
                              borderRadius: 6, border: '1px solid #e2e8f0',
                            }} />
                          ))}
                          {fotos.length > 3 && (
                            <div style={{
                              width: 48, height: 48, borderRadius: 6,
                              background: '#f1f5f9', border: '1px solid #e2e8f0',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 11, fontWeight: 700, color: '#64748b',
                            }}>+{fotos.length - 3}</div>
                          )}
                        </div>
                      )}

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>
                          {r.fiscal}
                        </p>
                        <p style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                          {fotos.length} foto(s) · {parts.length} participante(s)
                          {r.endereco ? ` · ${r.endereco.slice(0, 40)}${r.endereco.length > 40 ? '...' : ''}` : ''}
                        </p>
                        {r.pauta && (
                          <p style={{
                            fontSize: 11, color: '#94a3b8', lineHeight: 1.4,
                            overflow: 'hidden', display: '-webkit-box',
                            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          }}>
                            {r.pauta}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Botão gerar no final */}
            <button onClick={gerar} disabled={gerandoPDF} style={{
              width: '100%', marginTop: 20, padding: 15, borderRadius: 12, border: 'none',
              background: gerandoPDF ? '#64748b' : 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              color: '#fff', fontSize: 16, fontWeight: 800, cursor: gerandoPDF ? 'not-allowed' : 'pointer',
            }}>
              {gerandoPDF ? '⏳ Gerando PDF...' : `🎯 Gerar Apresentação (${registros.length} slides)`}
            </button>
          </>
        )}

        {/* Sem registros com foto */}
        {!loading && registros.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📷</div>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>
              Nenhum registro com fotos encontrado
            </p>
            <p style={{ fontSize: 13 }}>
              O relatório de evidências exige ao menos 1 foto por registro.<br />
              Ajuste os filtros e busque novamente.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
