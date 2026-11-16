// Agrega as prestações de um fechamento (já carregadas com pc_itens, via
// listarPrestacoesDoFechamento) nos recortes do "Relatório do Fechamento" —
// pensado pro financeiro, pra mandar junto com o Excel e as Fotos (.zip):
// por categoria de despesa, e "quem gastou mais" em cada dimensão (fiscal,
// colaborador, viatura, prefixo de equipe, base operacional).
import { labelCategoriaDespesa } from './categorias.js'

function normalizar(texto) {
  return (texto || '').trim()
}

// Soma valor e conta ocorrências por chave (nome/placa/prefixo/etc.),
// descartando entradas sem chave — devolve já ordenado do maior pro menor.
function agrupar(entradas) {
  const mapa = new Map()
  for (const { chave, valor } of entradas) {
    if (!chave) continue
    const atual = mapa.get(chave) || { nome: chave, qtd: 0, total: 0 }
    atual.qtd += 1
    atual.total += Number(valor) || 0
    mapa.set(chave, atual)
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total)
}

export function analisarFechamento(prestacoes) {
  const itens = prestacoes.flatMap(p => p.pc_itens || [])

  const porCategoria = agrupar(
    itens.map(i => ({ chave: i.categoria_despesa, valor: i.valor }))
  ).map(c => ({ ...c, label: labelCategoriaDespesa(c.nome) || c.nome }))

  // Mesmo item com colaborador_1 e colaborador_2 preenchidos conta o valor
  // integral pros dois — mesmo critério já usado em formatarAlocacao() pra
  // exibir "colaborador 1 | colaborador 2" (a despesa foi de ambos, não
  // dividida ao meio).
  const topColaboradores = agrupar(
    itens
      .filter(i => i.categoria_despesa === 'COLABORADOR')
      .flatMap(i => [
        { chave: normalizar(i.colaborador_1), valor: i.valor },
        { chave: normalizar(i.colaborador_2), valor: i.valor },
      ])
  )

  const topViaturas = agrupar(
    itens.filter(i => i.categoria_despesa === 'VIATURA')
      .map(i => ({ chave: normalizar(i.alocacao), valor: i.valor }))
  )

  const topPrefixos = agrupar(
    itens.filter(i => i.categoria_despesa === 'EQUIPE_PREFIXO')
      .map(i => ({ chave: normalizar(i.alocacao), valor: i.valor }))
  )

  const topBases = agrupar(
    itens.filter(i => i.categoria_despesa === 'BASE_OPERACIONAL')
      .map(i => ({ chave: normalizar(i.alocacao), valor: i.valor }))
  )

  const topFiscais = agrupar(
    prestacoes.map(p => ({ chave: p.remetente_nome, valor: p.valor_total }))
  )

  return { porCategoria, topFiscais, topColaboradores, topViaturas, topPrefixos, topBases }
}
