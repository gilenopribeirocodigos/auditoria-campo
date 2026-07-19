// Compartilhamento de imagem/PDF no app Android nativo.
//
// Contexto: os botões "Compartilhar no WhatsApp" (Web Share API com arquivo)
// e "Gerar PDF/Imprimir" (window.print()) dependem de recursos do NAVEGADOR
// que não existem (ou são inconsistentes) dentro do WebView embutido do
// Capacitor — por isso funcionavam na versão web mas não no app instalado.
// Este módulo só entra em ação quando Capacitor.isNativePlatform() é true;
// a versão web continua usando exatamente o código de sempre (não é tocada).
import { Share } from '@capacitor/share'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { jsPDF } from 'jspdf'

// Formata qualquer forma de erro (Error, string, objeto de plugin nativo)
// numa mensagem legível — usado nos alertas de diagnóstico dos botões de
// compartilhar/PDF, pra não esconder o motivo real de uma falha no app nativo.
export function descreverErro(err) {
  if (!err) return 'erro desconhecido'
  if (typeof err === 'string') return err
  return err.message || err.errorMessage || JSON.stringify(err)
}

async function salvarNoCacheEObterUri(nomeArquivo, base64) {
  await Filesystem.writeFile({ path: nomeArquivo, data: base64, directory: Directory.Cache })
  const { uri } = await Filesystem.getUri({ path: nomeArquivo, directory: Directory.Cache })
  return uri
}

// Compartilha um canvas (já renderizado via html2canvas) como imagem PNG,
// usando a folha de compartilhamento nativa do Android (inclui WhatsApp).
export async function compartilharImagemNativo(canvas, nomeArquivo, { titulo = '', texto = '' } = {}) {
  const base64 = canvas.toDataURL('image/png').split(',')[1]
  const uri = await salvarNoCacheEObterUri(nomeArquivo, base64)
  await Share.share({ title: titulo, text: texto, url: uri, dialogTitle: 'Compartilhar' })
}

// O PDF usa o tamanho do canvas como o tamanho da própria página (em "px").
// Como esses canvases são renderizados em alta resolução (escala 4-8, pra
// ficarem nítidos como imagem do WhatsApp), um relatório longo com fotos
// pode virar um canvas de dezenas de milhões de pixels — o que travava o
// jsPDF tentando montar uma página de vários metros de altura. Reduz pra um
// teto razoável antes de montar o PDF (não afeta a imagem do WhatsApp, que
// usa o canvas original direto).
const MAX_PIXELS_PDF = 8_000_000

function limitarCanvasParaPDF(canvas) {
  const pixels = canvas.width * canvas.height
  if (pixels <= MAX_PIXELS_PDF) return canvas
  const fator = Math.sqrt(MAX_PIXELS_PDF / pixels)
  const menor = document.createElement('canvas')
  menor.width  = Math.max(1, Math.round(canvas.width * fator))
  menor.height = Math.max(1, Math.round(canvas.height * fator))
  menor.getContext('2d').drawImage(canvas, 0, 0, menor.width, menor.height)
  return menor
}

// Monta um PDF de verdade (uma página, do tamanho exato do canvas) a partir
// de um canvas já renderizado via html2canvas, e compartilha via folha
// nativa do Android.
export async function compartilharPDFNativo(canvas, nomeArquivo, opcoes = {}) {
  return compartilharPDFMultiplasPaginasNativo([canvas], nomeArquivo, opcoes)
}

// Mesma ideia, mas com um canvas por página (ex.: relatório de evidências,
// um slide por registro) — cada página do PDF fica do tamanho exato do
// canvas correspondente.
export async function compartilharPDFMultiplasPaginasNativo(canvases, nomeArquivo, { titulo = '', texto = '' } = {}) {
  if (!canvases.length) throw new Error('Nenhuma página pra gerar o PDF.')
  const paginas = canvases.map(limitarCanvasParaPDF)
  const doc = new jsPDF({
    unit:      'px',
    format:    [paginas[0].width, paginas[0].height],
    hotfixes:  ['px_scaling'],
  })
  paginas.forEach((canvas, i) => {
    if (i > 0) doc.addPage([canvas.width, canvas.height], canvas.width >= canvas.height ? 'l' : 'p')
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvas.width, canvas.height)
  })
  const base64 = doc.output('datauristring').split(',')[1]
  const uri = await salvarNoCacheEObterUri(nomeArquivo, base64)
  await Share.share({ title: titulo, text: texto, url: uri, dialogTitle: 'Compartilhar PDF' })
}

// Renderiza uma string HTML (mesmo padrão usado nas telas de resultado/
// relatório) fora da tela e devolve o canvas pronto — reaproveitado tanto
// pra imagem quanto pra PDF, sem duplicar a montagem do HTML.
// Os parâmetros (escala, espera extra, exigirNaturalWidth) existem porque
// cada tela já tinha o próprio ajuste fino de timing pro html2canvas —
// mantemos o comportamento exato de cada uma em vez de forçar um padrão único.
export async function renderizarHtmlParaCanvas(html, {
  largura            = 520,
  escala             = 5,
  aguardarImagens    = false,
  esperaExtraMs      = 0,
  exigirNaturalWidth = false,
  corFundo           = '#f0f4f8',
} = {}) {
  const html2canvas = (await import('html2canvas')).default

  const div = document.createElement('div')
  div.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;'
  div.innerHTML = html
  document.body.appendChild(div)

  if (aguardarImagens) {
    const imgs = div.querySelectorAll('img')
    await Promise.allSettled(Array.from(imgs).map(img =>
      new Promise(res => {
        const pronta = exigirNaturalWidth ? (img.complete && img.naturalWidth > 0) : img.complete
        if (pronta) res()
        else { img.onload = res; img.onerror = res }
      })
    ))
  }
  if (esperaExtraMs > 0) await new Promise(r => setTimeout(r, esperaExtraMs))

  try {
    return await html2canvas(div.firstElementChild, {
      scale:           escala,
      useCORS:         true,
      allowTaint:      true,
      backgroundColor: corFundo,
      logging:         false,
      windowWidth:     largura,
    })
  } finally {
    document.body.removeChild(div)
  }
}

// Captura um elemento DOM já visível na tela (ex.: a própria área "print-area"
// de um relatório) — usado quando a tela já renderiza o conteúdo em JSX/CSS
// de impressão, sem precisar remontar tudo como string HTML.
export async function renderizarElementoParaCanvas(elemento, { escala = 3, corFundo = '#ffffff' } = {}) {
  const html2canvas = (await import('html2canvas')).default
  return html2canvas(elemento, {
    scale:           escala,
    useCORS:         true,
    allowTaint:      true,
    backgroundColor: corFundo,
    logging:         false,
  })
}
