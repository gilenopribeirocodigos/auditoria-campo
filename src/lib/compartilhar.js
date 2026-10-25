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

// ─── WhatsApp no navegador DESKTOP (PC) ──────────────────────────────────
// navigator.share() no Windows abre o painel de compartilhar do próprio
// Windows — que só lista o WhatsApp se o app DESKTOP estiver instalado;
// quem só usa WhatsApp Web no navegador cai num "Instalar" sem saída. No
// celular isso não acontece (o painel do Android/iPhone já inclui o
// WhatsApp instalado), então lá o navigator.share continua sendo usado
// normalmente — esse helper é só pro caso do desktop.
export function ehNavegadorMobile() {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

// Baixa a imagem direto (sem passar pelo painel de compartilhar do SO).
export function baixarImagemCanvas(canvas, nomeArquivo, tipo = 'image/png', qualidade) {
  const link = document.createElement('a')
  link.download = nomeArquivo
  link.href = canvas.toDataURL(tipo, qualidade)
  link.click()
}

// Abre o WhatsApp Web (não o app nativo) numa aba nova, com uma mensagem
// pronta — sem passar pelo painel de compartilhar do Windows. Sem número
// de telefone (a pessoa escolhe o contato/grupo lá dentro), mesmo espírito
// do botão atual onde o destinatário é escolhido na hora.
export function abrirWhatsAppWeb(mensagem) {
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(mensagem)}`, '_blank', 'noopener')
}

// Compartilhamento no navegador (não nativo): mobile usa a Web Share API
// normalmente (já funciona bem); desktop baixa a imagem e abre o WhatsApp
// Web com um aviso pra anexar o arquivo baixado, em vez de cair no painel
// de compartilhar do Windows. `mensagem` é opcional — quando quem chama
// não passa um texto próprio, usa a frase genérica padrão.
export async function compartilharImagemWeb(canvas, nomeArquivo, { titulo = '', tipo = 'image/png', qualidade, mensagem } = {}) {
  if (ehNavegadorMobile() && navigator.share && navigator.canShare) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, tipo, qualidade))
    const file = new File([blob], nomeArquivo, { type: tipo })
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: titulo })
      return
    }
  }
  baixarImagemCanvas(canvas, nomeArquivo, tipo, qualidade)
  abrirWhatsAppWeb(mensagem || `Segue em anexo${titulo ? ` o relatório de ${titulo}` : ''} — anexe a imagem "${nomeArquivo}" que acabou de baixar.`)
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
  // `compress: true` é o que realmente resolvia o travamento: sem ele, o
  // jsPDF embute a imagem como pixels brutos (RGB sem compactação) dentro do
  // PDF — uma tabela de só 5 participantes virava um PDF de ~11 MB de
  // base64 (confirmado em teste isolado). Esse base64 gigante precisa
  // atravessar a ponte nativa do Capacitor (Filesystem.writeFile), que é
  // conhecida por travar/congelar em Android com payloads grandes — isso, e
  // não a quantidade de participantes ou a rede, era a causa real do
  // travamento. Com compress:true (deflate nos streams do PDF) uma imagem
  // majoritariamente branca cai pra dezenas/centenas de KB.
  const doc = new jsPDF({
    unit:      'px',
    format:    [paginas[0].width, paginas[0].height],
    hotfixes:  ['px_scaling'],
    compress:  true,
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
// Os parâmetros (escala, espera extra) existem porque cada tela já tinha o
// próprio ajuste fino de timing pro html2canvas — mantemos o comportamento
// exato de cada uma em vez de forçar um padrão único.
// Timeout por imagem (8s) — sem isso, uma única assinatura/foto que trave pra
// baixar (rede fraca, muitos participantes assinando ao mesmo tempo) faz a
// espera nunca terminar. Roda em paralelo pra todas as imagens, então o
// atraso total do pior caso é ~8s, não 8s por imagem.
//
// IMPORTANTE: não basta só ESPERAR a imagem carregar antes de chamar o
// html2canvas — ele faz o PRÓPRIO carregamento de rede internamente (pra
// poder desenhar no canvas), sem nenhum timeout embutido. Uma assinatura/foto
// hospedada no Supabase Storage com rede lenta/instável travava o html2canvas
// nesse carregamento interno mesmo com a imagem já tendo disparado onload
// aqui fora — foi isso que continuou travando o "Gerar PDF" mesmo em cards
// pequenos. A solução definitiva é buscar cada imagem remota nós mesmos (com
// timeout de verdade via AbortController) e trocar o src por um data: URI
// local ANTES de chamar o html2canvas — assim ele nunca precisa acessar a
// rede, só desenha o que já está em memória. Usado tanto por
// renderizarHtmlParaCanvas (HTML montado como string) quanto por
// renderizarElementoVisivelParaCanvas (elemento já na tela, clonado antes de
// capturar).
const TIMEOUT_IMG_MS = 8000

async function converterParaDataUri(url, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resposta = await fetch(url, { signal: controller.signal })
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`)
    const blob = await resposta.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload  = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error || new Error('Falha ao ler imagem'))
      reader.readAsDataURL(blob)
    })
  } finally {
    clearTimeout(timer)
  }
}

async function converterImagensParaDataUri(container, timeoutMs = TIMEOUT_IMG_MS) {
  const imgs = Array.from(container.querySelectorAll('img'))
  await Promise.allSettled(imgs.map(async img => {
    const src = img.getAttribute('src') || ''
    if (!src || src.startsWith('data:')) return
    try {
      img.src = await converterParaDataUri(src, timeoutMs)
      // Decode de um data: URI é local (sem rede) e normalmente instantâneo,
      // mas ainda é assíncrono no browser — espera com um teto curto só por
      // segurança.
      if (!img.complete) {
        await new Promise(res => {
          const t = setTimeout(res, 1000)
          img.onload  = () => { clearTimeout(t); res() }
          img.onerror = () => { clearTimeout(t); res() }
        })
      }
    } catch {
      // Imagem indisponível (rede caiu, CORS, 404) — remove em vez de
      // deixar o html2canvas tentar carregar do jeito antigo (que é
      // exatamente o caminho que travava).
      img.removeAttribute('src')
      img.style.display = 'none'
    }
  }))
}

export async function renderizarHtmlParaCanvas(html, {
  largura         = 520,
  escala          = 5,
  aguardarImagens = false,
  esperaExtraMs   = 0,
  corFundo        = '#f0f4f8',
} = {}) {
  const html2canvas = (await import('html2canvas')).default

  const div = document.createElement('div')
  div.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;'
  div.innerHTML = html
  document.body.appendChild(div)

  if (aguardarImagens) await converterImagensParaDataUri(div, TIMEOUT_IMG_MS)
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

// Mesma ideia de renderizarElementoParaCanvas, mas pra quando o elemento tem
// imagens remotas (fotos, assinaturas) — ex.: o próprio card/modal de
// detalhe já aberto na tela. Clona o elemento fora da tela (nunca mexe no que
// o usuário está vendo) e troca as imagens por data: URI com timeout antes de
// capturar, pelo mesmo motivo de renderizarHtmlParaCanvas (ver comentário em
// converterImagensParaDataUri): sem isso, uma foto/assinatura do Supabase
// Storage com rede lenta trava o html2canvas. Usado quando o "card"
// compartilhado precisa sair IDÊNTICO ao que já está renderizado na tela, em
// vez de remontado à parte como HTML string (fonte de divergência visual).
export async function renderizarElementoVisivelParaCanvas(elemento, { escala = 4, corFundo = '#ffffff', esperaExtraMs = 0 } = {}) {
  const html2canvas = (await import('html2canvas')).default

  const clone = elemento.cloneNode(true)
  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;'
  wrapper.style.width = `${elemento.offsetWidth}px`
  wrapper.appendChild(clone)
  document.body.appendChild(wrapper)

  try {
    await converterImagensParaDataUri(clone, TIMEOUT_IMG_MS)
    if (esperaExtraMs > 0) await new Promise(r => setTimeout(r, esperaExtraMs))
    return await html2canvas(clone, {
      scale:           escala,
      useCORS:         true,
      allowTaint:      true,
      backgroundColor: corFundo,
      logging:         false,
    })
  } finally {
    document.body.removeChild(wrapper)
  }
}
