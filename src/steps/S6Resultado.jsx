import { useState, useRef, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { CHECKLISTS, CAT_META, calcNota, getStatus, isDisqualified, isItemConforme, getItemsNaoConformes, getChecklist, getItemsAtivos, getItemsParaCalculo, FORM_INICIAL } from '../data/checklists.js'
import { InfoRow, StatCard } from '../components/Shared.jsx'
import { uploadBase64, salvarAuditoriaBD, atualizarAuditoriaBD } from '../lib/supabase.js'
import { salvarAuditoriaOffline } from '../lib/offline.js'
import { obterNumeroAS } from '../lib/numeroAS.js'
import { sincronizarNCs } from '../lib/naoConformidades.js'
import { compartilharImagemNativo, compartilharPDFNativo, renderizarHtmlParaCanvas, descreverErro } from '../lib/compartilhar.js'
import { PainelAssinatura } from './S5Assinatura.jsx'

function separarDataHoraFortaleza(valor = new Date().toISOString()) {
  const data = new Date(valor)
  if (!Number.isNaN(data.getTime())) {
    const partes = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Fortaleza',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(data)
    const valorParte = tipo => partes.find(p => p.type === tipo)?.value || ''
    return {
      data: `${valorParte('year')}-${valorParte('month')}-${valorParte('day')}`,
      hora: `${valorParte('hour')}:${valorParte('minute')}:${valorParte('second')}`,
    }
  }
  return { data: '', hora: '' }
}

function decimalOuNull(valor) {
  const texto = String(valor ?? '').replace(',', '.').replace(/[^\d.]/g, '')
  if (!texto) return null
  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : null
}

export default function S6Resultado({ form, upd, setForm, setStep, pautaAtiva, onAuditoriaSalva, auditoriaEditandoId, fotosAntigas, isOnline }) {
  const nota      = calcNota(form)
  const st        = getStatus(nota)
  const cl        = getChecklist(form.tipoServico, form.tipoAuditoria, form.produtivo)
  // Itens "Não se aplica" saem do denominador — mesma regra usada em calcNota
  const items     = getItemsParaCalculo(getItemsAtivos(cl?.items || [], form), form.respostas)
  const eliminado = isDisqualified(form)

  const sim     = items.filter(i => isItemConforme(i, items, form.respostas)).length
  const nao     = items.length - sim
  const ncItems = getItemsNaoConformes(form)

  // ── Tratamento instantâneo de NC (só Desempenho Operacional) ──
  // Pós Serviço não trata aqui: a NC nasce PENDENTE e é tratada depois,
  // na tela "Tratamento de Não Conformidades".
  const isDesempenho   = form.tipoAuditoria === 'DESEMPENHO'
  const precisaTratarNc = isDesempenho && ncItems.length > 0
  const tratamentoNcOk  = !precisaTratarNc || (form.tratamentoNcTempoReal && !!form.fiscalAssinatura)
  const ncStatusValor   = ncItems.length === 0 ? null : (precisaTratarNc ? 'TRATADA' : 'PENDENTE')

  const [saveStatus,      setSaveStatus]      = useState('idle')
  const [saveError,       setSaveError]       = useState('')
  const [capturando,      setCapturando]      = useState(false)
  const [gerandoPDF,      setGerandoPDF]      = useState(false)
  const [salvoOffline,    setSalvoOffline]    = useState(false)
  const [fotosUrlsSalvas, setFotosUrlsSalvas] = useState([])

  const printAreaRef = useRef(null)
  const modoEdicao   = !!auditoriaEditandoId
  const online       = isOnline !== undefined ? isOnline : navigator.onLine

  useEffect(() => {
    if (precisaTratarNc && !form.fiscalAssinaturaNome && form.fiscal) {
      setForm(f => ({ ...f, fiscalAssinaturaNome: f.fiscal }))
    }
  }, [precisaTratarNc])

  const cats = ['COMPORTAMENTO', 'QUALIDADE', 'DESEMPENHO']
  const catStats = cats.map(cat => {
    const catItems = items.filter(i => i.cat === cat)
    const catSim   = catItems.filter(i => isItemConforme(i, items, form.respostas)).length
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

  // ── Monta o resumo visual da auditoria como canvas (usado tanto pra
  // compartilhar como imagem quanto pra gerar o PDF nativo) ─────────────────
  const criarCanvasResumo = async () => {
      const catColor = cat => ({
        COMPORTAMENTO: { bg: '#dbeafe', color: '#1d4ed8' },
        QUALIDADE:     { bg: '#dcfce7', color: '#15803d' },
        DESEMPENHO:    { bg: '#fef3c7', color: '#92400e' },
      }[cat] || { bg: '#f1f5f9', color: '#374151' })

      const barCor = pct => pct >= 90 ? '#16a34a' : pct >= 70 ? '#d97706' : '#dc2626'

      const infoRow = (label, value) => value ? `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9;">
          <span style="color:#64748b;font-weight:700;font-size:16px;min-width:120px;flex-shrink:0;">${label}</span>
          <span style="color:#0f172a;font-weight:800;font-size:16px;text-align:right;flex:1;padding-left:10px;">${value}</span>
        </div>` : ''

      const fotosParaExibir = !salvoOffline ? fotosUrlsSalvas : []

      const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4f8;padding:20px;box-sizing:border-box;width:520px;">

          ${eliminado ? `<div style="background:#dc2626;color:#fff;padding:10px 16px;border-radius:10px;margin-bottom:14px;font-size:15px;font-weight:800;text-align:center;letter-spacing:0.3px;">${msgEliminado}</div>` : ''}

          <div style="background:${st.bg};border:3px solid ${st.border};border-radius:18px;padding:24px;text-align:center;margin-bottom:16px;">
            <div style="font-size:52px;margin-bottom:8px;">${st.icon}</div>
            <div style="font-size:64px;font-weight:900;color:${st.color};line-height:1;">${nota.toFixed(0)}</div>
            <div style="font-size:15px;color:${st.color};font-weight:600;margin-bottom:4px;">pontos</div>
            <div style="font-size:26px;font-weight:900;color:${st.color};margin-bottom:8px;">${st.label}</div>
            <div style="font-size:17px;color:${st.color};font-weight:800;line-height:1.4;">${labelTipoAuditoria} — ${CHECKLISTS[form.tipoServico]?.label} — ${form.produtivo ? 'Produtivo' : 'Improdutivo'}</div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px;">
            <div style="background:#dcfce7;border-radius:14px;padding:16px;text-align:center;">
              <div style="font-size:34px;font-weight:900;color:#16a34a;">${sim}</div>
              <div style="font-size:13px;color:#16a34a;font-weight:700;">Conformes</div>
            </div>
            <div style="background:#fee2e2;border-radius:14px;padding:16px;text-align:center;">
              <div style="font-size:34px;font-weight:900;color:#dc2626;">${nao}</div>
              <div style="font-size:13px;color:#dc2626;font-weight:700;">Não conf.</div>
            </div>
            <div style="background:#eff6ff;border-radius:14px;padding:16px;text-align:center;">
              <div style="font-size:34px;font-weight:900;color:#2563eb;">${items.length}</div>
              <div style="font-size:13px;color:#2563eb;font-weight:700;">Total itens</div>
            </div>
          </div>

          <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:18px;margin-bottom:16px;">
            <p style="font-size:17px;font-weight:900;color:#1e293b;margin:0 0 14px 0;">Por Categoria</p>
            ${catStats.map(c => {
              const cc = catColor(c.cat)
              return `
              <div style="margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                  <span style="background:${cc.bg};color:${cc.color};padding:4px 12px;border-radius:8px;font-size:13px;font-weight:800;">${CAT_META[c.cat].label}</span>
                  <span style="font-size:15px;font-weight:800;color:#374151;">${c.sim}/${c.total} — ${c.pct}%</span>
                </div>
                <div style="background:#f1f5f9;border-radius:8px;height:14px;overflow:hidden;">
                  <div style="width:${c.pct}%;height:14px;background:${barCor(c.pct)};border-radius:8px;"></div>
                </div>
              </div>`
            }).join('')}
          </div>

          <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:18px;margin-bottom:16px;">
            <p style="font-size:17px;font-weight:900;color:#1e293b;margin:0 0 12px 0;">Dados da Auditoria</p>
            ${infoRow('Tipo Auditoria', labelTipoAuditoria)}
            ${infoRow('Tipo de Serviço', CHECKLISTS[form.tipoServico]?.label)}
            ${infoRow('No. AS', form.numeroAS || pautaAtiva?.numero_as)}
            ${form.motivoAuditoria ? infoRow('Motivo da Auditoria', form.motivoAuditoria) : ''}
            ${infoRow('Status do Serviço', form.produtivo ? 'Produtivo' : 'Improdutivo')}
            ${infoRow('Fiscal',         form.fiscal)}
            ${infoRow('Matrícula',      form.matricula)}
            ${infoRow('Equipe',         form.prefixo)}
            ${infoRow('OS',             form.os)}
            ${infoRow('UC',             form.uc)}
            ${infoRow('Endereço',       form.endereco)}
            ${infoRow('Data / Hora',    `${form.data} às ${form.hora}`)}
            ${form.lat              ? infoRow('GPS',           `${form.lat}, ${form.lng}`) : ''}
            ${form.nomeEletricista  ? infoRow('Eletricista 1', form.nomeEletricista)        : ''}
            ${form.nomeEletricista2 ? infoRow('Eletricista 2', form.nomeEletricista2)       : ''}
          </div>

          ${ncItems.length > 0 ? `
          <div style="background:#fff0f0;border:3px solid #dc2626;border-radius:16px;padding:20px;margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
              <span style="font-size:24px;">❌</span>
              <p style="font-size:18px;font-weight:900;color:#b91c1c;margin:0;">
                Itens Não Conformes (${ncItems.length})
              </p>
            </div>
            ${ncItems.map((item, i) => `
              <div style="
                background:#fef2f2;
                border-left:5px solid #dc2626;
                border-radius:0 10px 10px 0;
                padding:12px 14px;
                margin-bottom:${i < ncItems.length - 1 ? '10px' : '0'};
                line-height:1.5;
              ">
                <span style="font-size:16px;font-weight:900;color:#991b1b;">${i + 1}. </span>
                <span style="font-size:16px;font-weight:700;color:#991b1b;">${item.p}</span>
              </div>`).join('')}
          </div>` : ''}

          ${form.feedback || form.observacoes ? `
          <div style="background:#fffbeb;border:2px solid #fcd34d;border-radius:16px;padding:18px;margin-bottom:16px;">
            ${form.feedback ? `
              <p style="font-size:14px;font-weight:900;color:#92400e;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:0.5px;">Feedback do Fiscal:</p>
              <p style="font-size:17px;color:#1e293b;font-weight:600;line-height:1.6;margin:0 0 ${form.observacoes ? '16px' : '0'} 0;">${form.feedback}</p>` : ''}
            ${form.observacoes ? `
              <p style="font-size:14px;font-weight:900;color:#92400e;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:0.5px;">Observações:</p>
              <p style="font-size:17px;color:#1e293b;font-weight:600;line-height:1.6;margin:0;">${form.observacoes}</p>` : ''}
          </div>` : ''}

          ${fotosParaExibir.length > 0 ? `
          <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:18px;margin-bottom:16px;">
            <p style="font-size:17px;font-weight:900;color:#1e293b;margin:0 0 14px 0;">📷 Registro Fotográfico (${fotosParaExibir.length})</p>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
              ${fotosParaExibir.map((url, i) => `
                <img src="${url}" alt="Foto ${i+1}" crossorigin="anonymous"
                  style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;border:1px solid #e2e8f0;display:block;"/>
              `).join('')}
            </div>
          </div>` : ''}

          ${form.assinatura ? `
          <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:18px;margin-bottom:16px;">
            <p style="font-size:16px;font-weight:900;color:#1e293b;margin:0 0 10px 0;">Assinatura — ${form.nomeEletricista || 'Eletricista 1'}</p>
            <img src="${form.assinatura}" style="width:100%;border-radius:10px;border:1px solid #f1f5f9;background:#fafafa;display:block;" />
            <p style="font-size:12px;color:#94a3b8;text-align:center;margin:8px 0 0 0;">Registrado em ${form.data} às ${form.hora}</p>
          </div>` : ''}

          ${form.assinatura2 ? `
          <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:18px;margin-bottom:16px;">
            <p style="font-size:16px;font-weight:900;color:#1e293b;margin:0 0 10px 0;">Assinatura — ${form.nomeEletricista2 || 'Eletricista 2'}</p>
            <img src="${form.assinatura2}" style="width:100%;border-radius:10px;border:1px solid #f1f5f9;background:#fafafa;display:block;" />
            <p style="font-size:12px;color:#94a3b8;text-align:center;margin:8px 0 0 0;">Registrado em ${form.data} às ${form.hora}</p>
          </div>` : ''}

          <div style="border-top:2px solid #e2e8f0;padding-top:14px;text-align:center;">
            <p style="font-size:13px;color:#64748b;margin:0;font-weight:700;">VérticeGP · Plataforma de Gestão Operacional</p>
            <p style="font-size:12px;color:#cbd5e1;margin:4px 0 0 0;">Gerado em ${new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })}</p>
          </div>

        </div>`

      return renderizarHtmlParaCanvas(html, { largura: 520, aguardarImagens: fotosParaExibir.length > 0 })
  }

  // ── Compartilhar no WhatsApp (imagem) ──────────────────────────────────────
  // No app Android nativo, a Web Share API com arquivo é inconsistente dentro
  // do WebView do Capacitor — usa a folha de compartilhamento nativa em vez
  // dela. Na web, mantém exatamente o comportamento de sempre.
  const gerarImagemWhatsApp = async () => {
    setCapturando(true)
    try {
      const canvas = await criarCanvasResumo()
      const nomeArquivo = `Auditoria_${form.prefixo}_OS${form.os}_${form.data}.png`.replace(/\s+/g, '_')
      const titulo = `Auditoria ${form.prefixo}`
      const texto  = `Auditoria de Campo — ${form.prefixo} — OS ${form.os} — ${st.label}`

      if (Capacitor.isNativePlatform()) {
        await compartilharImagemNativo(canvas, nomeArquivo, { titulo, texto })
      } else if (navigator.share && navigator.canShare) {
        canvas.toBlob(async blob => {
          const file = new File([blob], nomeArquivo, { type: 'image/png' })
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: titulo, text: texto })
          } else { baixarImagem(canvas, nomeArquivo) }
        }, 'image/png')
      } else { baixarImagem(canvas, nomeArquivo) }

    } catch (err) {
      console.error('Erro ao gerar imagem:', err)
      alert('Não foi possível gerar a imagem: ' + descreverErro(err))
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

  // ── Gerar PDF / Imprimir ───────────────────────────────────────────────────
  // Na web, window.print() já funciona (abre o diálogo do navegador/SO) e
  // continua sendo usado sem mudança. No app Android nativo, window.print()
  // não faz nada (o WebView do Capacitor não implementa impressão) — em vez
  // disso, monta um PDF de verdade (jsPDF) a partir do mesmo resumo visual
  // usado no WhatsApp e compartilha via folha nativa do Android.
  const gerarPDF = async () => {
    if (!Capacitor.isNativePlatform()) { window.print(); return }
    setGerandoPDF(true)
    try {
      const canvas = await criarCanvasResumo()
      const nomeArquivo = `Auditoria_${form.prefixo}_OS${form.os}_${form.data}.pdf`.replace(/\s+/g, '_')
      await compartilharPDFNativo(canvas, nomeArquivo, {
        titulo: `Auditoria ${form.prefixo}`,
        texto:  `Auditoria de Campo — ${form.prefixo} — OS ${form.os} — ${st.label}`,
      })
    } catch (err) {
      console.error('Erro ao gerar PDF:', err)
      alert('Não foi possível gerar o PDF: ' + descreverErro(err))
    } finally {
      setGerandoPDF(false)
    }
  }

  // Converte o booleano statusMotivoAuditoria em texto legível para relatórios.
  // null/undefined → null (motivo ainda não avaliado ou não se aplica)
  const avaliacaoMotivoTexto =
    form.statusMotivoAuditoria === true  ? 'CONFORME' :
    form.statusMotivoAuditoria === false ? 'NÃO CONFORME' :
    null

  const montarPayload = (numeroASSalvo = null) => {
    const geracaoPauta = separarDataHoraFortaleza(pautaAtiva?.created_at || pautaAtiva?.criado_em)
    const execucao = separarDataHoraFortaleza()
    const numeroAS = obterNumeroAS(numeroASSalvo || form.numeroAS || pautaAtiva?.numero_as)
    return {
      numero_as:         numeroAS,
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
      debito_pago:       form.debitoPago,
      nota,
      status:            st.label,
      respostas:         form.respostas,
      feedback:          form.feedback,
      observacoes:                     form.observacoes,
      nome_eletricista:                form.nomeEletricista,
      nome_eletricista2:               form.nomeEletricista2 || null,
      motivo_auditoria:                form.motivoAuditoria || null,
      status_motivo_auditoria:         form.motivoAuditoria ? form.statusMotivoAuditoria : null,
      avaliacao_motivo_auditoria:      form.motivoAuditoria ? avaliacaoMotivoTexto : null,
      observacoes_motivo_auditoria:    form.motivoAuditoria ? (form.observacoesMotivoAuditoria || null) : null,
      qtde_cabos_os:                   decimalOuNull(form.qtdeCabosOs || pautaAtiva?.qtde_cabos_os),
      qtde_cabos_em_campo:             form.motivoAuditoria ? decimalOuNull(form.qtdeCabosEmCampo) : null,
      usuario_criacao:                 pautaAtiva?.usuario_criacao || null,
      data_geracao:                    pautaAtiva?.data_geracao || geracaoPauta.data || null,
      hora_geracao:                    pautaAtiva?.hora_geracao || geracaoPauta.hora || null,
      data_prevista:                   pautaAtiva?.data_prevista || null,
      pauta_id:                        pautaAtiva?.id || null,
      latitude_pauta:                  pautaAtiva?.latitude ?? null,
      longitude_pauta:                 pautaAtiva?.longitude ?? null,
      cidade:                          pautaAtiva?.cidade || null,
      bairro:                          pautaAtiva?.bairro || null,
      endereco_referencia:             pautaAtiva?.endereco_referencia || null,
      data_os:                         pautaAtiva?.data_os || null,
      prioridade_execucao:             pautaAtiva?.prioridade_execucao || null,
      data_execucao:                   form.data || execucao.data,
      hora_execucao:                   form.hora || execucao.hora,
      nc_status:                       ncStatusValor,
    }
  }

  // Contexto de identificação da auditoria, usado pra denormalizar cada linha
  // de auditorias_nao_conformes (ver src/lib/naoConformidades.js)
  const contextoNC = (numeroASSalvo) => ({
    fiscal: form.fiscal, matricula: form.matricula, prefixo: form.prefixo,
    os: form.os, uc: form.uc,
    nomeEletricista: form.nomeEletricista, nomeEletricista2: form.nomeEletricista2,
    motivoAuditoria: form.motivoAuditoria, avaliacaoMotivoTexto,
    observacoesMotivoAuditoria: form.observacoesMotivoAuditoria,
    numeroAS: numeroASSalvo || form.numeroAS || pautaAtiva?.numero_as || null,
    tipoAuditoria: form.tipoAuditoria,
  })

  const salvar = async () => {
    setSaveStatus('saving')
    setSaveError('')
    if (!tratamentoNcOk) {
      setSaveStatus('idle')
      return
    }
    const numeroASSalvo = obterNumeroAS(form.numeroAS || pautaAtiva?.numero_as)
    if (!form.numeroAS) setForm(f => ({ ...f, numeroAS: numeroASSalvo }))

    if (!online && !modoEdicao) {
      try {
        const payload = {
          ...montarPayload(numeroASSalvo),
          ...(form.motivoAuditoria && {
            status_motivo_auditoria:      form.statusMotivoAuditoria,
            avaliacao_motivo_auditoria:   avaliacaoMotivoTexto,
            observacoes_motivo_auditoria: form.observacoesMotivoAuditoria || null,
            // ⚠️ fotos_motivo_urls NÃO incluídas aqui: o salvamento offline
            // depende de offline.js aceitar um array extra de fotos, fora
            // do escopo deste ajuste. As fotos do motivo, se capturadas
            // offline, ficam retidas no estado local até nova tentativa
            // online — não são perdidas, mas não sobem automaticamente
            // no modo offline nesta versão.
          }),
        }
        const fotosBase64  = form.fotos.map(f => f.url)
        const assinBase64  = form.assinatura  || null
        const assin2Base64 = form.assinatura2 || null
        // NCs (se houver) vão junto na fila offline — sincronizadas quando
        // a conexão voltar (ver sincronizarPendentes em lib/offline.js)
        const ncData = ncItems.length > 0 ? {
          ncItems,
          contexto: contextoNC(numeroASSalvo),
          tratamentoDesempenho: precisaTratarNc,
          fiscalAssinaturaBase64: precisaTratarNc ? (form.fiscalAssinatura || null) : null,
        } : null
        await salvarAuditoriaOffline(payload, fotosBase64, assinBase64, assin2Base64, ncData)
        setSalvoOffline(true)
        setSaveStatus('saved')
        if (onAuditoriaSalva) onAuditoriaSalva(null, { nc_status: ncStatusValor })
      } catch (err) {
        setSaveError('Erro ao salvar offline: ' + err.message)
        setSaveStatus('error')
      }
      return
    }

    try {
      const auditId = modoEdicao
        ? auditoriaEditandoId
        : numeroASSalvo.replace(/[^A-Z0-9_-]/gi, '_')

      const fotosNovas = []
      for (let i = 0; i < form.fotos.length; i++) {
        const url = await uploadBase64(form.fotos[i].url, `${auditId}/foto_${Date.now()}_${i + 1}.jpg`)
        fotosNovas.push(url)
      }
      const fotosUrls = modoEdicao ? [...(fotosAntigas || []), ...fotosNovas] : fotosNovas
      setFotosUrlsSalvas(fotosUrls)

      // ── Upload das fotos do Motivo da Auditoria (se houver) ──
      const fotosMotivoUrls = []
      if (form.motivoAuditoria && form.fotosMotivo?.length > 0) {
        for (let i = 0; i < form.fotosMotivo.length; i++) {
          const url = await uploadBase64(form.fotosMotivo[i].url, `${auditId}/motivo_${Date.now()}_${i + 1}.jpg`)
          fotosMotivoUrls.push(url)
        }
      }

      let assinaturaUrl  = null
      let assinatura2Url = null
      if (form.assinatura)  assinaturaUrl  = await uploadBase64(form.assinatura,  `${auditId}/assinatura_1.png`)
      if (form.assinatura2) assinatura2Url = await uploadBase64(form.assinatura2, `${auditId}/assinatura_2.png`)

      // ── Termo de Ciência do Fiscal (só Desempenho, quando há NC) ──
      let fiscalAssinaturaUrl = null
      if (precisaTratarNc && form.fiscalAssinatura) {
        fiscalAssinaturaUrl = await uploadBase64(form.fiscalAssinatura, `${auditId}/assinatura_fiscal_nc.png`)
      }

      const payload = {
        ...montarPayload(numeroASSalvo),
        fotos_urls: fotosUrls,
        ...(assinaturaUrl  && { assinatura_url:  assinaturaUrl  }),
        ...(assinatura2Url && { assinatura2_url: assinatura2Url }),
        ...(form.motivoAuditoria && {
          fotos_motivo_urls:            fotosMotivoUrls,
          status_motivo_auditoria:      form.statusMotivoAuditoria,
          avaliacao_motivo_auditoria:   avaliacaoMotivoTexto,
          observacoes_motivo_auditoria: form.observacoesMotivoAuditoria || null,
        }),
      }

      let saved
      if (modoEdicao) {
        saved = await atualizarAuditoriaBD(auditoriaEditandoId, payload)
      } else {
        saved = await salvarAuditoriaBD(payload)
      }

      // ─── Sincroniza Não Conformidades na tabela auxiliar ───
      // (Falha silenciosa: não bloqueia o sucesso do salvar da auditoria)
      if (saved?.id) {
        // Desempenho: já nasce TRATADA (tratamento instantâneo desta tela).
        // Pós Serviço: nasce sem esses campos — fica PENDENTE (default do banco).
        const camposTratamentoNc = precisaTratarNc ? {
          status_tratamento:                'TRATADA',
          tratamento_observacao:             'Não conformidade tratada em tempo real',
          tratamento_assinatura_url:         assinaturaUrl || null,
          tratamento_assinatura_nome:        form.nomeEletricista || null,
          tratamento_fiscal_assinatura_url:  fiscalAssinaturaUrl,
          tratado_por:                       form.matricula || form.fiscal || null,
          tratado_em:                        new Date().toISOString(),
        } : {}
        await sincronizarNCs(saved.id, ncItems, modoEdicao, contextoNC(numeroASSalvo), camposTratamentoNc)
      }

      setSaveStatus('saved')
      if (onAuditoriaSalva) onAuditoriaSalva(saved.id, { nc_status: ncStatusValor })

    } catch (err) {
      console.error('Erro ao salvar:', err)
      setSaveError(err.message || 'Erro ao salvar. Verifique a conexão.')
      setSaveStatus('error')
    }
  }

  return (
    <div>
      <div ref={printAreaRef} className="print-area" style={{ background: '#f0f4f8', padding: 16, borderRadius: 12 }}>

        {modoEdicao && (
          <div style={{ background: '#fef3c7', border: '1.5px solid #f59e0b', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#92400e', fontWeight: 700 }}>
            ✏️ Modo edição — auditoria reaberta para correção
          </div>
        )}

        {!online && !modoEdicao && (
          <div style={{ background: '#fef3c7', border: '1.5px solid #f59e0b', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#92400e', fontWeight: 700 }}>
            📵 Sem internet — auditoria e fotos serão salvas localmente e enviadas ao banco quando a conexão voltar
          </div>
        )}

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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
          <StatCard label="Conformes"   value={sim}          color="#16a34a" />
          <StatCard label="Não conf."   value={nao}          color="#dc2626" />
          <StatCard label="Total itens" value={items.length} color="#2563eb" />
        </div>

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

        <div className="card">
          <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>Dados da Auditoria</p>
          <InfoRow label="Tipo Auditoria" value={labelTipoAuditoria} />
          <InfoRow label="Tipo de Serviço"  value={CHECKLISTS[form.tipoServico]?.label} />
          <InfoRow label="No. AS" value={form.numeroAS || pautaAtiva?.numero_as} />
          {form.motivoAuditoria && <InfoRow label="Motivo da Auditoria" value={form.motivoAuditoria} />}
          {form.qtdeCabosOs && <InfoRow label="Qtde Cabos OS" value={`${form.qtdeCabosOs}m`} />}
          {form.qtdeCabosEmCampo && <InfoRow label="Qtde Cabos em Campo" value={`${form.qtdeCabosEmCampo}m`} />}
          <InfoRow label="Status do Serviço" value={form.produtivo ? 'Produtivo' : 'Improdutivo'} />
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

        {ncItems.length > 0 && (
          <div className="card" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c', marginBottom: 10 }}>❌ Itens Não Conformes ({ncItems.length})</p>
            {ncItems.map((item, i) => (
              <div key={item.id} style={{ fontSize: 12, color: '#991b1b', padding: '5px 0', borderBottom: i < ncItems.length - 1 ? '1px solid #fecaca' : 'none', lineHeight: 1.5 }}>
                <strong>{i + 1}.</strong> {item.p}
                {item.inverted && <span style={{ fontSize: 10, color: '#7c3aed', marginLeft: 6 }}>(invertida)</span>}
              </div>
            ))}
          </div>
        )}

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

        {modoEdicao && fotosAntigas?.length > 0 && (
          <div style={{ marginBottom: 14 }} data-fotos="antigas">
            <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>📁 Fotos anteriores ({fotosAntigas.length})</p>
            <div className="photo-grid">
              {fotosAntigas.map((url, i) => (
                <div key={i} className="photo-thumb">
                  <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Foto anterior ${i + 1}`} /></a>
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(15,118,110,0.7)', color: '#fff', fontSize: 9, padding: '2px 4px', textAlign: 'center' }}>Anterior {i + 1}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {form.fotos.length > 0 && (
          <div style={{ marginBottom: 14 }} data-fotos="novas">
            <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
              {modoEdicao ? `📷 Novas fotos (${form.fotos.length})` : `Registro Fotográfico (${form.fotos.length})`}
            </p>
            <div className="photo-grid">
              {form.fotos.map((foto, i) => (
                <div key={i} className="photo-thumb">
                  <img src={foto.url} alt={`Foto ${i + 1}`} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 9, padding: '2px 4px', textAlign: 'center' }}>
                    {modoEdicao ? `Nova ${i + 1}` : `Foto ${i + 1}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {form.assinatura && (
          <div className="card">
            <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Assinatura — {form.nomeEletricista || 'Eletricista 1'}</p>
            <img src={form.assinatura} alt="Assinatura 1" style={{ width: '100%', borderRadius: 8, border: '1px solid #f1f5f9', background: '#fafafa' }} />
            <p style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', marginTop: 6 }}>Registrado em {form.data} às {form.hora}</p>
          </div>
        )}

        {form.assinatura2 && (
          <div className="card">
            <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Assinatura — {form.nomeEletricista2 || 'Eletricista 2'}</p>
            <img src={form.assinatura2} alt="Assinatura 2" style={{ width: '100%', borderRadius: 8, border: '1px solid #f1f5f9', background: '#fafafa' }} />
            <p style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', marginTop: 6 }}>Registrado em {form.data} às {form.hora}</p>
          </div>
        )}

        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, marginBottom: 8, textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>VérticeGP · Plataforma de Gestão Operacional</p>
          <p style={{ fontSize: 10, color: '#cbd5e1', marginTop: 2 }}>Gerado em {new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })}</p>
        </div>
      </div>

      {/* ── Tratamento instantâneo de NC (só Desempenho Operacional, antes de finalizar) ── */}
      {precisaTratarNc && saveStatus === 'idle' && (
        <div className="no-print card" style={{ background: '#fff7ed', border: '1px solid #fdba74', marginTop: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#9a3412', marginBottom: 12 }}>
            🛠️ Tratamento da(s) Não Conformidade(s) — obrigatório antes de finalizar
          </p>

          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: '#1e3a5f', marginBottom: 4 }}>📋 Termo de Ciência de Não Conformidade</p>
            <p style={{ fontSize: 12, color: '#1e40af', lineHeight: 1.5 }}>
              <strong>{[form.nomeEletricista, form.nomeEletricista2].filter(Boolean).join(' e ') || 'O eletricista'}</strong>{' '}
              {form.nomeEletricista2 ? 'tiveram' : 'teve'} ciência, ao assinar esta auditoria, da(s) não conformidade(s) identificada(s) acima e da obrigação de corrigi-la(s).
            </p>
          </div>

          <div style={{ marginBottom: 4 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
              Observação do Tratamento da Não Conformidade
            </p>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
              background: form.tratamentoNcTempoReal ? '#f0fdf4' : '#fffbeb',
              border: `1.5px solid ${form.tratamentoNcTempoReal ? '#86efac' : '#fcd34d'}`,
              borderRadius: 10, padding: '12px 14px', marginBottom: 14,
            }}>
              <input
                type="checkbox"
                checked={form.tratamentoNcTempoReal}
                onChange={e => upd('tratamentoNcTempoReal', e.target.checked)}
                style={{ width: 20, height: 20 }}
              />
              <span style={{ fontSize: 13, fontWeight: 700, color: form.tratamentoNcTempoReal ? '#15803d' : '#92400e' }}>
                Não conformidade tratada em tempo real
              </span>
            </label>
          </div>

          <PainelAssinatura
            label="Fiscal"
            nome={form.fiscalAssinaturaNome}
            onNome={v => upd('fiscalAssinaturaNome', v)}
            assinatura={form.fiscalAssinatura}
            onAssinatura={v => upd('fiscalAssinatura', v)}
            obrigatorio={true}
          />
          <p style={{ fontSize: 11, color: '#78350f' }}>
            Termo de Ciência do Fiscal — atesto que expliquei a não conformidade ao eletricista e orientei a correção.
          </p>
        </div>
      )}

      {/* ── AÇÕES ── */}
      <div className="no-print" style={{ marginBottom: 40, marginTop: 16 }}>

        {saveStatus === 'idle' && (
          <>
            {precisaTratarNc && !tratamentoNcOk && (
              <div className="alert alert-warning" style={{ marginBottom: 10 }}>
                ⚠️ Marque o check e colete a assinatura do fiscal (Termo de Ciência) para liberar o salvamento.
              </div>
            )}
            <button className="btn-primary" onClick={salvar} disabled={!tratamentoNcOk}
              style={{ background: modoEdicao ? '#d97706' : online ? '#1e3a5f' : '#dc2626', marginBottom: 10, fontSize: 16 }}>
              {modoEdicao ? '💾 Salvar Correção' : online ? '💾 Salvar Auditoria' : '📵 Salvar Offline'}
            </button>
            <button className="btn-secondary" onClick={() => setStep(4)} style={{ marginBottom: 10 }}>← Voltar e editar</button>
          </>
        )}

        {saveStatus === 'saving' && (
          <button className="btn-primary" disabled style={{ background: '#64748b', marginBottom: 10, fontSize: 16 }}>
            {online ? '⏳ Salvando no banco de dados...' : '⏳ Salvando localmente...'}
          </button>
        )}

        {saveStatus === 'error' && (
          <>
            <div className="alert alert-danger" style={{ marginBottom: 10 }}>❌ {saveError}</div>
            <button className="btn-primary" onClick={salvar} style={{ background: '#dc2626', marginBottom: 10 }}>🔄 Tentar novamente</button>
            <button className="btn-secondary" onClick={() => setStep(4)} style={{ marginBottom: 10 }}>← Voltar e editar</button>
          </>
        )}

        {saveStatus === 'saved' && (
          <>
            <div style={{
              background: salvoOffline ? '#fef3c7' : '#f0fdf4',
              border: `1px solid ${salvoOffline ? '#fcd34d' : '#86efac'}`,
              borderRadius: 12, padding: '14px 16px', marginBottom: 14, textAlign: 'center',
            }}>
              <p style={{ color: salvoOffline ? '#92400e' : '#15803d', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                {salvoOffline ? '📵 Auditoria salva localmente!' : modoEdicao ? '✅ Correção salva com sucesso!' : '✅ Auditoria salva com sucesso!'}
              </p>
              <p style={{ color: '#64748b', fontSize: 11 }}>
                {salvoOffline
                  ? 'Quando a internet voltar, será enviada automaticamente ao banco de dados com todas as fotos.'
                  : modoEdicao ? 'Auditoria corrigida e fechada novamente.' : 'Dados e fotos enviados ao banco. Esta auditoria não pode mais ser alterada.'}
              </p>
              {salvoOffline && (
                <p style={{ color: '#92400e', fontSize: 10, marginTop: 6, fontStyle: 'italic' }}>
                  ℹ️ No modo offline a imagem compartilhada não incluirá as fotos (apenas o resultado, dados e assinatura).
                </p>
              )}
            </div>

            <button className="btn-primary" onClick={gerarImagemWhatsApp} disabled={capturando}
              style={{ background: capturando ? '#64748b' : '#25d366', marginBottom: 10 }}>
              {capturando ? '⏳ Gerando imagem...' : '📸 Compartilhar no WhatsApp'}
            </button>

            <button className="btn-primary" onClick={gerarPDF} disabled={gerandoPDF}
              style={{ background: gerandoPDF ? '#64748b' : '#7c3aed', marginBottom: 10 }}>
              {gerandoPDF ? '⏳ Gerando PDF...' : '🖨️ Gerar PDF / Imprimir'}
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
