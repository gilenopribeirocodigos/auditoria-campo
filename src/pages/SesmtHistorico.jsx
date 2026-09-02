import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import * as XLSX from 'xlsx'
import { listarAcoesSesmt, listarAssinaturasSesmtColetadasPorAcao, atualizarParticipantesAcaoSesmt, mesclarAssinaturasColetadas, buscarTokenMaisRecenteSesmtPorAcao, tokenExpiradoOuEncerrado, removerParticipantesOnlineNaoAssinados, distanciaMetrosSesmt, buscarCpfsSesmtPorIds } from '../lib/sesmt.js'
import { TIPOS_ACAO_SESMT, REGIONAIS_SESMT } from '../data/sesmt_config.js'
import { CarregandoHexagono } from '../components/Shared.jsx'
import ModalLinkAssinaturaSesmt from '../components/ModalLinkAssinaturaSesmt.jsx'
import { compartilharImagemNativo, compartilharPDFNativo, renderizarHtmlParaCanvas, descreverErro } from '../lib/compartilhar.js'
// Mesmos tokens visuais/helpers de data do painel de filtros padrão do app
// (Registros Operacionais) — reaproveitados aqui pra ficar com a cara igual,
// sem puxar a parte de Regional/Supervisor/Prefixo (que depende de
// estrutura_equipes e não existe no módulo SESMT).
import { LABEL_STYLE, INPUT_STYLE, FIELD_HEIGHT, calcHoje, calcMesAtual, mesLabel, fmtData } from '../components/PainelFiltros.jsx'

const formatData = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

// A partir de qual distância do local da ação uma assinatura passa a ser
// tratada como suspeita (sinal de que o link pode ter sido repassado pra
// alguém fora do local) — GPS de celular varia uns 10-100m, prédios/canteiro
// de obra podem ter algumas dezenas de metros, então 500m dá folga real sem
// deixar passar quem assinou de longe.
const LIMITE_DISTANCIA_SUSPEITA_M = 500

function formatarDistancia(metros) {
  if (metros < 1000) return `${Math.round(metros)} m`
  return `${(metros / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`
}

export default function SesmtHistorico({ onVoltar }) {
  // Período no mesmo padrão do painel de filtros de Registros Operacionais
  // (Hoje / Mês / Período) — default "Mês" preserva o comportamento antigo
  // (mês atual).
  const [tipoPeriodo, setTipoPeriodo] = useState('mes')
  const [mesAno,      setMesAno]      = useState(calcMesAtual())
  const [dataIni,     setDataIni]     = useState('')
  const [dataFim,     setDataFim]     = useState('')
  const [tipo,     setTipo]     = useState('')
  const [regional, setRegional] = useState('')
  const [fiscal,   setFiscal]   = useState('')

  const getDatasFiltro = () => {
    if (tipoPeriodo === 'hoje') {
      const hoje = calcHoje()
      return { ini: hoje, fim: hoje }
    }
    if (tipoPeriodo === 'periodo' && dataIni) {
      return { ini: dataIni, fim: dataFim || dataIni }
    }
    if (tipoPeriodo === 'mes' && mesAno) {
      const [ano, mes] = mesAno.split('-')
      return { ini: `${ano}-${mes}-01`, fim: new Date(parseInt(ano), parseInt(mes), 0).toISOString().split('T')[0] }
    }
    return { ini: null, fim: null }
  }

  const periodoLabel = tipoPeriodo === 'hoje'
    ? `Hoje (${fmtData(calcHoje())})`
    : tipoPeriodo === 'periodo' && dataIni
      ? (dataFim && dataFim !== dataIni ? `${fmtData(dataIni)} → ${fmtData(dataFim)}` : fmtData(dataIni))
      : tipoPeriodo === 'mes' && mesAno ? mesLabel(mesAno) : 'Todos'

  const temFiltrosAtivos = tipoPeriodo !== 'mes' || mesAno !== calcMesAtual() || tipo !== '' || regional !== '' || fiscal.trim() !== ''

  const limparFiltros = () => {
    setTipoPeriodo('mes')
    setMesAno(calcMesAtual())
    setDataIni('')
    setDataFim('')
    setTipo('')
    setRegional('')
    setFiscal('')
  }

  const [acoes,   setAcoes]   = useState([])
  const [loading, setLoading] = useState(true)
  const [erro,    setErro]    = useState('')
  const [detalhe, setDetalhe] = useState(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [tokenDetalhe, setTokenDetalhe] = useState(null)
  const [mostrarLinkModal, setMostrarLinkModal] = useState(false)
  const [capturando, setCapturando] = useState(false)
  const [gerandoPDF, setGerandoPDF] = useState(false)
  const [exportando, setExportando] = useState(false)

  const buscar = async () => {
    setLoading(true)
    setErro('')
    try {
      const { ini, fim } = getDatasFiltro()
      const data = await listarAcoesSesmt({ tipo, regional, dataIni: ini, dataFim: fim, fiscal: fiscal.trim() })
      setAcoes(data)
    } catch (e) {
      setErro(e.message || 'Erro ao carregar histórico.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { buscar() }, [])

  // Exporta as ações do filtro atual em Excel — uma linha por participante.
  // O que identifica cada ação (mesmo tendo mais de uma do mesmo tipo no
  // mesmo dia) é o conjunto REGIONAL + TIPO REGISTRO + TEMA + MOTIVO + DATA +
  // HORA + ENDEREÇO REUNIÃO repetido em todas as linhas dos participantes
  // daquela ação — HORA é capturada no minuto do registro, então na prática
  // duas ações do mesmo tipo no mesmo dia já saem com HORA (e quase sempre
  // TEMA) diferentes, e as linhas de cada uma ficam sempre juntas/contíguas
  // na planilha (a lista já vem ordenada por data/hora).
  // Acima disso, confirma antes de gerar — não é a consulta ao banco que
  // pesa (filtro por data já é rápido), é montar/segurar uma planilha muito
  // grande na memória do navegador (às vezes um celular em campo). Baseado
  // no nº de linhas real do filtro atual, não numa data de corte fixa — um
  // período de 1 ano com poucas ações passa direto; um período de 1 mês com
  // ações importadas em massa por regional (centenas de participantes cada)
  // pode disparar o aviso.
  const LIMITE_LINHAS_AVISO_EXPORT = 3000

  const exportarExcel = async () => {
    if (acoes.length === 0) return
    const totalLinhas = acoes.reduce((soma, a) => soma + Math.max(1, (a.participantes || []).length), 0)
    if (totalLinhas > LIMITE_LINHAS_AVISO_EXPORT && !window.confirm(
      `Esse filtro vai gerar uma planilha com ${totalLinhas} linha(s) (${acoes.length} ação(ões)). ` +
      'Pode demorar um pouco pra gerar, principalmente no celular. Prefira períodos menores (ex.: por mês) sempre que possível.\n\n' +
      'Quer continuar mesmo assim?'
    )) return
    setExportando(true)
    try {
      const idsPessoas = [...new Set(acoes.flatMap(a => (a.participantes || []).filter(p => p.pessoa_id).map(p => p.pessoa_id)))]
      const cpfPorId = await buscarCpfsSesmtPorIds(idsPessoas)

      const linhas = []
      acoes.forEach(a => {
        const tc = TIPOS_ACAO_SESMT[a.tipo] || {}
        const participantes = a.participantes || []
        const base = {
          'REGIONAL': a.regional || '',
          'TIPO REGISTRO': tc.label || a.tipo || '',
          'TEMA': a.tema || '',
          'MOTIVO': a.motivo || '',
          'DATA': formatData(a.data_registro),
          'HORA': a.hora_registro || '',
          'ENDEREÇO REUNIÃO': a.endereco || '',
        }
        if (participantes.length === 0) {
          linhas.push({ ...base, 'NOME': '', 'MATRICULA': '', 'CPF': '', 'ASSINATURA': '', 'ENDEREÇO ASSINATURA': '', 'DISTANCIA ASSINATURA': '', 'MODALIDADE': '' })
          return
        }
        participantes.forEach(p => {
          const assinado = Boolean(p.assinatura_url)
          const dist = assinado && a.lat && a.lng && p.lat && p.lng ? distanciaMetrosSesmt(a.lat, a.lng, p.lat, p.lng) : null
          linhas.push({
            ...base,
            'NOME': p.nome || '',
            'MATRICULA': p.chapa || '',
            'CPF': (p.pessoa_id && cpfPorId[p.pessoa_id]) || '',
            'ASSINATURA': assinado ? 'SIM' : 'NÃO',
            'ENDEREÇO ASSINATURA': p.endereco_assinatura || '',
            'DISTANCIA ASSINATURA': dist != null ? Math.round(dist) : '',
            'MODALIDADE': p.modo ? p.modo.toUpperCase() : '',
          })
        })
      })

      const ws = XLSX.utils.json_to_sheet(linhas)
      ws['!cols'] = Object.keys(linhas[0] || {}).map(k => ({ wch: Math.max(k.length + 2, 14) }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Ações SESMT')
      XLSX.writeFile(wb, `acoes_sesmt_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (e) {
      alert('Erro ao gerar Excel: ' + (e.message || e))
    } finally {
      setExportando(false)
    }
  }

  // Enquanto o card de detalhe estiver aberto, traz assinaturas coletadas
  // via QR de autoatendimento (mesmo que o link ainda esteja ativo) e
  // mescla na lista de participantes — tanto na tela quanto no banco.
  const detalheRef = useRef(null)
  useEffect(() => { detalheRef.current = detalhe }, [detalhe])

  // Sabendo se o link/QR daquela ação já expirou/foi encerrado, dá pra
  // também limpar quem nunca assinou (ver removerParticipantesOnlineNaoAssinados) —
  // não tem processo de fundo, roda na próxima sincronização mesmo.
  const tokenDetalheRef = useRef(null)
  useEffect(() => { tokenDetalheRef.current = tokenDetalhe }, [tokenDetalhe])

  const sincronizarDetalhe = async (acaoAtual) => {
    if (!acaoAtual) return
    try {
      const coletadas = await listarAssinaturasSesmtColetadasPorAcao(acaoAtual.id)
      const participantesAtuais = acaoAtual.participantes || []
      let mesclados = mesclarAssinaturasColetadas(participantesAtuais, coletadas)
      if (tokenExpiradoOuEncerrado(tokenDetalheRef.current)) mesclados = removerParticipantesOnlineNaoAssinados(mesclados)
      if (mesclados !== participantesAtuais) {
        try { await atualizarParticipantesAcaoSesmt(acaoAtual.id, mesclados) } catch { /* tenta de novo na próxima sincronização */ }
        const atualizada = { ...acaoAtual, participantes: mesclados }
        setDetalhe(d => (d && d.id === atualizada.id ? atualizada : d))
        setAcoes(lista => lista.map(a => a.id === atualizada.id ? atualizada : a))
      }
    } catch { /* silencioso — próxima tentativa (polling ou atualizar manual) tenta de novo */ }
  }

  // ── Compartilhar/PDF do card de detalhe — mesmo padrão de R6ResultadoReg.jsx
  // (lib/compartilhar.js): no app Android nativo (Capacitor), a Web Share API
  // com arquivo e o window.print() são inconsistentes dentro do WebView, então
  // usa a folha de compartilhamento nativa em vez deles; na web, mantém o
  // comportamento normal (Web Share API / popup de impressão).
  const blocoAssinaturaParticipante = (p) => p.assinatura_url
    ? `<img src="${p.assinatura_url}" crossorigin="anonymous" style="height:44px;max-width:140px;object-fit:contain;background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:2px;" />`
    : `<span style="font-size:12px;color:#d97706;font-weight:800;background:#fef3c7;padding:4px 10px;border-radius:6px;border:1.5px solid #fcd34d;white-space:nowrap;">⚠️ Não assinou</span>`

  const criarCanvasResumoDetalhe = async (acao) => {
    const tc = TIPOS_ACAO_SESMT[acao.tipo] || {}
    const participantes = acao.participantes || []
    const infoRow = (label, value) => value ? `
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e2e8f0;">
        <span style="color:#475569;font-weight:800;font-size:17px;min-width:120px;flex-shrink:0;">${label}</span>
        <span style="color:#0f172a;font-weight:800;font-size:17px;text-align:right;flex:1;padding-left:10px;">${value}</span>
      </div>` : ''

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4f8;padding:20px;box-sizing:border-box;width:520px;">
        <div style="background:${tc.bg};border:3px solid ${tc.border};border-radius:18px;padding:24px;text-align:center;margin-bottom:16px;">
          <div style="font-size:52px;margin-bottom:10px;">${tc.emoji}</div>
          <div style="font-size:26px;font-weight:900;color:${tc.color};margin-bottom:6px;">${tc.label}</div>
          <div style="font-size:15px;color:${tc.color};opacity:0.9;font-weight:600;">${participantes.length} participante(s)</div>
        </div>

        <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:18px;margin-bottom:16px;">
          <p style="font-size:17px;font-weight:900;color:#1e293b;margin:0 0 12px 0;">Dados da Ação</p>
          ${infoRow('Usuário', acao.fiscal)}
          ${infoRow('Matrícula', acao.matricula_fiscal)}
          ${infoRow('Data / Hora', `${formatData(acao.data_registro)} às ${acao.hora_registro}`)}
          ${acao.endereco ? infoRow('Local', acao.endereco) : ''}
          ${infoRow('Tema', acao.tema)}
          ${infoRow('Motivo', acao.motivo)}
        </div>

        ${acao.observacao ? `
        <div style="background:#fffbeb;border:2px solid #fcd34d;border-radius:16px;padding:18px;margin-bottom:16px;">
          <p style="font-size:14px;font-weight:900;color:#92400e;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:0.5px;">Observação:</p>
          <p style="font-size:17px;color:#1e293b;font-weight:600;line-height:1.6;margin:0;">${acao.observacao}</p>
        </div>` : ''}

        <div style="background:#f0fdf4;border:2px solid #86efac;border-radius:16px;padding:18px;margin-bottom:16px;">
          <p style="font-size:17px;font-weight:900;color:#15803d;margin:0 0 12px 0;">✅ Participantes (${participantes.length})</p>
          ${participantes.map((p, i) => `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 0;${i < participantes.length - 1 ? 'border-bottom:1px solid #bbf7d0;' : ''}">
              <div style="flex:1;min-width:0;">
                <span style="font-size:17px;font-weight:900;color:#15803d;">${i + 1}. ${p.nome}</span>
                ${p.chapa ? `<span style="font-size:14px;color:#475569;font-weight:700;margin-left:8px;">Mat: ${p.chapa}</span>` : ''}
              </div>
              <div style="flex-shrink:0;text-align:right;">${blocoAssinaturaParticipante(p)}</div>
            </div>`).join('')}
        </div>

        ${(acao.fotos_urls || []).length > 0 ? `
        <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:16px 18px;margin-bottom:16px;">
          <p style="font-size:17px;font-weight:900;color:#1e293b;margin:0 0 12px 0;">📷 Fotos (${acao.fotos_urls.length})</p>
          <div style="display:grid;grid-template-columns:repeat(${Math.min(acao.fotos_urls.length, 3)},1fr);gap:8px;">
            ${acao.fotos_urls.map(url => `
              <img src="${url}" crossorigin="anonymous" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;display:block;border:1px solid #e2e8f0;" onerror="this.style.display='none'" />
            `).join('')}
          </div>
        </div>` : ''}

        <div style="border-top:2px solid #e2e8f0;padding-top:14px;text-align:center;">
          <p style="font-size:13px;color:#64748b;margin:0;font-weight:700;">VérticeGP · Plataforma de Gestão Operacional</p>
          <p style="font-size:12px;color:#94a3b8;margin:4px 0 0 0;">Gerado em ${new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })}</p>
        </div>
      </div>`

    return renderizarHtmlParaCanvas(html, { largura: 520, escala: 6, aguardarImagens: true, esperaExtraMs: 80, exigirNaturalWidth: true })
  }

  const compartilharWhatsAppDetalhe = async () => {
    if (!detalhe) return
    setCapturando(true)
    try {
      const tc = TIPOS_ACAO_SESMT[detalhe.tipo] || {}
      const canvas = await criarCanvasResumoDetalhe(detalhe)
      const nomeArq = `${tc.label || 'Acao_SESMT'}_${detalhe.data_registro}.png`.replace(/\s+/g, '_')

      if (Capacitor.isNativePlatform()) {
        await compartilharImagemNativo(canvas, nomeArq, { titulo: tc.label })
      } else if (navigator.share && navigator.canShare) {
        canvas.toBlob(async blob => {
          const file = new File([blob], nomeArq, { type: 'image/png' })
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: tc.label })
          } else {
            const link = document.createElement('a')
            link.download = nomeArq; link.href = canvas.toDataURL('image/png'); link.click()
          }
        }, 'image/png')
      } else {
        const link = document.createElement('a')
        link.download = nomeArq; link.href = canvas.toDataURL('image/png'); link.click()
      }
    } catch (err) {
      console.error('Erro ao gerar imagem:', err)
      alert('Não foi possível gerar a imagem: ' + descreverErro(err))
    } finally {
      setCapturando(false)
    }
  }

  const montarConteudoImpressaoDetalhe = (acao) => {
    const tc = TIPOS_ACAO_SESMT[acao.tipo] || {}
    const participantes = acao.participantes || []
    return `
    <div style="background:linear-gradient(135deg,#92400e,#d97706);color:#fff;padding:20px 24px;border-radius:14px;margin-bottom:16px;">
      <div style="font-size:11px;opacity:0.7;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">Plataforma de Gestão Operacional</div>
      <div style="font-size:20px;font-weight:800;">${tc.emoji} ${tc.label}</div>
    </div>
    <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:4px 0;margin-bottom:16px;">
      <table style="width:100%;border-collapse:collapse;">
        ${[['Usuário', acao.fiscal], ['Matrícula', acao.matricula_fiscal], ['Data/Hora', `${formatData(acao.data_registro)} às ${acao.hora_registro}`],
           ['Local', acao.endereco], ['Tema', acao.tema], ['Motivo', acao.motivo]]
          .filter(([, v]) => v)
          .map(([l, v]) => `<tr><td style="padding:8px 12px;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;width:140px;">${l}</td><td style="padding:8px 12px;color:#1e293b;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">${v}</td></tr>`)
          .join('')}
      </table>
    </div>
    ${acao.observacao ? `
    <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px;">
      <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;">OBSERVAÇÃO</div>
      <div style="font-size:13px;color:#475569;line-height:1.7;">${acao.observacao}</div>
    </div>` : ''}
    <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;margin-bottom:16px;">
      <div style="padding:12px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;font-weight:700;color:#374151;">
        PARTICIPANTES (${participantes.length})
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="background:#92400e;">
          <th style="padding:8px 10px;color:#fff;font-size:12px;text-align:left;width:30px;">Nº</th>
          <th style="padding:8px 10px;color:#fff;font-size:12px;text-align:left;">Nome</th>
          <th style="padding:8px 10px;color:#fff;font-size:12px;">Matrícula</th>
          <th style="padding:8px 10px;color:#fff;font-size:12px;">Assinatura / Status</th>
        </tr>
        ${participantes.map((p, i) => `
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:8px 10px;font-size:13px;">${i + 1}</td>
            <td style="padding:8px 10px;font-size:13px;font-weight:600;">
              ${p.nome}
              ${p.modo === 'online' ? '<span style="font-size:10px;color:#1d4ed8;background:#dbeafe;padding:1px 5px;border-radius:4px;margin-left:4px;">🔗 online</span>' : ''}
            </td>
            <td style="padding:8px 10px;font-size:13px;text-align:center;">${p.chapa || '—'}</td>
            <td style="padding:4px 8px;">
              ${p.assinatura_url
                ? `<img src="${p.assinatura_url}" style="height:40px;max-width:120px;object-fit:contain;"/>`
                : '<span style="font-size:11px;color:#d97706;background:#fef3c7;padding:2px 8px;border-radius:4px;border:1px solid #fcd34d;">⚠️ Não assinou</span>'
              }
            </td>
          </tr>`).join('')}
      </table>
    </div>
    <div style="border-top:1px solid #e2e8f0;padding-top:14px;text-align:center;">
      <p style="font-size:11px;color:#94a3b8;">VérticeGP · Plataforma de Gestão Operacional</p>
      <p style="font-size:10px;color:#cbd5e1;margin-top:2px;">Gerado em ${new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })}</p>
    </div>`
  }

  // Web: abre popup com o relatório e chama print() nele.
  const imprimirPDFDetalhe = (acao) => {
    const tc = TIPOS_ACAO_SESMT[acao.tipo] || {}
    const conteudo = montarConteudoImpressaoDetalhe(acao)
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
    <title>${tc.label}</title>
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
  const gerarPDFDetalhe = async () => {
    if (!detalhe) return
    if (!Capacitor.isNativePlatform()) { imprimirPDFDetalhe(detalhe); return }
    setGerandoPDF(true)
    try {
      const tc = TIPOS_ACAO_SESMT[detalhe.tipo] || {}
      const conteudo = montarConteudoImpressaoDetalhe(detalhe)
      const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;padding:24px;box-sizing:border-box;width:700px;color:#1e293b;">${conteudo}</div>`
      const canvas = await renderizarHtmlParaCanvas(html, { largura: 700, escala: 4, aguardarImagens: true, esperaExtraMs: 80, exigirNaturalWidth: true, corFundo: '#fff' })
      const nomeArq = `${tc.label || 'Acao_SESMT'}_${detalhe.data_registro}.pdf`.replace(/\s+/g, '_')
      await compartilharPDFNativo(canvas, nomeArq, { titulo: tc.label })
    } catch (err) {
      console.error('Erro ao gerar PDF:', err)
      alert('Não foi possível gerar o PDF: ' + descreverErro(err))
    } finally {
      setGerandoPDF(false)
    }
  }

  const abrirDetalhe = (a) => {
    setDetalhe(a)
    setTokenDetalhe(null)
    sincronizarDetalhe(a)
    buscarTokenMaisRecenteSesmtPorAcao(a.id).then(setTokenDetalhe).catch(() => {})
  }

  const fecharDetalhe = () => { setDetalhe(null); setTokenDetalhe(null); setMostrarLinkModal(false) }

  const atualizarDetalheManual = async () => {
    setSincronizando(true)
    try { await sincronizarDetalhe(detalheRef.current) } finally { setSincronizando(false) }
  }

  useEffect(() => {
    if (!detalhe) return
    const id = setInterval(() => { sincronizarDetalhe(detalheRef.current) }, 8000)
    return () => clearInterval(id)
  }, [detalhe?.id])

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>
      <div style={{ background: 'linear-gradient(135deg, #92400e, #d97706)', padding: '18px 20px', color: '#fff' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14 }}>
            ← Voltar
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800 }}>📂 Histórico — Ações SESMT</h1>
              <p style={{ fontSize: 12, opacity: 0.8, marginTop: 3 }}>Diálogo de Segurança, Treinamento e Reciclagem já registrados</p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '6px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{acoes.length}</div>
              <div style={{ fontSize: 9, opacity: 0.85 }}>Total</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '16px 16px 80px' }}>
        <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #e2e8f0', padding: '16px 18px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          {/* Header — mesmo padrão do painel de filtros de Registros Operacionais */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap', gap: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              🔍 Filtros
              <span style={{ fontSize: 10, fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>SESMT</span>
            </p>
            {temFiltrosAtivos && (
              <button onClick={limparFiltros} style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', padding: '4px 10px', borderRadius: 6, cursor: 'pointer' }}>
                ✕ Limpar filtros
              </button>
            )}
          </div>

          {/* Grid de campos */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, alignItems: 'flex-start' }}>
            <div>
              <label style={LABEL_STYLE}>Período</label>

              <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 3, gap: 2, marginBottom: 8, height: FIELD_HEIGHT, boxSizing: 'border-box' }}>
                {[['hoje', '📍 Hoje'], ['mes', '📅 Mês'], ['periodo', '📆 Período']].map(([v, label]) => (
                  <button key={v} type="button" onClick={() => {
                    setTipoPeriodo(v)
                    if (v === 'periodo' && !dataIni) { const hoje = calcHoje(); setDataIni(hoje); setDataFim(hoje) }
                    if (v === 'mes' && !mesAno) setMesAno(calcMesAtual())
                  }} style={{
                    flex: 1, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all 0.2s',
                    background: tipoPeriodo === v ? '#fff' : 'transparent',
                    color: tipoPeriodo === v ? '#1e3a5f' : '#64748b',
                    boxShadow: tipoPeriodo === v ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    whiteSpace: 'nowrap',
                  }}>{label}</button>
                ))}
              </div>

              {tipoPeriodo === 'hoje' && (
                <div style={{ ...INPUT_STYLE, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#eff6ff', color: '#1e3a5f', borderColor: '#bfdbfe' }}>
                  <span>Hoje</span>
                  <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 800 }}>{fmtData(calcHoje())}</span>
                </div>
              )}

              {tipoPeriodo === 'mes' && (
                <select value={mesAno} onChange={e => setMesAno(e.target.value)} style={{ ...INPUT_STYLE, cursor: 'pointer' }}>
                  {Array.from({ length: 6 }, (_, i) => {
                    const d = new Date(); d.setMonth(d.getMonth() - 5 + i)
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                  }).map(m => (
                    <option key={m} value={m}>{mesLabel(m)}{m === calcMesAtual() ? ' ← atual' : ''}</option>
                  ))}
                </select>
              )}

              {tipoPeriodo === 'periodo' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, marginBottom: 3, letterSpacing: 0.5 }}>DE</p>
                    <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} style={{ ...INPUT_STYLE, padding: '0 10px', fontSize: 12, cursor: 'pointer' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, marginBottom: 3, letterSpacing: 0.5 }}>ATÉ</p>
                    <input type="date" value={dataFim} min={dataIni} onChange={e => setDataFim(e.target.value)} style={{ ...INPUT_STYLE, padding: '0 10px', fontSize: 12, cursor: 'pointer' }} />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label style={LABEL_STYLE}>Regional</label>
              <select value={regional} onChange={e => setRegional(e.target.value)} style={{ ...INPUT_STYLE, cursor: 'pointer' }}>
                <option value="">Todas</option>
                {REGIONAIS_SESMT.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </div>

            <div>
              <label style={LABEL_STYLE}>Tipo</label>
              <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ ...INPUT_STYLE, cursor: 'pointer' }}>
                <option value="">Todos</option>
                {Object.entries(TIPOS_ACAO_SESMT).map(([k, t]) => <option key={k} value={k}>{t.emoji} {t.label}</option>)}
              </select>
            </div>

            <div>
              <label style={LABEL_STYLE}>Usuário</label>
              <input value={fiscal} onChange={e => setFiscal(e.target.value)} placeholder="Nome do usuário" style={INPUT_STYLE} />
            </div>
          </div>

          {(tipoPeriodo === 'hoje' || tipoPeriodo === 'periodo') && (
            <div style={{ fontSize: 11, color: tipoPeriodo === 'periodo' && !dataIni ? '#d97706' : '#1d4ed8', fontWeight: 700, marginTop: 10, textAlign: 'right' }}>
              {tipoPeriodo === 'periodo' && !dataIni ? '⚠️ Selecione a data inicial para aplicar' : `📆 Filtrando: ${periodoLabel}`}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={buscar} style={{ padding: '10px 20px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              🔍 Buscar
            </button>
            <button onClick={exportarExcel} disabled={exportando || acoes.length === 0} style={{
              padding: '10px 20px', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', borderRadius: 10,
              fontSize: 13, fontWeight: 700, cursor: (exportando || acoes.length === 0) ? 'not-allowed' : 'pointer',
              opacity: (exportando || acoes.length === 0) ? 0.6 : 1,
            }}>
              {exportando ? '⏳ Gerando...' : '📥 Exportar Excel'}
            </button>
          </div>
        </div>

        {loading ? (
          <CarregandoHexagono texto="Carregando ações..." />
        ) : erro ? (
          <p style={{ color: '#dc2626', fontWeight: 700, textAlign: 'center', padding: 20 }}>⚠️ {erro}</p>
        ) : acoes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🦺</div>
            <p>Nenhuma ação encontrada no período.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {acoes.map(a => {
              const tc = TIPOS_ACAO_SESMT[a.tipo] || {}
              const qtdParticipantes = Array.isArray(a.participantes) ? a.participantes.length : 0
              const qtdAssinados = Array.isArray(a.participantes) ? a.participantes.filter(p => p.assinatura_url).length : 0
              return (
                <div key={a.id} onClick={() => abrirDetalhe(a)} style={{
                  background: '#fff', borderRadius: 14, border: `1.5px solid ${tc.border || '#e2e8f0'}`,
                  padding: '14px 16px', cursor: 'pointer',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 18 }}>{tc.emoji}</span>
                        <span style={{ fontSize: 15, fontWeight: 800, color: tc.color || '#1e293b' }}>{tc.label}</span>
                      </div>
                      {a.tema && <p style={{ fontSize: 13, color: '#374151', fontWeight: 600, marginBottom: 4 }}>{a.tema}</p>}
                      <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.7 }}>
                        <span>👤 {a.fiscal}</span>
                        <span style={{ margin: '0 8px' }}>·</span>
                        <span>📅 {formatData(a.data_registro)} às {a.hora_registro}</span>
                        <span style={{ margin: '0 8px' }}>·</span>
                        <span>✍️ {qtdAssinados}/{qtdParticipantes} assinado(s)</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 18, color: '#94a3b8', marginLeft: 8 }}>›</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {detalhe && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) fecharDetalhe() }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', padding: '24px 20px 40px' }}>
            {(() => {
              const tc = TIPOS_ACAO_SESMT[detalhe.tipo] || {}
              const participantes = detalhe.participantes || []
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ fontSize: 17, fontWeight: 800 }}>{tc.emoji} {tc.label}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <button onClick={atualizarDetalheManual} disabled={sincronizando} style={{ background: 'none', border: 'none', fontSize: 12, fontWeight: 700, color: '#0f766e', cursor: sincronizando ? 'default' : 'pointer' }}>
                        {sincronizando ? '⏳ Atualizando...' : '🔄 Atualizar'}
                      </button>
                      <button onClick={() => fecharDetalhe()} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#64748b' }}>×</button>
                    </div>
                  </div>

                  <div style={{ background: tc.bg, border: `2px solid ${tc.border}`, borderRadius: 14, padding: 16, textAlign: 'center', marginBottom: 16 }}>
                    <div style={{ fontSize: 40, marginBottom: 6 }}>{tc.emoji}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: tc.color }}>{tc.label}</div>
                    <div style={{ fontSize: 13, color: tc.color, opacity: 0.85, marginTop: 4 }}>{participantes.length} participante(s)</div>
                  </div>

                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                    {[
                      ['Usuário',   detalhe.fiscal],
                      ['Matrícula', detalhe.matricula_fiscal],
                      ['Data/Hora', `${formatData(detalhe.data_registro)} às ${detalhe.hora_registro}`],
                      ['Local',     detalhe.endereco || (detalhe.lat ? `${detalhe.lat}, ${detalhe.lng}` : null)],
                      ['Tema',      detalhe.tema],
                      ['Motivo',    detalhe.motivo],
                    ].filter(([, v]) => v).map(([l, v]) => (
                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                        <span style={{ color: '#94a3b8', fontWeight: 500 }}>{l}</span>
                        <span style={{ color: '#1e293b', fontWeight: 600, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{v}</span>
                      </div>
                    ))}
                  </div>

                  {tokenDetalhe && (() => {
                    const encerrado = tokenDetalhe.status === 'ENCERRADO'
                    const expirado  = !encerrado && new Date(tokenDetalhe.expires_at) < new Date()
                    const ativo     = !encerrado && !expirado
                    return (
                      <div style={{ background: '#f0fdfa', border: '1.5px solid #99f6e4', borderRadius: 12, padding: '12px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 700, color: ativo ? '#0f766e' : '#94a3b8', margin: 0 }}>
                            {ativo ? '✅ Link ativo' : encerrado ? '🔒 Link encerrado' : '⏰ Link expirado'}
                          </p>
                          <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>
                            {tokenDetalhe.modo === 'AUTOATENDIMENTO' ? 'QR de autoatendimento' : 'Link online'}
                            {ativo ? ` · expira às ${new Date(tokenDetalhe.expires_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                          </p>
                        </div>
                        <button onClick={() => setMostrarLinkModal(true)} style={{ padding: '8px 14px', borderRadius: 10, border: '1.5px solid #0f766e', background: '#fff', color: '#0f766e', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          🔗 Ver link/QR
                        </button>
                      </div>
                    )
                  })()}

                  {detalhe.observacao && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>OBSERVAÇÃO:</p>
                      <p style={{ fontSize: 13, color: '#78350f', lineHeight: 1.6 }}>{detalhe.observacao}</p>
                    </div>
                  )}

                  <div style={{ marginBottom: 14 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>✅ Participantes ({participantes.length})</p>
                    {participantes.map((p, i) => {
                      const assinado = Boolean(p.assinatura_url)
                      return (
                        <div key={i} style={{
                          background: assinado ? '#f0fdf4' : '#fffbeb',
                          border: `1px solid ${assinado ? '#86efac' : '#fcd34d'}`,
                          borderRadius: 10, padding: '10px 12px', marginBottom: 8,
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: assinado ? '#15803d' : '#92400e' }}>{i + 1}. {p.nome}</span>
                              {p.modo === 'online' && <span style={{ fontSize: 10, fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', padding: '1px 6px', borderRadius: 4 }}>🔗 online</span>}
                            </div>
                            {p.chapa && <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>Matrícula: {p.chapa}</p>}
                            {p.endereco_assinatura && (
                              <p style={{ fontSize: 11, color: '#15803d', margin: '4px 0 0', display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                                <span style={{ flexShrink: 0 }}>📍</span><span>{p.endereco_assinatura}</span>
                              </p>
                            )}
                            {assinado && detalhe.lat && p.lat && (() => {
                              const dist = distanciaMetrosSesmt(detalhe.lat, detalhe.lng, p.lat, p.lng)
                              const suspeita = dist > LIMITE_DISTANCIA_SUSPEITA_M
                              return (
                                <p style={{ fontSize: 11, fontWeight: suspeita ? 800 : 500, color: suspeita ? '#dc2626' : '#94a3b8', margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  {suspeita ? '🚩' : '📏'} {formatarDistancia(dist)} do local da ação{suspeita ? ' — verificar' : ''}
                                </p>
                              )
                            })()}
                            {!assinado && <p style={{ fontSize: 11, color: '#d97706', fontWeight: 600, margin: '4px 0 0' }}>⚠️ Não assinou</p>}
                          </div>
                          {assinado && (
                            <img src={p.assinatura_url} alt="assinatura" style={{ height: 36, maxWidth: 90, objectFit: 'contain', borderRadius: 6, background: '#fff', border: '1px solid #e2e8f0' }} />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {Array.isArray(detalhe.fotos_urls) && detalhe.fotos_urls.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>📷 Fotos ({detalhe.fotos_urls.length})</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {detalhe.fotos_urls.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer">
                            <img src={url} alt={`Foto ${i + 1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <button onClick={compartilharWhatsAppDetalhe} disabled={capturando} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: capturando ? '#64748b' : '#25d366', color: '#fff', fontSize: 14, fontWeight: 700, cursor: capturando ? 'default' : 'pointer', marginBottom: 10 }}>
                    {capturando ? '⏳ Gerando...' : '📤 Compartilhar no WhatsApp'}
                  </button>

                  <button onClick={gerarPDFDetalhe} disabled={gerandoPDF} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: gerandoPDF ? '#64748b' : '#7c3aed', color: '#fff', fontSize: 14, fontWeight: 700, cursor: gerandoPDF ? 'default' : 'pointer', marginBottom: 10 }}>
                    {gerandoPDF ? '⏳ Gerando PDF...' : '🖨️ Gerar PDF / Imprimir'}
                  </button>

                  <button onClick={() => fecharDetalhe()} style={{ width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    Fechar
                  </button>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {mostrarLinkModal && tokenDetalhe && detalhe && (
        <ModalLinkAssinaturaSesmt
          acaoId={detalhe.id}
          tipoLabel={(TIPOS_ACAO_SESMT[detalhe.tipo] || {}).label}
          modo={tokenDetalhe.modo}
          tokenInicial={tokenDetalhe}
          onTokenAtualizado={setTokenDetalhe}
          participantesAtuais={detalhe.participantes || []}
          onParticipantesSincronizados={novos => {
            const atualizada = { ...detalhe, participantes: novos }
            setDetalhe(atualizada)
            setAcoes(lista => lista.map(a => a.id === atualizada.id ? atualizada : a))
          }}
          onFechar={() => setMostrarLinkModal(false)}
        />
      )}
    </div>
  )
}
