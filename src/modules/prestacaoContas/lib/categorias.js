// Sugestões de "DESPESA - CLASSIFICAÇÃO" extraídas do histórico real de
// prestação de contas (planilha CAIXA) — é só uma lista de apoio pro
// autocomplete do campo, não trava o usuário: ele pode digitar qualquer coisa.
export const CATEGORIAS_SUGERIDAS = [
  'ABASTECIMENTO', 'ACESSORIO MOTO', 'ADAPTADOR', 'AJUSTE ROUPA', 'ALIMENTAÇÃO', 'ALMOÇO',
  'BALSA', 'BATERIA', 'BAU MOTO', 'BORRACHARIA', 'BROCA', 'CABO', 'CABO CARGA', 'CABO TIPO C',
  'CADEADO', 'CAFÉ DA MANHÃ', 'CAMARA DE AR', 'CANIVET', 'CARGA BATERIA', 'CARREGADOR', 'CHAVE',
  'COFFEE BREAK', 'COMPRA', 'CONSERTO', 'CONSERTO CELULAR', 'CONSERTO MOTO', 'CONSERTO PNEU',
  'CORREIOS', 'COSTURA', 'DADOS MOVEIS', 'EMPLACAMENTO', 'ENSAIO ELETRCICO', 'EPC', 'EPI',
  'EVENTO SIPAT', 'FAIXA DE SINALIZAÇÃO', 'GELO', 'JANTAR', 'LANCHE', 'LAVA JATO', 'LAVAGEM',
  'LAVAGEM DE VIATURA', 'LED', 'LIMPEZA BASE', 'LUVA', 'MANUTENÇÃO', 'MATERIAIS',
  'MATERIAL DE CONSTRUÇÃO', 'MATERIAL REPARO', 'MOLA', 'OLEO', 'PARAFUSOS', 'PASSAGEM', 'PLACA',
  'PREMIAÇÃO', 'PREMIAÇÃO EQUIPES', 'PRODUTO PARA VEÍCULO', 'RECARGA DADOS', 'REFEIÇÃO',
  'REMENDO', 'REMENDO PNEU', 'RESISTENCIA', 'SERRA COPO', 'SERVIDOR', 'SERVIÇO BATERIA',
  'SERVIÇO PNEU', 'SERVIÇO VIATURA', 'SISTEMA', 'SOLDA', 'SUPORTE TV', 'TELEFONIA', 'TONER',
  'TROCA BATERIA', 'TROFEU ACRÍLICO', 'VIAGEM', 'VULCANIZAÇÃO', 'VULCANIZAÇÃO PNEU', 'ÁGUA',
]

export const FORMAS_PAGAMENTO = ['PIX', 'Dinheiro', 'Cartão', 'Transferência']

export const TIPOS_COMPROVANTE = ['RECIBO', 'NOTA FISCAL', 'EXTRATO CONTA', 'OUTRO']

// CATEGORIA DA DESPESA — pra quem/o quê a despesa deve ser alocada. Lista
// FIXA (ao contrário de classificação/forma de pagamento/tipo de comprovante,
// que são cadastráveis na tela "⚙️ Padrões") — não editável pelo usuário.
export const CATEGORIAS_DESPESA = [
  { value: 'COLABORADOR', label: 'COLABORADOR', sub: 'Uso individual do colaborador — escreva o nome dele(s). Ex.: alimentação, passagem, EPI.' },
  { value: 'EQUIPE_PREFIXO', label: 'EQUIPE/PREFIXO', sub: 'Uso dos 2 colaboradores da equipe — escreva o prefixo. Ex.: PI-THE-C002M.' },
  { value: 'VIATURA', label: 'VIATURA', sub: 'Despesa da viatura — escreva a placa. Ex.: OUB23GI.' },
  { value: 'BASE_OPERACIONAL', label: 'BASE OPERACIONAL', sub: 'Despesa da base — escreva o nome dela. Ex.: BASE MONTE CASTELO.' },
  { value: 'TERCEIROS', label: 'DESPESAS COM TERCEIROS', sub: 'Cliente externo, não funcionário — escreva o nome dele. Ex.: CONDOMÍNIO RESIDENCIAL X.' },
  { value: 'ADMINISTRATIVA', label: 'DESPESAS ADMINISTRATIVAS', sub: 'Não dá para alocar em nenhum item acima.' },
]

export function labelCategoriaDespesa(categoria) {
  return CATEGORIAS_DESPESA.find(c => c.value === categoria)?.label || ''
}

// Texto de alocação pra exibição/exportação — quem/o quê recebeu a despesa.
export function formatarAlocacao(item) {
  if (item.categoria_despesa === 'COLABORADOR') {
    return [item.colaborador_1, item.colaborador_2].filter(Boolean).join(' | ') || '—'
  }
  if (item.categoria_despesa === 'ADMINISTRATIVA') return '—'
  return item.alocacao || '—'
}

// ── Sugestão de alocação por Classificação (cadastrada em Padrões) ──────────
// Mapa { NOME_DA_CLASSIFICACAO: categoria_despesa_sugerida } a partir da
// lista vinda de listarClassificacoes() (cada item com `alocacao_sugerida`,
// ou null quando não há sugestão cadastrada pra essa classificação).
export function mapaSugestoesAlocacao(classificacoes) {
  const mapa = {}
  ;(classificacoes || []).forEach(c => { if (c.alocacao_sugerida) mapa[c.nome] = c.alocacao_sugerida })
  return mapa
}

// Compara a alocação escolhida num item com a sugestão cadastrada pra sua
// Classificação. Retorna a categoria sugerida quando ela diverge da
// escolhida (pra montar o aviso), ou null quando não há sugestão cadastrada
// pra essa classificação, ou quando a escolha já bate com a sugestão.
export function divergenciaAlocacao(item, mapaSugestoes) {
  const sugestao = mapaSugestoes?.[item.classificacao]
  if (!sugestao || !item.categoria_despesa || item.categoria_despesa === sugestao) return null
  return sugestao
}
