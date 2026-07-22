// Exportação da Prestação de Contas aprovada: Excel consolidado (mesmo
// layout da planilha CAIXA que o Gileno já usa) e fotos em lote (.zip),
// ordenadas por data/hora do comprovante.
import * as XLSX from 'xlsx'
import JSZip from 'jszip'

function salvarBlob(blob, nomeArquivo) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function formatarDataBr(dataIso) {
  if (!dataIso) return ''
  const [ano, mes, dia] = dataIso.split('-')
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : dataIso
}

function slugify(texto) {
  return (texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'item'
}

// ── Excel consolidado — mesmas 7 colunas da planilha CAIXA original ─────────
export function gerarExcelPrestacao(prestacao) {
  const itens = [...(prestacao.pc_itens || [])].sort((a, b) => a.ordem - b.ordem)

  const linhas = itens.map(item => ({
    'DESPESA - CLASSIFICAÇÃO': item.classificacao || '',
    'DESCRIÇAO': item.descricao || '',
    'FORNECEDOR': item.fornecedor || '',
    'FORMA DE PAGAMENTO': item.forma_pagamento || '',
    'NOTA FISCAL': item.tipo_comprovante || '',
    'DATA DA EMISSÃO': formatarDataBr(item.data_emissao),
    'Valor': Number(item.valor || 0),
  }))

  const ws = XLSX.utils.json_to_sheet(linhas)
  ws['!cols'] = [
    { wch: 22 }, { wch: 32 }, { wch: 26 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 12 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, prestacao.numero_pc.slice(0, 31))
  XLSX.writeFile(wb, `Prestacao_${prestacao.numero_pc}.xlsx`)
}

// ── Fotos em lote (.zip), ordenadas por data de emissão do item ─────────────
export async function baixarFotosEmLote(prestacao) {
  const pares = []
  for (const item of prestacao.pc_itens || []) {
    for (const foto of item.pc_fotos || []) {
      pares.push({ item, foto })
    }
  }
  if (pares.length === 0) throw new Error('Esta prestação não tem fotos anexadas.')

  pares.sort((a, b) => {
    const da = a.item.data_emissao || ''
    const db = b.item.data_emissao || ''
    if (da !== db) return da < db ? -1 : 1
    return (a.foto.capturada_em || '').localeCompare(b.foto.capturada_em || '')
  })

  const zip = new JSZip()
  let i = 1
  for (const { item, foto } of pares) {
    const resp = await fetch(foto.foto_url)
    if (!resp.ok) continue
    const blob = await resp.blob()
    const ext = blob.type.includes('png') ? 'png' : 'jpg'
    const dataStr = item.data_emissao || 'sem-data'
    const nome = `${String(i).padStart(2, '0')}_${dataStr}_${slugify(item.classificacao)}.${ext}`
    zip.file(nome, blob)
    i++
  }

  const conteudo = await zip.generateAsync({ type: 'blob' })
  salvarBlob(conteudo, `Fotos_${prestacao.numero_pc}.zip`)
}
