// Exportação CONSOLIDADA das prestações de contas aprovadas: um único
// Excel com os itens de todas as prestações selecionadas (mesmo layout da
// planilha CAIXA + colunas de rastreio de origem) e um único .zip com todas
// as fotos, em sequência por data/hora e renomeadas por item.
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

// ── Excel consolidado — 1 linha por item, de TODAS as prestações passadas ───
// prestacoes: [{ ...prestacao, remetente_nome }]
export function gerarExcelConsolidado(prestacoes) {
  const linhas = []
  for (const p of prestacoes) {
    const itens = [...(p.pc_itens || [])].sort((a, b) => a.ordem - b.ordem)
    for (const item of itens) {
      linhas.push({
        'Nº Prestação': p.numero_pc,
        'Solicitante': p.remetente_nome || '',
        'DESPESA - CLASSIFICAÇÃO': item.classificacao || '',
        'DESCRIÇAO': item.descricao || '',
        'FORNECEDOR': item.fornecedor || '',
        'FORMA DE PAGAMENTO': item.forma_pagamento || '',
        'NOTA FISCAL': item.tipo_comprovante || '',
        'DATA DA EMISSÃO': formatarDataBr(item.data_emissao),
        'Valor': Number(item.valor || 0),
      })
    }
  }
  if (linhas.length === 0) throw new Error('Nenhum item nas prestações selecionadas.')

  const ws = XLSX.utils.json_to_sheet(linhas)
  ws['!cols'] = [
    { wch: 20 }, { wch: 24 }, { wch: 22 }, { wch: 32 }, { wch: 26 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 12 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Prestações Aprovadas')

  const hoje = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `Prestacoes_Aprovadas_Consolidado_${hoje}.xlsx`)
}

// ── Fotos em lote consolidadas — 1 .zip com as fotos de TODAS as prestações
// passadas, em sequência única ordenada por data de emissão do item ─────────
export async function baixarFotosConsolidadas(prestacoes) {
  const pares = []
  for (const p of prestacoes) {
    for (const item of p.pc_itens || []) {
      for (const foto of item.pc_fotos || []) {
        pares.push({ prestacao: p, item, foto })
      }
    }
  }
  if (pares.length === 0) throw new Error('Nenhuma das prestações selecionadas tem fotos anexadas.')

  pares.sort((a, b) => {
    const da = a.item.data_emissao || ''
    const db = b.item.data_emissao || ''
    if (da !== db) return da < db ? -1 : 1
    return (a.foto.capturada_em || '').localeCompare(b.foto.capturada_em || '')
  })

  const zip = new JSZip()
  let i = 1
  for (const { prestacao, item, foto } of pares) {
    const resp = await fetch(foto.foto_url)
    if (!resp.ok) continue
    const blob = await resp.blob()
    const ext = blob.type.includes('png') ? 'png' : 'jpg'
    const dataStr = item.data_emissao || 'sem-data'
    const nome = `${String(i).padStart(3, '0')}_${dataStr}_${slugify(prestacao.numero_pc)}_${slugify(item.classificacao)}.${ext}`
    zip.file(nome, blob)
    i++
  }

  const conteudo = await zip.generateAsync({ type: 'blob' })
  const hoje = new Date().toISOString().slice(0, 10)
  salvarBlob(conteudo, `Fotos_Prestacoes_Aprovadas_${hoje}.zip`)
}
