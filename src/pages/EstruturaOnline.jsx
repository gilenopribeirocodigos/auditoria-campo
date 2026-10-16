import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase, buscarTodasLinhas } from '../lib/supabase.js'
import { temPermissao } from '../lib/auth.js'

const SITUACAO_SEM_ELETRICISTA = 'SEM ELETRICISTA'
const SITUACOES_PERMITIDAS = ['ATIVO', 'RESERVA']

const COLUNAS_ESPERADAS = [
  'regional', 'polo', 'base', 'prefixo', 'matricula', 'colaborador',
  // [DPL] CPF do colaborador — opcional (fica vazio se a planilha não trouxer
  // essa coluna). Usado futuramente pra cruzar com a Justificativa em Lote
  // via SIGA (src/pages/IndisponibilidadePage.jsx), que já recebe CPF na
  // extração (vw_toa_extracao_completa) mas hoje casa só por nome.
  'cpf_colaborador',
  'descr_secao', 'descr_situacao', 'placas', 'tipo_equipe', 'processo_equipe',
  // [DPL] Matrícula do Supervisor de Campo dessa linha — mesma matrícula
  // que o usuário tem em dev.usuarios/public.usuarios. Só grava o dado por
  // enquanto; a lógica de filtro/permissão (fiscalPermitido em
  // PainelFiltros.jsx/MapaFiscais.jsx) ainda casa por nome (matchNomes),
  // isso é etapa futura, depois que a matrícula estiver populada. Mesma
  // posição (antes de superv_campo) usada em ImportarEquipes.jsx (CSV),
  // pra manter os dois padrões iguais.
  'matricula_superv_campo',
  'superv_campo', 'superv_operacao', 'coordenador',
]
const COLUNAS_CONTEUDO = COLUNAS_ESPERADAS.filter(c => c !== 'descr_situacao')

// Colunas que não podem ficar em branco (pedido do Gileno — ver print com
// as colunas circuladas: REGIONAL, MATRICULA, COLABORADOR, CPF_COLABORADOR,
// PROCESSO_EQUIPE, MATRICULA_SUPERV_CAMPO, SUPERV_CAMPO, SUPERV_OPERACAO,
// COORDENADOR) — mas só valem pra linha "importável" (DESCR_SITUACAO ATIVO
// ou RESERVA, mesmo critério de situacaoPermitida()/linhasTotalImportaveis
// usado pra decidir quem sobe pra estrutura_equipes). Linha DESLIGADO,
// TRANSFERIDO, AF.PREVIDENCIA, SEM ELETRICISTA etc. nunca vai pro banco
// mesmo, então não faz sentido exigir essas colunas nela.
const COLUNAS_OBRIGATORIAS = [
  'regional', 'matricula', 'colaborador', 'cpf_colaborador',
  'processo_equipe', 'matricula_superv_campo', 'superv_campo', 'superv_operacao', 'coordenador',
]

const MOTIVOS_PADRAO = [
  { descricao: 'ATIVO', cor_fundo: '#dcfce7', cor_texto: '#166534', permite_importar_estrutura: true, ordem_exibicao: 1, ativo: true },
  { descricao: 'RESERVA', cor_fundo: '#dbeafe', cor_texto: '#1e40af', permite_importar_estrutura: true, ordem_exibicao: 2, ativo: true },
  { descricao: 'TRANSFERIDO', cor_fundo: '#f3e8ff', cor_texto: '#6b21a8', permite_importar_estrutura: false, ordem_exibicao: 10, ativo: true },
  { descricao: 'AF.PREVIDENCIA', cor_fundo: '#fef3c7', cor_texto: '#92400e', permite_importar_estrutura: false, ordem_exibicao: 11, ativo: true },
  { descricao: 'DESLIGADO', cor_fundo: '#fee2e2', cor_texto: '#991b1b', permite_importar_estrutura: false, ordem_exibicao: 12, ativo: true },
  { descricao: 'DESAPARECIDO', cor_fundo: '#bbf7d0', cor_texto: '#166534', permite_importar_estrutura: false, ordem_exibicao: 13, ativo: true },
  { descricao: 'BLOQUEADO', cor_fundo: '#ffedd5', cor_texto: '#9a3412', permite_importar_estrutura: false, ordem_exibicao: 14, ativo: true },
  { descricao: 'NAO APRESENTADO', cor_fundo: '#ffffff', cor_texto: '#334155', permite_importar_estrutura: false, ordem_exibicao: 15, ativo: true },
  { descricao: SITUACAO_SEM_ELETRICISTA, cor_fundo: '#f1f5f9', cor_texto: '#334155', permite_importar_estrutura: false, ordem_exibicao: 99, ativo: true },
]

const PROCESSOS_EQUIPE_PADRAO = [
  { descricao: 'CORTE', ordem_exibicao: 1, ativo: true },
  { descricao: 'LIGACAO NOVA', ordem_exibicao: 2, ativo: true },
  { descricao: 'EMERGENCIAL', ordem_exibicao: 3, ativo: true },
  { descricao: 'PLANTAO', ordem_exibicao: 4, ativo: true },
]

const CORES_MOTIVO = [
  { nome: 'Verde', fundo: '#dcfce7', texto: '#166534' },
  { nome: 'Azul', fundo: '#dbeafe', texto: '#1e40af' },
  { nome: 'Lilas', fundo: '#f3e8ff', texto: '#6b21a8' },
  { nome: 'Amarelo', fundo: '#fef3c7', texto: '#92400e' },
  { nome: 'Vermelho', fundo: '#fee2e2', texto: '#991b1b' },
  { nome: 'Laranja', fundo: '#ffedd5', texto: '#9a3412' },
  { nome: 'Branco', fundo: '#ffffff', texto: '#334155' },
  { nome: 'Cinza', fundo: '#f1f5f9', texto: '#334155' },
]

const norm = s => (s || '').trim()
const hojeISO = () => new Date().toISOString().split('T')[0]
const formatBR = d => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Nunca'
const nomeArquivoSeguro = s => limparTexto(s || 'estrutura').replace(/[^A-Z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'estrutura'

function limparTexto(valor) {
  if (valor === null || valor === undefined) return ''
  return String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—−]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
}

function limparTextoEdicao(valor) {
  if (valor === null || valor === undefined) return ''
  return String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[â€“â€”âˆ’]/g, '-')
    .replace(/[â€œâ€]/g, '"')
    .replace(/[â€˜â€™]/g, "'")
    .replace(/[^\x20-\x7E]/g, '')
    .toUpperCase()
}

// CPF só dígitos, preenchido com zero à esquerda até 11 dígitos — a
// planilha de origem costuma trazer o CPF como número (não texto), e o
// Excel apaga zero à esquerda nesse caso ("003.665.833-28" vira
// "3665833828" ou pior). Sem isso, o mesmo CPF fica com tamanhos
// diferentes conforme vem formatado (com pontos/traço) ou não, e a
// Justificativa em Lote via SIGA (que compara por CPF) não casa ninguém.
function padronizarCpf(valor) {
  const digitos = String(valor || '').replace(/\D/g, '')
  return digitos ? digitos.padStart(11, '0') : ''
}

function normalizarValorCelula(coluna, valor) {
  if (coluna === 'cpf_colaborador') return padronizarCpf(valor)
  if (coluna === 'matricula') return limparTexto(valor).toUpperCase()
  return limparTexto(valor).toUpperCase()
}

function gerarIdTemporario() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}_${Math.random()}`
}

function novaLinha() {
  return {
    _tmpId: gerarIdTemporario(),
    regional: '', polo: '', base: '', prefixo: '', matricula: '', colaborador: '',
    cpf_colaborador: '',
    descr_secao: '', descr_situacao: 'ATIVO', placas: '', tipo_equipe: '', processo_equipe: '',
    matricula_superv_campo: '', superv_campo: '', superv_operacao: '', coordenador: '',
  }
}

function linhaVazia(linha) {
  return COLUNAS_CONTEUDO.every(c => !norm(linha?.[c]))
}

// ─── Lista as colunas obrigatórias que estão em branco numa linha — só
// checa linha "importável" (DESCR_SITUACAO ATIVO/RESERVA, situacaoPermitida);
// linha vazia ou com outra situação (DESLIGADO, SEM ELETRICISTA etc.) nunca
// entra em estrutura_equipes mesmo, então não precisa ter essas colunas
// completas.
function camposObrigatoriosFaltando(linha) {
  if (linhaVazia(linha) || !situacaoPermitida(linha?.descr_situacao)) return []
  return COLUNAS_OBRIGATORIAS.filter(c => !norm(linha?.[c]))
}

function mensagemCampoObrigatorio(linha, faltando) {
  const quem = linha.colaborador || linha.matricula || linha.prefixo || 'linha sem identificação'
  return `${quem}${linha.matricula ? ` (mat. ${linha.matricula})` : ''}: falta ${faltando.join(', ').toUpperCase()}`
}

function aplicarSituacaoAutomatica(linha) {
  const out = { ...(linha || {}) }
  if (linhaVazia(out)) return out

  const semMatricula = !norm(out.matricula)
  const semColaborador = !norm(out.colaborador)
  const situacao = normalizarSituacao(out.descr_situacao)

  if (semMatricula || semColaborador) {
    out.descr_situacao = SITUACAO_SEM_ELETRICISTA
  } else if (!situacao || situacao === SITUACAO_SEM_ELETRICISTA) {
    out.descr_situacao = 'ATIVO'
  }

  return out
}

function normalizarLinha(linha) {
  const out = {}
  COLUNAS_ESPERADAS.forEach(c => {
    out[c] = c === 'cpf_colaborador' ? padronizarCpf(linha?.[c]) : limparTexto(linha?.[c]).toUpperCase()
  })
  out.descr_situacao = limparTexto(out.descr_situacao).toUpperCase()
  return aplicarSituacaoAutomatica(out)
}

function assinaturaLinhas(linhas) {
  return JSON.stringify((linhas || []).map(normalizarLinha).filter(l => !linhaVazia(l)))
}

function dadosParaLinha(dados) {
  return { ...novaLinha(), ...normalizarLinha(dados || {}) }
}

function mapaMotivos(motivos) {
  return new Map((motivos || []).map(m => [normalizarSituacao(m.descricao), m]))
}

function normalizarSituacao(valor) {
  return limparTexto(valor).toUpperCase()
}

function normalizarProcesso(valor) {
  return limparTexto(valor).toUpperCase()
}

function valorContemFiltro(valor, filtro) {
  if (!norm(filtro)) return true
  return limparTexto(valor).toUpperCase().includes(limparTexto(filtro).toUpperCase())
}

function situacaoPermitida(s) {
  return SITUACOES_PERMITIDAS.includes(normalizarSituacao(s))
}

function infoSituacao(situacao, motivos) {
  const map = mapaMotivos(motivos)
  const chave = normalizarSituacao(situacao)
  return map.get(chave) || {
    descricao: chave || 'SEM SITUACAO',
    cor_fundo: '#f8fafc',
    cor_texto: '#334155',
    permite_importar_estrutura: false,
    ordem_exibicao: 999,
  }
}

function compararValores(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'pt-BR', { numeric: true, sensitivity: 'base' })
}

function prioridadeSituacao(info) {
  const descricao = normalizarSituacao(info?.descricao)
  if (descricao === 'ATIVO') return 0
  if (descricao === 'RESERVA') return 1
  return 2
}

// ─── Critérios de ordenação além do principal (ordenacao) — ex.: "depois
// ordenar por REGIONAL, depois por COLABORADOR". Usado como desempate antes
// de cair no desempate padrão (nome do colaborador).
function compararComExtras(a, b, extras) {
  for (const e of extras || []) {
    if (!e?.coluna) continue
    const r = compararValores(a[e.coluna], b[e.coluna])
    if (r !== 0) return e.direcao === 'desc' ? -r : r
  }
  return 0
}

function ordenarPorSituacao(linhas, motivos, ordenacao = null, extras = []) {
  return [...(linhas || [])].sort((a, b) => {
    const ia = infoSituacao(a.descr_situacao, motivos)
    const ib = infoSituacao(b.descr_situacao, motivos)
    const ca = prioridadeSituacao(ia)
    const cb = prioridadeSituacao(ib)
    if (ca !== cb) return ca - cb
    if ((ia.ordem_exibicao || 999) !== (ib.ordem_exibicao || 999)) return (ia.ordem_exibicao || 999) - (ib.ordem_exibicao || 999)
    const da = normalizarSituacao(ia.descricao)
    const db = normalizarSituacao(ib.descricao)
    const grupo = compararValores(da, db)
    if (grupo !== 0) return grupo
    if (ordenacao?.coluna) {
      const resultado = compararValores(a[ordenacao.coluna], b[ordenacao.coluna])
      if (resultado !== 0) return ordenacao.direcao === 'desc' ? -resultado : resultado
    }
    const extraResultado = compararComExtras(a, b, extras)
    if (extraResultado !== 0) return extraResultado
    return String(a.colaborador || '').localeCompare(String(b.colaborador || ''))
  })
}

function ordenarLinhas(linhas, motivos, ordenacao, manterOrdemInsercao, extras = []) {
  if (manterOrdemInsercao) {
    if (!ordenacao?.coluna) return [...(linhas || [])]
    return [...(linhas || [])].sort((a, b) => {
      const resultado = compararValores(a[ordenacao.coluna], b[ordenacao.coluna])
      if (resultado !== 0) return ordenacao.direcao === 'desc' ? -resultado : resultado
      return compararComExtras(a, b, extras)
    })
  }
  return ordenarPorSituacao(linhas, motivos, ordenacao, extras)
}

function resumirSituacoes(linhas, motivos) {
  const map = new Map()
  ;(linhas || []).forEach(l => {
    if (linhaVazia(l)) return
    const info = infoSituacao(l.descr_situacao, motivos)
    const desc = normalizarSituacao(info.descricao)
    map.set(desc, { info, total: (map.get(desc)?.total || 0) + 1 })
  })
  return [...map.values()].sort((a, b) => (a.info.ordem_exibicao || 999) - (b.info.ordem_exibicao || 999))
}

function montarRegistro(r, idEletricista, timestamp, idExistente) {
  const linha = normalizarLinha(r)
  return {
    // Reaproveita o id numérico de quem já estava na estrutura (mantidos/
    // movimentados) — sem isso, toda carga gerava um id novo até pra quem
    // não mudou nada, e a Frequência/Indisponibilidade (que referenciam
    // esse id em equipes_dia) perdiam o vínculo e voltavam como "não
    // justificado" mesmo já tendo sido marcado Presente/Ausente no dia.
    ...(idExistente ? { id: idExistente } : {}),
    id_eletricista: idEletricista,
    regional: linha.regional,
    polo: linha.polo,
    base: linha.base,
    prefixo: linha.prefixo,
    matricula: linha.matricula,
    colaborador: linha.colaborador,
    cpf_colaborador: linha.cpf_colaborador,
    descr_secao: linha.descr_secao,
    descr_situacao: linha.descr_situacao,
    placas: linha.placas,
    tipo_equipe: linha.tipo_equipe,
    processo_equipe: linha.processo_equipe,
    matricula_superv_campo: linha.matricula_superv_campo,
    superv_campo: linha.superv_campo,
    superv_operacao: linha.superv_operacao,
    coordenador: linha.coordenador,
    carregado_em: timestamp,
  }
}

function montarHistorico(linhaAtual, dataHoje, motivo) {
  return {
    id_eletricista: linhaAtual.id_eletricista,
    regional: linhaAtual.regional,
    polo: linhaAtual.polo,
    base: linhaAtual.base,
    prefixo: linhaAtual.prefixo,
    matricula: linhaAtual.matricula,
    colaborador: linhaAtual.colaborador,
    cpf_colaborador: linhaAtual.cpf_colaborador,
    descr_secao: linhaAtual.descr_secao,
    descr_situacao: linhaAtual.descr_situacao,
    placas: linhaAtual.placas,
    tipo_equipe: linhaAtual.tipo_equipe,
    processo_equipe: linhaAtual.processo_equipe,
    matricula_superv_campo: linhaAtual.matricula_superv_campo,
    superv_campo: linhaAtual.superv_campo,
    superv_operacao: linhaAtual.superv_operacao,
    coordenador: linhaAtual.coordenador,
    vigencia_inicio: linhaAtual.carregado_em ? linhaAtual.carregado_em.split('T')[0] : null,
    vigencia_fim: dataHoje,
    motivo_saida: motivo,
  }
}

function configMudou(atual, novo) {
  const campos = ['regional', 'polo', 'base', 'prefixo', 'placas', 'tipo_equipe', 'processo_equipe', 'superv_campo', 'superv_operacao', 'coordenador', 'descr_secao', 'descr_situacao']
  return campos.some(c => norm(atual[c]) !== norm(novo[c]))
}

async function importarEstrutura(rows) {
  const rowsLimpos = (rows || []).map(normalizarLinha)
  const ignoradas = []
  const validas = []

  for (const r of rowsLimpos) {
    if (!norm(r.matricula) || !norm(r.colaborador)) {
      ignoradas.push({ ...r, _motivo: !norm(r.matricula) ? 'sem matricula' : 'sem colaborador' })
    } else if (!situacaoPermitida(r.descr_situacao)) {
      ignoradas.push({ ...r, _motivo: `situacao "${r.descr_situacao || 'em branco'}" nao importavel` })
    } else {
      validas.push(r)
    }
  }

  if (validas.length === 0) {
    throw new Error('Nenhuma linha valida para importar. O Total precisa ter ao menos uma linha ATIVO ou RESERVA com matricula e colaborador.')
  }

  const matriculasCount = {}
  const matriculaNomes = {}
  for (const r of validas) {
    matriculasCount[r.matricula] = (matriculasCount[r.matricula] || 0) + 1
    if (!matriculaNomes[r.matricula]) matriculaNomes[r.matricula] = new Set()
    matriculaNomes[r.matricula].add(r.colaborador)
  }

  const dups = Object.entries(matriculasCount)
    .filter(([, c]) => c > 1)
    .map(([m, c]) => ({ matricula: m, quantidade: c, nomes: Array.from(matriculaNomes[m]) }))

  if (dups.length > 0) {
    throw new Error(`${dups.length} matricula(s) duplicada(s) no Total Consolidado. Corrija antes de importar.`)
  }

  const atualData = await buscarTodasLinhas((ini, fim) =>
    supabase.from('estrutura_equipes').select('*').range(ini, fim)
  )
  const mestreData = await buscarTodasLinhas((ini, fim) =>
    supabase.from('eletricistas_cadastro').select('id_eletricista, matricula, nome').range(ini, fim)
  )
  const histData = await buscarTodasLinhas((ini, fim) =>
    supabase.from('historico_estrutura_equipes').select('matricula').range(ini, fim)
  )

  const atualMap = new Map((atualData || []).map(a => [a.matricula, a]))
  const mestreMap = new Map((mestreData || []).map(m => [m.matricula, m]))
  const historicoSet = new Set((histData || []).map(h => h.matricula))

  const novos = []
  const voltaram = []
  const mantidos = []
  const movimentados = []

  for (const r of validas) {
    const noAtual = atualMap.get(r.matricula)
    const noMestre = mestreMap.get(r.matricula)
    const noHist = historicoSet.has(r.matricula)
    if (noAtual) {
      if (configMudou(noAtual, r)) movimentados.push({ atual: noAtual, novo: r, idEletricista: noMestre?.id_eletricista })
      else mantidos.push({ atual: noAtual, novo: r, idEletricista: noMestre?.id_eletricista })
    } else {
      if (noMestre || noHist) voltaram.push({ novo: r, idEletricista: noMestre?.id_eletricista })
      else novos.push({ novo: r })
    }
  }

  const matriculasCsv = new Set(validas.map(r => r.matricula))
  const removidos = (atualData || []).filter(a => a.matricula && !matriculasCsv.has(a.matricula))
  const agora = new Date().toISOString()

  const upsertPayload = validas.map(r => ({
    matricula: r.matricula,
    nome: limparTexto(r.colaborador),
    atualizado_em: agora,
  }))
  for (let i = 0; i < upsertPayload.length; i += 100) {
    const { error } = await supabase.from('eletricistas_cadastro').upsert(upsertPayload.slice(i, i + 100), { onConflict: 'matricula' })
    if (error) throw error
  }

  const matriculas = validas.map(r => r.matricula)
  const idsAtuais = []
  for (let i = 0; i < matriculas.length; i += 200) {
    const { data, error } = await supabase.from('eletricistas_cadastro').select('id_eletricista, matricula').in('matricula', matriculas.slice(i, i + 200))
    if (error) throw error
    idsAtuais.push(...(data || []))
  }
  const idMap = new Map(idsAtuais.map(i => [i.matricula, i.id_eletricista]))

  const dataHoje = hojeISO()
  const linhasHistorico = []
  movimentados.forEach(m => linhasHistorico.push(montarHistorico(m.atual, dataHoje, `Alteracao de configuracao na carga online de ${dataHoje}`)))
  removidos.forEach(r => linhasHistorico.push(montarHistorico(r, dataHoje, `Removido da estrutura na carga online de ${dataHoje}`)))
  const linhasHistoricoValidas = linhasHistorico.filter(h => h.id_eletricista)
  if (linhasHistoricoValidas.length > 0) {
    for (let i = 0; i < linhasHistoricoValidas.length; i += 100) {
      const { error } = await supabase.from('historico_estrutura_equipes').insert(linhasHistoricoValidas.slice(i, i + 100))
      if (error) throw error
    }
  }

  // UPSERT em vez de apagar tudo e inserir tudo de novo: apagar a tabela
  // inteira antes de reinserir cria uma janela em que estrutura_equipes fica
  // vazia (o processo faz 3+ chamadas separadas ao banco, sem transação).
  // Se algo interromper o processo nessa janela (conexão instável no
  // celular, app em segundo plano, recarregamento do PWA), a próxima
  // importação lê a tabela vazia e classifica todo mundo como "voltaram",
  // gerando id novo pra todo mundo e quebrando o vínculo com Frequência/
  // Indisponibilidade já marcadas no dia. Com upsert por matrícula, quem já
  // está na tabela nunca é apagado — o id existente é sempre preservado.
  // Lotes separados: quem já tem id (mantidos/movimentados) de quem não tem
  // (novos/voltaram). Misturar linhas com e sem a chave "id" no mesmo
  // upsert faz o PostgREST gravar NULL explicito em "id" pra quem não tem a
  // chave (em vez de deixar o banco gerar o id automaticamente), violando o
  // NOT NULL da coluna.
  const semId = []
  novos.forEach(n => { const id = idMap.get(n.novo.matricula); if (id) semId.push(montarRegistro(n.novo, id, agora)) })
  voltaram.forEach(v => { const id = idMap.get(v.novo.matricula); if (id) semId.push(montarRegistro(v.novo, id, agora)) })

  const comId = []
  mantidos.forEach(m => { const id = idMap.get(m.novo.matricula); if (id) comId.push(montarRegistro(m.novo, id, agora, m.atual.id)) })
  movimentados.forEach(m => { const id = idMap.get(m.novo.matricula); if (id) comId.push(montarRegistro(m.novo, id, agora, m.atual.id)) })

  for (let i = 0; i < semId.length; i += 100) {
    const { error } = await supabase.from('estrutura_equipes').upsert(semId.slice(i, i + 100), { onConflict: 'matricula' })
    if (error) throw error
  }
  for (let i = 0; i < comId.length; i += 100) {
    const { error } = await supabase.from('estrutura_equipes').upsert(comId.slice(i, i + 100), { onConflict: 'matricula' })
    if (error) throw error
  }

  const novaEstrutura = [...semId, ...comId]

  // Só depois do upsert (que já preservou todo mundo que continua na
  // estrutura) é que removemos, um a um por id, quem realmente saiu — nunca
  // um DELETE geral da tabela.
  if (removidos.length > 0) {
    const idsRemovidos = removidos.map(r => r.id)
    for (let i = 0; i < idsRemovidos.length; i += 100) {
      const { error } = await supabase.from('estrutura_equipes').delete().in('id', idsRemovidos.slice(i, i + 100))
      if (error) throw error
    }
  }

  return {
    novos: novos.length,
    voltaram: voltaram.length,
    mantidos: mantidos.length,
    movimentados: movimentados.length,
    removidos: removidos.length,
    ignoradas: ignoradas.length,
    total: novaEstrutura.length,
  }
}

const cardStyle = {
  background: '#fff',
  border: '1px solid #dbe3ef',
  borderRadius: 12,
  padding: 12,
}

const LARGURAS_PADRAO = {
  regional: 130,
  polo: 120,
  base: 140,
  prefixo: 135,
  matricula: 105,
  colaborador: 250,
  cpf_colaborador: 150,
  descr_secao: 150,
  descr_situacao: 170,
  placas: 120,
  tipo_equipe: 190,
  processo_equipe: 190,
  matricula_superv_campo: 130,
  superv_campo: 160,
  superv_operacao: 170,
  coordenador: 160,
}

function larguraPadraoColuna(coluna) {
  return LARGURAS_PADRAO[coluna] || 130
}

function larguraAutomaticaColuna(coluna, linhas) {
  const textos = [coluna, ...(linhas || []).slice(0, 120).map(l => l?.[coluna] || '')]
  const maior = textos.reduce((max, valor) => Math.max(max, String(valor || '').length), 0)
  // [DPL] +42 era insuficiente pro nome da coluna no cabeçalho — o <th>
  // (função Th abaixo) reserva 48px de padding à direita pro botão de
  // ordenação "A-Z"/"Z-A" (10px + 48px = 58px de padding total), então
  // qualquer nome de coluna perto do limite calculado cortava com "..."
  // antes da hora (bem visível em nomes longos como
  // MATRICULA_SUPERV_CAMPO, mas afetava todas as colunas). Ajustado pra
  // 70 (58 do padding do cabeçalho + folga extra) pra caber sem cortar.
  const estimada = Math.round(maior * 7.5 + 70)
  return Math.max(95, Math.min(420, estimada))
}

export default function EstruturaOnline({ usuarioLogado }) {
  const [planilhas, setPlanilhas] = useState([])
  const [linhasPorAba, setLinhasPorAba] = useState({})
  const [abaAtiva, setAbaAtiva] = useState(null)
  const [editando, setEditando] = useState(null)
  const [snapshotEdicao, setSnapshotEdicao] = useState('')
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [motivos, setMotivos] = useState(MOTIVOS_PADRAO)
  const [processosEquipe, setProcessosEquipe] = useState(PROCESSOS_EQUIPE_PADRAO)
  const [mostrarMotivos, setMostrarMotivos] = useState(false)
  const [abaPadroes, setAbaPadroes] = useState('situacoes')
  const [motivoForm, setMotivoForm] = useState({ descricao: '', cor_fundo: '#f1f5f9', cor_texto: '#334155', permite_importar_estrutura: false })
  const [processoForm, setProcessoForm] = useState({ descricao: '' })
  const [motivoRapido, setMotivoRapido] = useState('')
  const [processoRapido, setProcessoRapido] = useState('')
  const [tabelaAmpliada, setTabelaAmpliada] = useState(false)
  const [largurasColunas, setLargurasColunas] = useState({})
  const [ordenacao, setOrdenacao] = useState({ coluna: '', direcao: 'asc' })
  const [confirmacao, setConfirmacao] = useState('')
  const [relatorioImportacao, setRelatorioImportacao] = useState(null)
  const [filtrosColuna, setFiltrosColuna] = useState({})
  const [buscaGlobal, setBuscaGlobal] = useState('')
  const [colunasCongeladas, setColunasCongeladas] = useState(false)
  const [selecionados, setSelecionados] = useState(() => new Set())
  const [historico, setHistorico] = useState([])
  const [ordenacaoSecundaria, setOrdenacaoSecundaria] = useState([])
  // _tmpId das linhas criadas/editadas NESTA sessão de edição — os campos
  // obrigatórios (COLUNAS_OBRIGATORIAS) só travam o Salvar pra essas, não
  // pra linha legada que ninguém tocou (decisão do Gileno: não mexer no
  // que já está rodando, só exigir ao atualizar de novo).
  const [linhasTocadas, setLinhasTocadas] = useState(() => new Set())

  const isAdmin = usuarioLogado?.perfil === 'ADMIN'
  const podeVisualizar = isAdmin || temPermissao(usuarioLogado, 'estrutura_online_visualizar') || temPermissao(usuarioLogado, 'importar_equipes')
  const podeEditar = isAdmin || temPermissao(usuarioLogado, 'estrutura_online_editar')
  const podeImportar = isAdmin || temPermissao(usuarioLogado, 'estrutura_online_importar') || temPermissao(usuarioLogado, 'importar_equipes')
  const podeConfigurarMotivos = isAdmin || temPermissao(usuarioLogado, 'estrutura_online_motivos')

  const linhasAtuais = linhasPorAba[abaAtiva] || []
  const abaAtual = planilhas.find(p => p.id === abaAtiva)
  const estaEditando = editando === abaAtiva

  useEffect(() => {
    setFiltrosColuna({})
    setBuscaGlobal('')
    setSelecionados(new Set())
    setHistorico([])
    setOrdenacaoSecundaria([])
  }, [abaAtiva])

  const atualizarFiltroColuna = (coluna, valor) => {
    setFiltrosColuna(prev => ({ ...prev, [coluna]: valor }))
  }

  const temFiltroAtivo = Object.values(filtrosColuna).some(v => norm(v)) || norm(buscaGlobal)

  const linhasTotal = useMemo(() => {
    return planilhas.flatMap(p => (linhasPorAba[p.id] || [])
      .filter(l => !linhaVazia(l))
      .map(l => ({ ...normalizarLinha(l), origem_aba: limparTexto(p.nome).toUpperCase() })))
  }, [planilhas, linhasPorAba])

  const linhasTotalImportaveis = useMemo(() => {
    return linhasTotal.filter(l => situacaoPermitida(l.descr_situacao) && norm(l.matricula) && norm(l.colaborador))
  }, [linhasTotal])

  // Duplicada = mesma matrícula aparece em mais de 1 linha importável (ativa)
  // no Total — guarda também o nome e em qual(is) aba(s) ela aparece, pra
  // dar uma mensagem que já diz onde ir corrigir, em vez de só o número da
  // matrícula (ver mensagemMatriculaDuplicada).
  const matriculasDuplicadas = useMemo(() => {
    const porMatricula = {}
    linhasTotalImportaveis.forEach(l => {
      const m = l.matricula
      if (!porMatricula[m]) porMatricula[m] = { matricula: m, colaborador: l.colaborador, abas: [] }
      porMatricula[m].abas.push(l.origem_aba || 'aba sem nome')
    })
    return Object.values(porMatricula)
      .filter(d => d.abas.length > 1)
      .map(d => ({ ...d, abasUnicas: [...new Set(d.abas)] }))
  }, [linhasTotalImportaveis])

  const mensagemMatriculaDuplicada = d => d.abasUnicas.length > 1
    ? `Matrícula ${d.matricula} (${d.colaborador}) está tanto na estrutura ${d.abasUnicas.slice(0, -1).join(', ')} quanto na ${d.abasUnicas[d.abasUnicas.length - 1]} — registro duplicado. Deve ficar em apenas uma das estruturas.`
    : `Matrícula ${d.matricula} (${d.colaborador}) aparece ${d.abas.length}x dentro da própria aba ${d.abasUnicas[0]} — remova a linha repetida.`

  // Set só com os números de matrícula duplicados — usado pra destacar a
  // linha direto na grade (TabelaEstrutura), além da mensagem detalhada
  // abaixo da tabela.
  const matriculasDuplicadasSet = useMemo(
    () => new Set(matriculasDuplicadas.map(d => d.matricula)),
    [matriculasDuplicadas]
  )

  const carregar = async () => {
    setLoading(true)
    setErro('')
    try {
      const { data: motivosData, error: motivosError } = await supabase
        .from('motivos_situacao_estrutura')
        .select('*')
        .eq('ativo', true)
        .order('ordem_exibicao')
      if (!motivosError && motivosData?.length) setMotivos(motivosData)

      const { data: processosData, error: processosError } = await supabase
        .from('processos_equipe_estrutura')
        .select('*')
        .eq('ativo', true)
        .order('ordem_exibicao')
      if (!processosError && processosData?.length) setProcessosEquipe(processosData)

      const { data: abas, error: abasError } = await supabase
        .from('estrutura_planilhas')
        .select('*')
        .eq('ativo', true)
        .order('ordem')
      if (abasError) throw abasError

      const listaAbas = abas || []
      setPlanilhas(listaAbas)
      if (!abaAtiva && listaAbas[0]) setAbaAtiva(listaAbas[0].id)

      if (listaAbas.length > 0) {
        const ids = listaAbas.map(a => a.id)
        const { data: linhas, error: linhasError } = await supabase
          .from('estrutura_planilha_linhas')
          .select('*')
          .in('planilha_id', ids)
          .order('ordem')
        if (linhasError) throw linhasError
        const mapa = {}
        listaAbas.forEach(a => { mapa[a.id] = [] })
        ;(linhas || []).forEach(l => {
          if (!mapa[l.planilha_id]) mapa[l.planilha_id] = []
          mapa[l.planilha_id].push(dadosParaLinha(l.dados))
        })
        Object.keys(mapa).forEach(k => {
          if (mapa[k].length === 0) mapa[k] = [novaLinha(), novaLinha(), novaLinha()]
        })
        setLinhasPorAba(mapa)
      } else {
        setLinhasPorAba({})
      }
    } catch (e) {
      setErro('Erro ao carregar Estrutura Online: ' + (e.message || String(e)))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, [])

  const criarAbasIniciais = async () => {
    if (!podeEditar) return
    setSalvando(true)
    try {
      const payload = [
        { nome: 'PLANTAO', ordem: 1, criado_por: usuarioLogado?.login, atualizado_por: usuarioLogado?.login },
        { nome: 'COMERCIAL', ordem: 2, criado_por: usuarioLogado?.login, atualizado_por: usuarioLogado?.login },
      ]
      const { error } = await supabase.from('estrutura_planilhas').insert(payload)
      if (error) throw error
      await carregar()
      setMsg('Abas iniciais criadas.')
    } catch (e) {
      setErro(e.message || String(e))
    } finally {
      setSalvando(false)
    }
  }

  const criarAba = async () => {
    if (!podeEditar) return
    if (planilhas.length >= 8) { setErro('Limite inicial de 8 abas atingido.'); return }
    const nome = window.prompt('Nome da nova aba:', `Tabela ${planilhas.length + 1}`)
    if (!nome) return
    setSalvando(true)
    try {
      const { data, error } = await supabase.from('estrutura_planilhas')
        .insert({
          nome: limparTexto(nome).toUpperCase(),
          ordem: planilhas.length + 1,
          criado_por: usuarioLogado?.login,
          atualizado_por: usuarioLogado?.login,
        })
        .select()
        .single()
      if (error) throw error
      setPlanilhas(prev => [...prev, data])
      setLinhasPorAba(prev => ({ ...prev, [data.id]: [novaLinha(), novaLinha(), novaLinha()] }))
      setAbaAtiva(data.id)
      setEditando(data.id)
    } catch (e) {
      setErro(e.message || String(e))
    } finally {
      setSalvando(false)
    }
  }

  const renomearAba = async () => {
    if (!podeEditar || !abaAtual) return
    const nome = window.prompt('Novo nome da aba:', abaAtual.nome)
    if (!nome) return
    try {
      const atualizado = { nome: limparTexto(nome).toUpperCase(), atualizado_por: usuarioLogado?.login, atualizado_em: new Date().toISOString() }
      const { error } = await supabase.from('estrutura_planilhas').update(atualizado).eq('id', abaAtual.id)
      if (error) throw error
      setPlanilhas(prev => prev.map(p => p.id === abaAtual.id ? { ...p, ...atualizado } : p))
      setMsg('Nome da aba atualizado.')
    } catch (e) { setErro(e.message || String(e)) }
  }

  const iniciarEdicao = (id) => {
    setEditando(id)
    setSnapshotEdicao(assinaturaLinhas(linhasPorAba[id] || []))
    setHistorico([])
    setSelecionados(new Set())
    setLinhasTocadas(new Set())
  }

  const marcarTocada = (linhaId) => {
    setLinhasTocadas(prev => {
      if (prev.has(linhaId)) return prev
      const novo = new Set(prev)
      novo.add(linhaId)
      return novo
    })
  }

  // Desfazer (↩): guarda até 20 passos do estado da aba ANTES de cada
  // mudança (edição de célula, colar do Excel, adicionar/remover linha,
  // aplicar em massa) — botão visível, sem depender de atalho de teclado
  // (Ctrl+Z) pra não exigir decorar nada.
  const registrarHistorico = () => {
    setHistorico(prev => [...prev, linhasPorAba[abaAtiva] || []].slice(-20))
  }

  const desfazer = () => {
    if (historico.length === 0) return
    const ultimo = historico[historico.length - 1]
    setLinhasPorAba(prev => ({ ...prev, [abaAtiva]: ultimo }))
    setHistorico(prev => prev.slice(0, -1))
  }

  const atualizarCelula = (linhaId, coluna, valor) => {
    registrarHistorico()
    marcarTocada(linhaId)
    setLinhasPorAba(prev => ({
      ...prev,
      [abaAtiva]: (prev[abaAtiva] || []).map(l => (
        l._tmpId === linhaId
          ? aplicarSituacaoAutomatica({ ...l, [coluna]: normalizarValorCelula(coluna, valor) })
          : l
      )),
    }))
  }

  const colarExcel = (linhaId, colunaInicial, evento) => {
    if (!estaEditando) return
    const texto = evento.clipboardData?.getData('text/plain') || ''
    if (!texto.includes('\t') && !texto.includes('\n')) return
    evento.preventDefault()
    registrarHistorico()

    const linhasTexto = texto.replace(/\r/g, '').split('\n').filter(l => l.length > 0)
    const colInicio = COLUNAS_ESPERADAS.indexOf(colunaInicial)
    const linhasBase = [...linhasAtuais]
    let rowIndex = linhasBase.findIndex(l => l._tmpId === linhaId)
    if (rowIndex < 0) rowIndex = 0

    const tmpIdsColados = []
    linhasTexto.forEach((txt, offsetLinha) => {
      const valores = txt.split('\t')
      const destino = rowIndex + offsetLinha
      while (linhasBase.length <= destino) linhasBase.push(novaLinha())
      valores.forEach((valor, offsetCol) => {
        const col = COLUNAS_ESPERADAS[colInicio + offsetCol]
        if (col) linhasBase[destino][col] = normalizarValorCelula(col, valor)
      })
      linhasBase[destino] = aplicarSituacaoAutomatica(linhasBase[destino])
      tmpIdsColados.push(linhasBase[destino]._tmpId)
    })

    setLinhasPorAba(prev => ({ ...prev, [abaAtiva]: linhasBase }))
    setLinhasTocadas(prev => new Set([...prev, ...tmpIdsColados]))
    setMsg('Dados colados. Confira e clique em Salvar.')
  }

  const adicionarLinha = () => {
    registrarHistorico()
    const linha = novaLinha()
    setLinhasPorAba(prev => ({ ...prev, [abaAtiva]: [...(prev[abaAtiva] || []), linha] }))
    marcarTocada(linha._tmpId)
  }

  const removerLinha = (linhaId) => {
    registrarHistorico()
    setLinhasPorAba(prev => ({
      ...prev,
      [abaAtiva]: (prev[abaAtiva] || []).filter(l => l._tmpId !== linhaId),
    }))
    setSelecionados(prev => {
      if (!prev.has(linhaId)) return prev
      const novo = new Set(prev)
      novo.delete(linhaId)
      return novo
    })
  }

  const alternarSelecao = (linhaId) => {
    setSelecionados(prev => {
      const novo = new Set(prev)
      if (novo.has(linhaId)) novo.delete(linhaId); else novo.add(linhaId)
      return novo
    })
  }

  const alternarSelecaoTodos = (linhasVisiveis) => {
    const ids = linhasVisiveis.map(l => l._tmpId)
    setSelecionados(prev => {
      const todosJaSelecionados = ids.length > 0 && ids.every(id => prev.has(id))
      return todosJaSelecionados ? new Set() : new Set(ids)
    })
  }

  // Edição em massa: aplica o mesmo valor de DESCR_SITUACAO ou
  // PROCESSO_EQUIPE a todas as linhas marcadas de uma vez — as duas únicas
  // colunas com lista fechada (Padrões), pra evitar digitar errado em
  // massa num campo livre.
  const aplicarEmMassa = (coluna, valor) => {
    if (selecionados.size === 0 || !valor) return
    registrarHistorico()
    setLinhasPorAba(prev => ({
      ...prev,
      [abaAtiva]: (prev[abaAtiva] || []).map(l =>
        selecionados.has(l._tmpId) ? aplicarSituacaoAutomatica({ ...l, [coluna]: normalizarValorCelula(coluna, valor) }) : l
      ),
    }))
    setLinhasTocadas(prev => new Set([...prev, ...selecionados]))
    setMsg(`"${valor}" aplicado em ${coluna === 'descr_situacao' ? 'DESCR_SITUACAO' : 'PROCESSO_EQUIPE'} de ${selecionados.size} linha(s). Confira e clique em Salvar.`)
  }

  const limparTabelaAtual = () => {
    if (!podeEditar || !abaAtiva || abaAtiva === 'TOTAL') return
    const ok = window.confirm(
      'Limpar todas as linhas desta aba?\n\n' +
      'A alteracao so sera gravada no banco depois que voce clicar em Salvar.'
    )
    if (!ok) return
    setSnapshotEdicao(assinaturaLinhas(linhasAtuais))
    setLinhasPorAba(prev => ({ ...prev, [abaAtiva]: [novaLinha(), novaLinha(), novaLinha()] }))
    setEditando(abaAtiva)
    setMsg('Tabela limpa. Clique em Salvar para gravar a limpeza desta aba.')
  }

  const salvarAba = async () => {
    if (!podeEditar || !abaAtiva) return
    setErro('')
    const normalizadas = linhasAtuais.map(normalizarLinha).filter(l => !linhaVazia(l))

    const situacoesValidas = new Set(motivos.map(m => normalizarSituacao(m.descricao)))
    const processosValidos = new Set(processosEquipe.map(p => normalizarProcesso(p.descricao)))
    const situacoesInvalidas = new Set()
    const processosInvalidos = new Set()
    normalizadas.forEach(l => {
      const situacao = normalizarSituacao(l.descr_situacao)
      if (situacao && !situacoesValidas.has(situacao)) situacoesInvalidas.add(situacao)
      const processo = normalizarProcesso(l.processo_equipe)
      if (processo && !processosValidos.has(processo)) processosInvalidos.add(processo)
    })
    if (situacoesInvalidas.size > 0 || processosInvalidos.size > 0) {
      const partes = []
      if (situacoesInvalidas.size > 0) partes.push(`DESCR_SITUACAO nao cadastrada(s) em Padroes: ${[...situacoesInvalidas].join(', ')}`)
      if (processosInvalidos.size > 0) partes.push(`PROCESSO_EQUIPE nao cadastrado(s) em Padroes: ${[...processosInvalidos].join(', ')}`)
      setErro(`Nao foi possivel salvar. Somente motivos/processos cadastrados em Padroes podem ser salvos. ${partes.join(' | ')}`)
      return
    }

    // Só exige os campos obrigatórios nas linhas criadas/editadas NESTA
    // sessão (linhasTocadas) — linha legada que ninguém tocou continua
    // salvando normal, sem travar o uso de hoje por causa de um histórico
    // que ainda não foi todo corrigido (decisão do Gileno).
    const comCampoFaltando = linhasAtuais
      .filter(l => linhasTocadas.has(l._tmpId))
      .map(normalizarLinha)
      .filter(l => !linhaVazia(l))
      .map(l => ({ linha: l, faltando: camposObrigatoriosFaltando(l) }))
      .filter(x => x.faltando.length > 0)
    if (comCampoFaltando.length > 0) {
      const lista = comCampoFaltando.slice(0, 6).map(x => mensagemCampoObrigatorio(x.linha, x.faltando)).join(' | ')
      const resto = comCampoFaltando.length > 6 ? ` | + ${comCampoFaltando.length - 6} outra(s) linha(s) com campo obrigatorio vazio` : ''
      setErro(`Nao foi possivel salvar. ${comCampoFaltando.length} linha(s) criada(s)/editada(s) agora com campo obrigatorio em branco: ${lista}${resto}`)
      return
    }

    if (JSON.stringify(normalizadas) === snapshotEdicao) {
      setEditando(null)
      setMsg('Nenhuma alteracao detectada nesta aba. Nada foi salvo, a data de atualizacao foi mantida.')
      return
    }

    setSalvando(true)
    try {
      await supabase.from('estrutura_planilha_linhas').delete().eq('planilha_id', abaAtiva)
      if (normalizadas.length > 0) {
        const payload = normalizadas.map((l, i) => ({
          planilha_id: abaAtiva,
          ordem: i + 1,
          dados: l,
          criado_por: usuarioLogado?.login,
          atualizado_por: usuarioLogado?.login,
        }))
        const { error } = await supabase.from('estrutura_planilha_linhas').insert(payload)
        if (error) throw error
      }
      const agora = new Date().toISOString()
      const { error: errAba } = await supabase.from('estrutura_planilhas')
        .update({ status: 'SALVO', atualizado_por: usuarioLogado?.login, atualizado_em: agora })
        .eq('id', abaAtiva)
      if (errAba) throw errAba
      setPlanilhas(prev => prev.map(p => p.id === abaAtiva ? { ...p, atualizado_por: usuarioLogado?.login, atualizado_em: agora } : p))
      setLinhasPorAba(prev => ({ ...prev, [abaAtiva]: normalizadas.length ? normalizadas.map(dadosParaLinha) : [novaLinha(), novaLinha(), novaLinha()] }))
      setEditando(null)
      setMsg('Aba salva com sucesso.')
    } catch (e) {
      setErro(e.message || String(e))
    } finally {
      setSalvando(false)
    }
  }

  const salvarMotivo = async () => {
    if (!podeConfigurarMotivos) return
    const descricao = normalizarSituacao(motivoForm.descricao)
    if (!descricao) { setErro('Informe a descricao do motivo.'); return }
    try {
      const { error } = await supabase.from('motivos_situacao_estrutura').upsert({
        descricao,
        cor_fundo: motivoForm.cor_fundo,
        cor_texto: motivoForm.cor_texto,
        permite_importar_estrutura: motivoForm.permite_importar_estrutura,
        ativo: true,
        ordem_exibicao: motivoForm.permite_importar_estrutura ? 3 : 50,
        criado_por: usuarioLogado?.login,
        atualizado_por: usuarioLogado?.login,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'descricao' })
      if (error) throw error
      setMotivoForm({ descricao: '', cor_fundo: '#f1f5f9', cor_texto: '#334155', permite_importar_estrutura: false })
      await carregar()
      setMsg('Motivo salvo.')
    } catch (e) {
      setErro(e.message || String(e))
    }
  }

  const excluirMotivo = async (motivo) => {
    if (!podeConfigurarMotivos) return
    const descricao = normalizarSituacao(motivo?.descricao)
    if (!descricao) return
    if (motivo?.permite_importar_estrutura) {
      setErro('Motivos que permitem importar para a estrutura nao podem ser excluidos por seguranca.')
      return
    }
    if (!window.confirm(`Excluir o motivo ${descricao}? Ele sera removido da lista de escolha, mas registros ja preenchidos permanecem com o texto salvo.`)) return
    try {
      const { error } = await supabase.from('motivos_situacao_estrutura')
        .update({
          ativo: false,
          atualizado_por: usuarioLogado?.login,
          atualizado_em: new Date().toISOString(),
        })
        .eq('descricao', descricao)
      if (error) throw error
      setMotivos(prev => prev.filter(m => normalizarSituacao(m.descricao) !== descricao))
      if (motivoRapido === descricao) setMotivoRapido('')
      setMsg(`Motivo ${descricao} excluido da lista.`)
    } catch (e) {
      setErro(e.message || String(e))
    }
  }

  const salvarProcessoEquipe = async () => {
    if (!podeConfigurarMotivos) return
    const descricao = normalizarProcesso(processoForm.descricao)
    if (!descricao) { setErro('Informe a descricao do processo.'); return }
    try {
      const { error } = await supabase.from('processos_equipe_estrutura').upsert({
        descricao,
        ativo: true,
        ordem_exibicao: (processosEquipe?.length || 0) + 1,
        criado_por: usuarioLogado?.login,
        atualizado_por: usuarioLogado?.login,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'descricao' })
      if (error) throw error
      setProcessoForm({ descricao: '' })
      await carregar()
      setMsg('Processo salvo.')
    } catch (e) {
      setErro(e.message || String(e))
    }
  }

  const excluirProcessoEquipe = async (processo) => {
    if (!podeConfigurarMotivos) return
    const descricao = normalizarProcesso(processo?.descricao)
    if (!descricao) return
    if (!window.confirm(`Excluir o processo ${descricao}? Ele sera removido da lista de escolha, mas registros ja preenchidos permanecem com o texto salvo.`)) return
    try {
      const { error } = await supabase.from('processos_equipe_estrutura')
        .update({
          ativo: false,
          atualizado_por: usuarioLogado?.login,
          atualizado_em: new Date().toISOString(),
        })
        .eq('descricao', descricao)
      if (error) throw error
      setProcessosEquipe(prev => prev.filter(p => normalizarProcesso(p.descricao) !== descricao))
      if (processoRapido === descricao) setProcessoRapido('')
      setMsg(`Processo ${descricao} excluido da lista.`)
    } catch (e) {
      setErro(e.message || String(e))
    }
  }

  const importarTotal = async () => {
    if (!podeImportar) return
    if (confirmacao !== 'CONFIRMAR CARGA') {
      setErro('Digite CONFIRMAR CARGA antes de importar o Total para o banco.')
      return
    }
    if (matriculasDuplicadas.length > 0) {
      setErro(`Existem matrículas duplicadas no Total — corrija antes de importar: ${matriculasDuplicadas.map(mensagemMatriculaDuplicada).join(' | ')}`)
      return
    }
    // Campo obrigatório em branco no Total NÃO bloqueia o Importar Total —
    // só mexe no que foi criado/editado agora (ver salvarAba); o Total
    // Consolidado reúne o que já estava salvo em cada aba, inclusive linha
    // legada anterior a essa validação. Fica só o aviso visual (banner +
    // célula vermelha) acima, informando o que ainda falta completar.
    setSalvando(true)
    setErro('')
    setRelatorioImportacao(null)
    try {
      const resumo = await importarEstrutura(linhasTotal)
      await supabase.from('estrutura_planilha_importacoes').insert({
        usuario_login: usuarioLogado?.login,
        usuario_nome: usuarioLogado?.nome,
        total_linhas: linhasTotal.length,
        linhas_importadas: resumo.total,
        resumo,
        status: 'CONCLUIDA',
      })
      setRelatorioImportacao(resumo)
      setConfirmacao('')
      setMsg(`Importacao online concluida: ${resumo.total} linha(s) na estrutura atual.`)
    } catch (e) {
      setErro(e.message || String(e))
    } finally {
      setSalvando(false)
    }
  }

  if (!podeVisualizar) {
    return <div style={cardStyle}>Seu perfil nao tem permissao para visualizar a Estrutura Online.</div>
  }

  if (loading) {
    return <div style={cardStyle}>Carregando Estrutura Online...</div>
  }

  const linhasOrdenadas = abaAtiva === 'TOTAL'
    ? ordenarPorSituacao(linhasTotal, motivos, ordenacao, ordenacaoSecundaria)
    : ordenarLinhas(linhasAtuais, motivos, ordenacao, estaEditando, ordenacaoSecundaria)

  // Filtro por coluna funciona tanto em leitura quanto editando — edição de
  // célula (atualizarCelula) e colar do Excel (colarExcel) já resolvem a
  // linha pelo _tmpId (não pela posição na lista renderizada), então
  // filtrar não quebra edição de 1 célula/linha de cada vez. O único cuidado
  // é colar um BLOCO de várias linhas do Excel com filtro ativo — aí o
  // aviso abaixo (pertoDoFiltro) avisa pra limpar o filtro antes.
  // Busca global (buscaGlobal) é OR entre colunas; os filtros por coluna
  // (filtrosColuna) são AND entre si — os dois juntam com AND (precisa
  // bater nos filtros por coluna E conter a busca global em algum lugar).
  const linhasRender = linhasOrdenadas.filter(l =>
    COLUNAS_ESPERADAS.every(c => valorContemFiltro(l[c], filtrosColuna[c])) &&
    (!norm(buscaGlobal) || COLUNAS_ESPERADAS.some(c => valorContemFiltro(l[c], buscaGlobal)))
  )

  const opcoesMotivosAtuais = motivos.map(m => normalizarSituacao(m.descricao)).filter(Boolean)
  const opcoesProcessosAtuais = processosEquipe.map(p => normalizarProcesso(p.descricao)).filter(Boolean)
  const existeLinhaInvalida = linhasOrdenadas.some(l => {
    const situacao = normalizarSituacao(l.descr_situacao)
    const processo = normalizarProcesso(l.processo_equipe)
    return (situacao && !opcoesMotivosAtuais.includes(situacao)) || (processo && !opcoesProcessosAtuais.includes(processo))
  })

  const linhasComCampoFaltando = linhasOrdenadas
    .map(l => ({ linha: l, faltando: camposObrigatoriosFaltando(l) }))
    .filter(x => x.faltando.length > 0)

  const alternarOrdenacao = (coluna) => {
    setOrdenacao(prev => ({
      coluna,
      direcao: prev.coluna === coluna && prev.direcao === 'asc' ? 'desc' : 'asc',
    }))
  }

  const redimensionarColuna = (coluna, largura) => {
    setLargurasColunas(prev => ({ ...prev, [coluna]: Math.max(80, Math.min(520, Math.round(largura))) }))
  }

  const autoAjustarColunas = () => {
    const proximas = {}
    COLUNAS_ESPERADAS.forEach(coluna => {
      proximas[coluna] = larguraAutomaticaColuna(coluna, linhasRender)
    })
    setLargurasColunas(prev => ({ ...prev, ...proximas }))
    setMsg('Largura das colunas ajustada ao conteudo visivel.')
  }

  const exportarExcel = () => {
    const linhas = linhasRender.filter(l => !linhaVazia(l))
    if (linhas.length === 0) {
      setErro('Nao ha linhas para exportar nesta aba.')
      return
    }

    const incluirAba = abaAtiva === 'TOTAL'
    const colunas = incluirAba ? ['aba', ...COLUNAS_ESPERADAS] : COLUNAS_ESPERADAS
    const dados = linhas.map(linha => {
      const linhaNormalizada = normalizarLinha(linha)
      const item = {}
      if (incluirAba) item.aba = linha.origem_aba || ''
      COLUNAS_ESPERADAS.forEach(coluna => {
        item[coluna] = linhaNormalizada[coluna] || ''
      })
      return item
    })

    const ws = XLSX.utils.json_to_sheet(dados, { header: colunas })
    ws['!cols'] = colunas.map(coluna => ({
      wch: Math.max(12, Math.min(45, Math.round((largurasColunas[coluna] || larguraPadraoColuna(coluna)) / 7))),
    }))
    const wb = XLSX.utils.book_new()
    const nomeAba = (abaAtiva === 'TOTAL' ? 'Total Consolidado' : abaAtual?.nome || 'Estrutura').slice(0, 31)
    XLSX.utils.book_append_sheet(wb, ws, nomeAba)
    XLSX.writeFile(wb, `${nomeArquivoSeguro(nomeAba)}_${hojeISO()}.xlsx`)
    setMsg(`Excel da aba ${nomeAba} gerado com sucesso.`)
  }

  return (
    <div>
      {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13, fontWeight: 700 }}>{erro}</div>}
      {msg && <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13, fontWeight: 700 }}>{msg}</div>}

      <div style={{ ...cardStyle, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', margin: 0 }}>Estrutura Online</h2>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Cole dados do Excel, salve por aba e importe o Total consolidado com seguranca.</p>
          </div>
          {podeEditar && planilhas.length === 0 && <button onClick={criarAbasIniciais} disabled={salvando} style={botao('#0f766e')}>Criar Plantao e Comercial</button>}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {planilhas.map(p => (
            <button key={p.id} onClick={() => setAbaAtiva(p.id)} style={abaBtn(abaAtiva === p.id)}>
              {p.nome}
              <span style={{ display: 'block', fontSize: 10, opacity: 0.7 }}>Atualizado: {formatBR(p.atualizado_em)}</span>
            </button>
          ))}
          {podeEditar && planilhas.length < 8 && <button onClick={criarAba} style={abaBtn(false)}>+ Nova aba</button>}
          <button onClick={() => setAbaAtiva('TOTAL')} style={abaBtn(abaAtiva === 'TOTAL')}>Total Consolidado<span style={{ display: 'block', fontSize: 10, opacity: 0.7 }}>{linhasTotal.length} linha(s)</span></button>
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', margin: 0 }}>
              {abaAtiva === 'TOTAL' ? 'Total Consolidado' : (abaAtual?.nome || 'Selecione uma aba')}
            </p>
            <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
              {abaAtiva === 'TOTAL'
                ? 'Somente leitura. Apenas ATIVO e RESERVA entram no banco.'
                : estaEditando ? 'Modo edicao liberado. Cole do Excel e salve para travar a aba.' : 'Modo leitura. Clique em Editar para alterar.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {abaAtiva !== 'TOTAL' && podeEditar && !estaEditando && abaAtual && <button onClick={() => iniciarEdicao(abaAtiva)} style={botao('#1e40af')}>Editar</button>}
            {abaAtiva !== 'TOTAL' && podeEditar && estaEditando && <button onClick={salvarAba} disabled={salvando} style={botao('#0f766e')}>Salvar</button>}
            {abaAtiva !== 'TOTAL' && podeEditar && estaEditando && <button onClick={adicionarLinha} style={botao('#475569')}>Adicionar linha</button>}
            {abaAtiva !== 'TOTAL' && podeEditar && estaEditando && <button onClick={limparTabelaAtual} style={botao('#b91c1c')}>Limpar tabela</button>}
            {planilhas.length > 0 && <button onClick={autoAjustarColunas} style={botao('#0369a1')}>Ajustar colunas</button>}
            {planilhas.length > 0 && <button onClick={exportarExcel} style={botao('#16a34a')}>Exportar Excel</button>}
            {planilhas.length > 0 && <button onClick={() => setTabelaAmpliada(true)} style={botao('#0f172a')}>Tela cheia</button>}
            {abaAtiva !== 'TOTAL' && podeEditar && abaAtual && <button onClick={renomearAba} style={botao('#64748b')}>Renomear</button>}
            {podeConfigurarMotivos && <button onClick={() => setMostrarMotivos(m => !m)} style={botao(mostrarMotivos ? '#334155' : '#7c3aed')}>{mostrarMotivos ? 'Fechar padroes' : 'Padroes'}</button>}
            {temFiltroAtivo && <button onClick={() => { setFiltrosColuna({}); setBuscaGlobal('') }} style={botao('#b91c1c')}>Limpar filtros</button>}
            {planilhas.length > 0 && <button onClick={() => setColunasCongeladas(v => !v)} style={botao(colunasCongeladas ? '#0f766e' : '#64748b')}>{colunasCongeladas ? '📌 Descongelar colunas' : '📌 Congelar matrícula/colaborador'}</button>}
            {abaAtiva !== 'TOTAL' && podeEditar && estaEditando && historico.length > 0 && <button onClick={desfazer} style={botao('#9333ea')}>↩ Desfazer</button>}
          </div>
        </div>

        <BuscaESortSecundario
          buscaGlobal={buscaGlobal}
          onBuscaGlobal={setBuscaGlobal}
          ordenacaoSecundaria={ordenacaoSecundaria}
          onOrdenacaoSecundaria={setOrdenacaoSecundaria}
        />

        {existeLinhaInvalida && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 12, fontWeight: 700 }}>
            🔴 As linhas destacadas em vermelho tem DESCR_SITUACAO ou PROCESSO_EQUIPE fora de Padroes. Corrija o valor ou cadastre-o em Padroes antes de salvar.
          </div>
        )}

        {linhasComCampoFaltando.length > 0 && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 12, fontWeight: 700 }}>
            🔴 {linhasComCampoFaltando.length} linha(s) com campo obrigatório em branco (destacado em vermelho na célula) — preencha antes de salvar:
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2, fontWeight: 600 }}>
              {linhasComCampoFaltando.slice(0, 8).map((x, i) => <span key={i}>{mensagemCampoObrigatorio(x.linha, x.faltando)}</span>)}
              {linhasComCampoFaltando.length > 8 && <span>+ {linhasComCampoFaltando.length - 8} outra(s) linha(s)...</span>}
            </div>
          </div>
        )}

        {temFiltroAtivo && (
          <p style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 8 }}>
            Mostrando {linhasRender.filter(l => !linhaVazia(l)).length} de {linhasOrdenadas.filter(l => !linhaVazia(l)).length} linha(s) — filtro ativo.
          </p>
        )}

        {temFiltroAtivo && estaEditando && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 10, padding: '8px 10px', marginBottom: 10, fontSize: 11.5, fontWeight: 700, color: '#92400e' }}>
            ⚠️ Editando com filtro ativo: editar uma célula de cada vez funciona normal. Só evite colar um BLOCO de várias linhas do Excel agora — limpe o filtro antes, senão as linhas coladas podem cair em posições erradas.
          </div>
        )}

        <ResumoSituacoes linhas={abaAtiva === 'TOTAL' ? linhasTotal : linhasAtuais} motivos={motivos} />

        {estaEditando && abaAtiva !== 'TOTAL' && (
          <BarraSelecaoMassa selecionados={selecionados} motivos={motivos} processosEquipe={processosEquipe} onAplicar={aplicarEmMassa} />
        )}

        {planilhas.length === 0 ? (
          <div style={{ background: '#f8fafc', borderRadius: 12, padding: 24, textAlign: 'center', color: '#64748b', fontWeight: 800 }}>
            Nenhuma aba criada ainda.
          </div>
        ) : (
          <TabelaEstrutura
            linhas={linhasRender}
            motivos={motivos}
            processosEquipe={processosEquipe}
            motivoRapido={motivoRapido}
            processoRapido={processoRapido}
            editando={estaEditando && abaAtiva !== 'TOTAL'}
            onChange={atualizarCelula}
            onPaste={colarExcel}
            onRemove={removerLinha}
            total={abaAtiva === 'TOTAL'}
            largurasColunas={largurasColunas}
            onResizeColuna={redimensionarColuna}
            ordenacao={ordenacao}
            onOrdenar={alternarOrdenacao}
            filtros={filtrosColuna}
            onFiltrar={atualizarFiltroColuna}
            duplicadas={matriculasDuplicadasSet}
            colunasCongeladas={colunasCongeladas}
            selecionados={selecionados}
            onToggleSelecao={alternarSelecao}
            onToggleSelecaoTodos={alternarSelecaoTodos}
          />
        )}
      </div>

      {tabelaAmpliada && planilhas.length > 0 && (
        <div style={overlayStyle}>
          <div style={fullPanelStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', margin: 0 }}>
                  {abaAtiva === 'TOTAL' ? 'Total Consolidado' : (abaAtual?.nome || 'Estrutura Online')}
                </h3>
                <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  Visualizacao ampliada em formato de planilha. {estaEditando && abaAtiva !== 'TOTAL' ? 'Modo edicao ativo.' : 'Modo leitura.'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {abaAtiva !== 'TOTAL' && podeEditar && !estaEditando && abaAtual && <button onClick={() => iniciarEdicao(abaAtiva)} style={botao('#1e40af')}>Editar</button>}
                {abaAtiva !== 'TOTAL' && podeEditar && estaEditando && <button onClick={salvarAba} disabled={salvando} style={botao('#0f766e')}>Salvar</button>}
                {abaAtiva !== 'TOTAL' && podeEditar && estaEditando && <button onClick={adicionarLinha} style={botao('#475569')}>Adicionar linha</button>}
                {abaAtiva !== 'TOTAL' && podeEditar && estaEditando && <button onClick={limparTabelaAtual} style={botao('#b91c1c')}>Limpar tabela</button>}
                <button onClick={autoAjustarColunas} style={botao('#0369a1')}>Ajustar colunas</button>
                <button onClick={exportarExcel} style={botao('#16a34a')}>Exportar Excel</button>
                {temFiltroAtivo && <button onClick={() => { setFiltrosColuna({}); setBuscaGlobal('') }} style={botao('#b91c1c')}>Limpar filtros</button>}
                <button onClick={() => setColunasCongeladas(v => !v)} style={botao(colunasCongeladas ? '#0f766e' : '#64748b')}>{colunasCongeladas ? '📌 Descongelar colunas' : '📌 Congelar matrícula/colaborador'}</button>
                {abaAtiva !== 'TOTAL' && podeEditar && estaEditando && historico.length > 0 && <button onClick={desfazer} style={botao('#9333ea')}>↩ Desfazer</button>}
                <button onClick={() => setTabelaAmpliada(false)} style={botao('#334155')}>Fechar</button>
              </div>
            </div>
            <BuscaESortSecundario
              buscaGlobal={buscaGlobal}
              onBuscaGlobal={setBuscaGlobal}
              ordenacaoSecundaria={ordenacaoSecundaria}
              onOrdenacaoSecundaria={setOrdenacaoSecundaria}
            />
            {existeLinhaInvalida && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 12, fontWeight: 700 }}>
                🔴 As linhas destacadas em vermelho tem DESCR_SITUACAO ou PROCESSO_EQUIPE fora de Padroes. Corrija o valor ou cadastre-o em Padroes antes de salvar.
              </div>
            )}
            {linhasComCampoFaltando.length > 0 && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 12, fontWeight: 700 }}>
                🔴 {linhasComCampoFaltando.length} linha(s) com campo obrigatório em branco (destacado em vermelho na célula) — preencha antes de salvar:
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2, fontWeight: 600 }}>
                  {linhasComCampoFaltando.slice(0, 8).map((x, i) => <span key={i}>{mensagemCampoObrigatorio(x.linha, x.faltando)}</span>)}
                  {linhasComCampoFaltando.length > 8 && <span>+ {linhasComCampoFaltando.length - 8} outra(s) linha(s)...</span>}
                </div>
              </div>
            )}
            {temFiltroAtivo && (
              <p style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 8 }}>
                Mostrando {linhasRender.filter(l => !linhaVazia(l)).length} de {linhasOrdenadas.filter(l => !linhaVazia(l)).length} linha(s) — filtro ativo.
              </p>
            )}
            {temFiltroAtivo && estaEditando && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 10, padding: '8px 10px', marginBottom: 10, fontSize: 11.5, fontWeight: 700, color: '#92400e' }}>
                ⚠️ Editando com filtro ativo: editar uma célula de cada vez funciona normal. Só evite colar um BLOCO de várias linhas do Excel agora — limpe o filtro antes, senão as linhas coladas podem cair em posições erradas.
              </div>
            )}
            <ResumoSituacoes linhas={abaAtiva === 'TOTAL' ? linhasTotal : linhasAtuais} motivos={motivos} />
            {estaEditando && abaAtiva !== 'TOTAL' && (
              <BarraSelecaoMassa selecionados={selecionados} motivos={motivos} processosEquipe={processosEquipe} onAplicar={aplicarEmMassa} />
            )}
            <TabelaEstrutura
              linhas={linhasRender}
              motivos={motivos}
              processosEquipe={processosEquipe}
              motivoRapido={motivoRapido}
              processoRapido={processoRapido}
              editando={estaEditando && abaAtiva !== 'TOTAL'}
              onChange={atualizarCelula}
              onPaste={colarExcel}
              onRemove={removerLinha}
              total={abaAtiva === 'TOTAL'}
              altura="calc(100vh - 170px)"
              largurasColunas={largurasColunas}
              onResizeColuna={redimensionarColuna}
              ordenacao={ordenacao}
              onOrdenar={alternarOrdenacao}
              filtros={filtrosColuna}
              onFiltrar={atualizarFiltroColuna}
              duplicadas={matriculasDuplicadasSet}
              colunasCongeladas={colunasCongeladas}
              selecionados={selecionados}
              onToggleSelecao={alternarSelecao}
              onToggleSelecaoTodos={alternarSelecaoTodos}
            />
          </div>
        </div>
      )}

      {mostrarMotivos && podeConfigurarMotivos && (
        <div style={{ ...cardStyle, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 900, margin: 0 }}>Padroes da Estrutura Online</h3>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#64748b', fontWeight: 700 }}>Cadastre listas oficiais para as colunas DESCR_SITUACAO e PROCESSO_EQUIPE.</p>
            </div>
            <button onClick={() => setMostrarMotivos(false)} style={botao('#334155')}>Fechar</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <button onClick={() => setAbaPadroes('situacoes')} style={botao(abaPadroes === 'situacoes' ? '#1e40af' : '#e2e8f0', abaPadroes === 'situacoes' ? '#fff' : '#0f172a')}>DESCR_SITUACAO</button>
            <button onClick={() => setAbaPadroes('processos')} style={botao(abaPadroes === 'processos' ? '#1e40af' : '#e2e8f0', abaPadroes === 'processos' ? '#fff' : '#0f172a')}>PROCESSO_EQUIPE</button>
          </div>

          {abaPadroes === 'situacoes' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr auto auto', gap: 8, alignItems: 'end', marginBottom: 12 }}>
                <Campo label="Descricao"><input style={inputStyle} value={motivoForm.descricao} onChange={e => setMotivoForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: AFASTADO" /></Campo>
                <Campo label="Cor"><select style={inputStyle} value={`${motivoForm.cor_fundo}|${motivoForm.cor_texto}`} onChange={e => { const [fundo, texto] = e.target.value.split('|'); setMotivoForm(f => ({ ...f, cor_fundo: fundo, cor_texto: texto })) }}>{CORES_MOTIVO.map(c => <option key={c.nome} value={`${c.fundo}|${c.texto}`}>{c.nome}</option>)}</select></Campo>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: '#334155' }}>
                  <input type="checkbox" checked={motivoForm.permite_importar_estrutura} onChange={e => setMotivoForm(f => ({ ...f, permite_importar_estrutura: e.target.checked }))} />
                  Permite importar
                </label>
                <button onClick={salvarMotivo} style={botao('#7c3aed')}>Salvar situacao</button>
              </div>
              <ResumoSituacoes linhas={motivos.map(m => ({ descr_situacao: m.descricao, matricula: '1', colaborador: 'x' }))} motivos={motivos} />
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640, background: '#fff' }}>
                  <thead>
                    <tr>
                      <Th>usar</Th>
                      <Th>situacao</Th>
                      <Th>importa</Th>
                      <Th>cor</Th>
                      <Th>excluir</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {motivos.map(m => (
                      <tr key={m.descricao}>
                        <Td>
                          <button
                            onClick={() => {
                              setMotivoRapido(normalizarSituacao(m.descricao))
                              setMsg(`Situacao ${normalizarSituacao(m.descricao)} selecionada para ajuste manual na coluna DESCR_SITUACAO.`)
                            }}
                            style={botao(motivoRapido === normalizarSituacao(m.descricao) ? '#0f766e' : '#64748b')}
                          >
                            {motivoRapido === normalizarSituacao(m.descricao) ? 'Selecionada' : 'Selecionar'}
                          </button>
                        </Td>
                        <Td>
                          <span style={{ borderRadius: 999, padding: '5px 10px', fontSize: 11, fontWeight: 900, background: m.cor_fundo, color: m.cor_texto, border: `1px solid ${m.cor_texto}22` }}>
                            {normalizarSituacao(m.descricao)}
                          </span>
                        </Td>
                        <Td>{m.permite_importar_estrutura ? 'Sim' : 'Nao'}</Td>
                        <Td><span style={{ display: 'inline-block', width: 48, height: 18, borderRadius: 999, background: m.cor_fundo, border: `1px solid ${m.cor_texto}44` }} /></Td>
                        <Td>
                          <button
                            onClick={() => excluirMotivo(m)}
                            disabled={m.permite_importar_estrutura}
                            title={m.permite_importar_estrutura ? 'Situacao protegida porque entra na importacao da estrutura' : 'Excluir situacao da lista'}
                            style={{
                              ...botao(m.permite_importar_estrutura ? '#cbd5e1' : '#dc2626'),
                              color: m.permite_importar_estrutura ? '#64748b' : '#fff',
                              cursor: m.permite_importar_estrutura ? 'not-allowed' : 'pointer',
                            }}
                          >
                            Excluir
                          </button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {abaPadroes === 'processos' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end', marginBottom: 12 }}>
                <Campo label="Processo equipe"><input style={inputStyle} value={processoForm.descricao} onChange={e => setProcessoForm({ descricao: e.target.value })} placeholder="Ex: CORTE" /></Campo>
                <button onClick={salvarProcessoEquipe} style={botao('#7c3aed')}>Salvar processo</button>
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520, background: '#fff' }}>
                  <thead>
                    <tr>
                      <Th>usar</Th>
                      <Th>processo</Th>
                      <Th>ordem</Th>
                      <Th>excluir</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {processosEquipe.map(p => (
                      <tr key={p.descricao}>
                        <Td>
                          <button
                            onClick={() => {
                              setProcessoRapido(normalizarProcesso(p.descricao))
                              setMsg(`Processo ${normalizarProcesso(p.descricao)} selecionado para ajuste manual na coluna PROCESSO_EQUIPE.`)
                            }}
                            style={botao(processoRapido === normalizarProcesso(p.descricao) ? '#0f766e' : '#64748b')}
                          >
                            {processoRapido === normalizarProcesso(p.descricao) ? 'Selecionado' : 'Selecionar'}
                          </button>
                        </Td>
                        <Td><span style={{ borderRadius: 999, padding: '5px 10px', fontSize: 11, fontWeight: 900, background: '#e0f2fe', color: '#075985', border: '1px solid #07598522' }}>{normalizarProcesso(p.descricao)}</span></Td>
                        <Td>{p.ordem_exibicao || '-'}</Td>
                        <Td><button onClick={() => excluirProcessoEquipe(p)} style={botao('#dc2626')}>Excluir</button></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ ...cardStyle, borderColor: '#93c5fd', background: '#eff6ff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 900, color: '#1e3a8a', margin: 0 }}>Importar Total para estrutura_equipes</p>
            <p style={{ fontSize: 12, color: '#1e40af', marginTop: 4 }}>
              Total: {linhasTotal.length} linha(s). Importaveis: {linhasTotalImportaveis.length}. Fora da carga: {linhasTotal.length - linhasTotalImportaveis.length}.
            </p>
            {matriculasDuplicadas.length > 0 && (
              <div style={{ marginTop: 6, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 10px' }}>
                <p style={{ fontSize: 11, fontWeight: 900, color: '#991b1b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
                  ⚠️ {matriculasDuplicadas.length} matrícula{matriculasDuplicadas.length === 1 ? '' : 's'} duplicada{matriculasDuplicadas.length === 1 ? '' : 's'} — corrija antes de importar
                </p>
                {matriculasDuplicadas.map(d => (
                  <p key={d.matricula} style={{ fontSize: 12, color: '#991b1b', fontWeight: 600, margin: '2px 0', lineHeight: 1.5 }}>
                    {mensagemMatriculaDuplicada(d)}
                  </p>
                ))}
              </div>
            )}
          </div>
          <div style={{ minWidth: 260 }}>
            <input value={confirmacao} onChange={e => setConfirmacao(e.target.value)} placeholder="Digite CONFIRMAR CARGA" style={{ ...inputStyle, marginBottom: 8 }} />
            <button onClick={importarTotal} disabled={!podeImportar || salvando || confirmacao !== 'CONFIRMAR CARGA'} style={{ ...botao('#0f766e'), width: '100%', opacity: (!podeImportar || salvando || confirmacao !== 'CONFIRMAR CARGA') ? 0.55 : 1 }}>
              Importar Total para o banco
            </button>
          </div>
        </div>
        {relatorioImportacao && (
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
            {Object.entries(relatorioImportacao).map(([k, v]) => (
              <div key={k} style={{ background: '#fff', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                <p style={{ fontSize: 18, fontWeight: 900, color: '#0f766e', margin: 0 }}>{v}</p>
                <p style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 800 }}>{k}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ResumoSituacoes({ linhas, motivos }) {
  const resumo = resumirSituacoes(linhas, motivos)
  if (resumo.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
      {resumo.map(({ info, total }) => (
        <span key={info.descricao} style={{
          borderRadius: 999,
          padding: '5px 10px',
          fontSize: 11,
          fontWeight: 900,
          background: info.cor_fundo,
          color: info.cor_texto,
          border: `1px solid ${info.cor_texto}22`,
        }}>
          {info.descricao}: {total}
        </span>
      ))}
    </div>
  )
}

// Colunas que ficam fixas (position: sticky) quando colunasCongeladas está
// ligado — matrícula/colaborador são as que identificam "quem é" a linha,
// o par que some quando você rola a tabela pra direita pra ver
// superv_campo/coordenador etc. Não precisam ser as primeiras colunas: um
// sticky left funciona mesmo com colunas não-fixas (regional/polo/base...)
// passando por baixo ao rolar — ver offsetColunaFixa.
const COLUNAS_FIXAS = ['matricula', 'colaborador']

function offsetColunaFixa(coluna, largura) {
  if (coluna === 'matricula') return 0
  if (coluna === 'colaborador') return largura('matricula')
  return null
}

// ─── Busca global (1 caixa só, qualquer coluna) + ordenação secundária (até
// 2 colunas extras de desempate, escolhidas em dropdown — sem precisar
// clicar em cabeçalho com Shift ou decorar atalho nenhum).
function BuscaESortSecundario({ buscaGlobal, onBuscaGlobal, ordenacaoSecundaria, onOrdenacaoSecundaria }) {
  const slots = ordenacaoSecundaria.length === 2 ? ordenacaoSecundaria : [{ coluna: '', direcao: 'asc' }, { coluna: '', direcao: 'asc' }]
  const atualizarSlot = (i, patch) => {
    const nova = [...slots]
    nova[i] = { ...nova[i], ...patch }
    onOrdenacaoSecundaria(nova)
  }
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
      <input
        value={buscaGlobal}
        onChange={e => onBuscaGlobal(e.target.value)}
        placeholder="🔍 Buscar em qualquer coluna..."
        style={{ ...inputStyle, flex: '1 1 220px', minWidth: 180, padding: '8px 10px', fontSize: 12 }}
      />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#334155' }}>Ordenar também por:</span>
        {[0, 1].map(i => (
          <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <select
              value={slots[i].coluna}
              onChange={e => atualizarSlot(i, { coluna: e.target.value })}
              style={{ ...filtroInputStyle, width: 150, padding: '5px 6px' }}
            >
              <option value="">— nenhuma —</option>
              {COLUNAS_ESPERADAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {slots[i].coluna && (
              <button
                type="button"
                onClick={() => atualizarSlot(i, { direcao: slots[i].direcao === 'asc' ? 'desc' : 'asc' })}
                style={{ ...botao('#64748b'), padding: '5px 8px', fontSize: 10 }}
              >{slots[i].direcao === 'asc' ? 'A-Z' : 'Z-A'}</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Edição em massa: aparece só quando tem linha selecionada (checkbox na
// 1ª coluna da grade, modo edição). Escopo limitado a DESCR_SITUACAO e
// PROCESSO_EQUIPE — as 2 únicas colunas com lista fechada de valores
// (Padrões), pra evitar digitar algo errado em várias linhas de uma vez.
function BarraSelecaoMassa({ selecionados, motivos, processosEquipe, onAplicar }) {
  const [situacaoEscolhida, setSituacaoEscolhida] = useState('')
  const [processoEscolhido, setProcessoEscolhido] = useState('')
  if (!selecionados || selecionados.size === 0) return null
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', background: '#eff6ff', border: '1.5px solid #93c5fd', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
      <span style={{ fontSize: 12, fontWeight: 900, color: '#1e3a8a' }}>{selecionados.size} linha(s) selecionada(s):</span>
      <select value={situacaoEscolhida} onChange={e => setSituacaoEscolhida(e.target.value)} style={{ ...filtroInputStyle, width: 170, padding: '6px 8px' }}>
        <option value="">DESCR_SITUACAO...</option>
        {(motivos || []).map(m => <option key={m.descricao} value={normalizarSituacao(m.descricao)}>{m.descricao}</option>)}
      </select>
      <button
        type="button" disabled={!situacaoEscolhida}
        onClick={() => { onAplicar('descr_situacao', situacaoEscolhida); setSituacaoEscolhida('') }}
        style={botao(situacaoEscolhida ? '#1e40af' : '#cbd5e1')}
      >Aplicar situação</button>
      <select value={processoEscolhido} onChange={e => setProcessoEscolhido(e.target.value)} style={{ ...filtroInputStyle, width: 170, padding: '6px 8px' }}>
        <option value="">PROCESSO_EQUIPE...</option>
        {(processosEquipe || []).map(p => <option key={p.descricao} value={normalizarProcesso(p.descricao)}>{p.descricao}</option>)}
      </select>
      <button
        type="button" disabled={!processoEscolhido}
        onClick={() => { onAplicar('processo_equipe', processoEscolhido); setProcessoEscolhido('') }}
        style={botao(processoEscolhido ? '#1e40af' : '#cbd5e1')}
      >Aplicar processo</button>
    </div>
  )
}

function TabelaEstrutura({
  linhas, motivos, processosEquipe, motivoRapido, processoRapido, editando, onChange, onPaste, onRemove, total,
  altura = 520, largurasColunas = {}, onResizeColuna, ordenacao, onOrdenar, filtros = {}, onFiltrar,
  duplicadas, colunasCongeladas, selecionados, onToggleSelecao, onToggleSelecaoTodos,
}) {
  const opcoesMotivos = (motivos || []).map(m => normalizarSituacao(m.descricao)).filter(Boolean)
  const opcoesProcessos = (processosEquipe || []).map(p => normalizarProcesso(p.descricao)).filter(Boolean)
  const largura = coluna => largurasColunas[coluna] || larguraPadraoColuna(coluna)
  const mostrarSelecao = editando && !!onToggleSelecao
  const todosVisiveisSelecionados = mostrarSelecao && linhas.length > 0 && linhas.every(l => selecionados?.has(l._tmpId))

  // Navegação por teclado: seta cima/baixo (e Enter/Shift+Enter) move o
  // foco pra mesma coluna na linha de cima/baixo — Tab já navega sozinho
  // (ordem natural do DOM), não precisa de código pra isso.
  const navegar = (evento, rowIndex, coluna) => {
    let alvoRow = null
    if (evento.key === 'ArrowDown' || (evento.key === 'Enter' && !evento.shiftKey)) alvoRow = rowIndex + 1
    else if (evento.key === 'ArrowUp' || (evento.key === 'Enter' && evento.shiftKey)) alvoRow = rowIndex - 1
    if (alvoRow === null) return
    const tabela = evento.currentTarget.closest('table')
    const alvo = tabela?.querySelector(`[data-nav="${alvoRow}:${coluna}"]`)
    if (!alvo) return
    evento.preventDefault()
    alvo.focus()
    if (alvo instanceof HTMLInputElement) alvo.select()
  }

  return (
    <div style={{ overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 12, maxHeight: altura }}>
      <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', background: '#fff' }}>
        <colgroup>
          {mostrarSelecao && <col style={{ width: 32 }} />}
          {total && <col style={{ width: 140 }} />}
          {COLUNAS_ESPERADAS.map(c => <col key={c} style={{ width: largura(c) }} />)}
          {editando && <col style={{ width: 110 }} />}
        </colgroup>
        <thead>
          <tr>
            {mostrarSelecao && (
              <th style={{ ...filtroThStyle, position: 'sticky', top: 0, zIndex: 3, textAlign: 'center' }}>
                <input type="checkbox" checked={todosVisiveisSelecionados} onChange={() => onToggleSelecaoTodos(linhas)} title="Selecionar/desmarcar todas as linhas visíveis" />
              </th>
            )}
            {total && <Th width={140}>aba</Th>}
            {COLUNAS_ESPERADAS.map(c => (
              <Th
                key={c}
                width={largura(c)}
                onResize={onResizeColuna ? w => onResizeColuna(c, w) : undefined}
                onSort={onOrdenar ? () => onOrdenar(c) : undefined}
                sortDirection={ordenacao?.coluna === c ? ordenacao.direcao : ''}
                stickyLeft={colunasCongeladas && COLUNAS_FIXAS.includes(c) ? offsetColunaFixa(c, largura) : null}
              >
                {c}{COLUNAS_OBRIGATORIAS.includes(c) && <span title="Campo obrigatório" style={{ color: '#dc2626' }}> *</span>}
              </Th>
            ))}
            {editando && <Th width={110}>acao</Th>}
          </tr>
          {onFiltrar && (
            <tr>
              {mostrarSelecao && <th style={filtroThStyle} />}
              {total && <th style={filtroThStyle} />}
              {COLUNAS_ESPERADAS.map(c => {
                const fixo = colunasCongeladas && COLUNAS_FIXAS.includes(c)
                return (
                  <th
                    key={c}
                    style={{
                      ...filtroThStyle,
                      ...(fixo ? { position: 'sticky', left: offsetColunaFixa(c, largura), zIndex: 2 } : {}),
                    }}
                  >
                    <input
                      value={filtros[c] || ''}
                      onChange={e => onFiltrar(c, e.target.value)}
                      placeholder="Filtrar..."
                      style={filtroInputStyle}
                    />
                  </th>
                )
              })}
              {editando && <th style={filtroThStyle} />}
            </tr>
          )}
        </thead>
        <tbody>
          {linhas.map((linha, rowIndex) => {
            const info = infoSituacao(linha.descr_situacao, motivos)
            const situacaoValor = normalizarSituacao(linha.descr_situacao)
            const processoValor = normalizarProcesso(linha.processo_equipe)
            const situacaoInvalida = situacaoValor && !opcoesMotivos.includes(situacaoValor)
            const processoInvalido = processoValor && !opcoesProcessos.includes(processoValor)
            const linhaInvalida = situacaoInvalida || processoInvalido
            const ehDuplicada = !linhaInvalida && norm(linha.matricula) && duplicadas?.has(linha.matricula)
            const faltandoObrigatorio = camposObrigatoriosFaltando(linha)
            const bgLinha = linhaInvalida ? '#fef2f2' : ehDuplicada ? '#fffbeb' : (situacaoPermitida(linha.descr_situacao) ? '#fff' : '#fafafa')
            return (
              <tr
                key={linha._tmpId || `${linha.origem_aba}_${linha.matricula}_${linha.prefixo}`}
                style={{ background: bgLinha }}
              >
                {mostrarSelecao && (
                  <Td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={!!selecionados?.has(linha._tmpId)} onChange={() => onToggleSelecao(linha._tmpId)} />
                  </Td>
                )}
                {total && <Td><span style={{ fontWeight: 800, color: '#0f766e' }}>{linha.origem_aba}</span></Td>}
                {COLUNAS_ESPERADAS.map(c => {
                  const ehSituacao = c === 'descr_situacao'
                  const ehProcesso = c === 'processo_equipe'
                  const opcoesSelect = ehSituacao ? opcoesMotivos : opcoesProcessos
                  const valorSelect = ehSituacao ? normalizarSituacao(linha[c]) : normalizarProcesso(linha[c])
                  const valorRapido = ehSituacao ? motivoRapido : processoRapido
                  const celulaInvalida = (ehSituacao && situacaoInvalida) || (ehProcesso && processoInvalido)
                  const campoObrigatorioVazio = faltandoObrigatorio.includes(c)
                  const bg = celulaInvalida ? '#fecaca' : campoObrigatorioVazio ? '#fecaca' : (ehSituacao ? info.cor_fundo : undefined)
                  const color = celulaInvalida ? '#7f1d1d' : campoObrigatorioVazio ? '#7f1d1d' : (ehSituacao ? info.cor_texto : '#0f172a')
                  const fixo = colunasCongeladas && COLUNAS_FIXAS.includes(c)
                  const ehMatricula = c === 'matricula'
                  return (
                    <Td
                      key={c}
                      style={{
                        background: bg !== undefined ? bg : (fixo ? bgLinha : undefined),
                        ...(fixo ? { position: 'sticky', left: offsetColunaFixa(c, largura), zIndex: 1 } : {}),
                      }}
                      title={
                        celulaInvalida ? `"${linha[c]}" nao esta cadastrado em Padroes. Corrija ou cadastre em Padroes antes de salvar.`
                          : campoObrigatorioVazio ? `${c.toUpperCase()} é obrigatório — não pode ficar em branco.`
                          : (ehMatricula && ehDuplicada ? 'Matrícula duplicada — ver aviso abaixo da tabela.' : undefined)
                      }
                    >
                      {editando ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {ehSituacao || ehProcesso ? (
                            <select
                              data-nav={`${rowIndex}:${c}`}
                              value={valorSelect}
                              onChange={e => onChange(linha._tmpId, c, e.target.value)}
                              onPaste={e => onPaste(linha._tmpId, c, e)}
                              onKeyDown={e => navegar(e, rowIndex, c)}
                              style={{
                                width: '100%',
                                border: 'none',
                                outline: 'none',
                                background: 'transparent',
                                color,
                                fontWeight: 900,
                                fontSize: 12,
                                cursor: 'pointer',
                              }}
                            >
                              <option value="">{campoObrigatorioVazio ? 'Selecione... (obrigatório)' : 'Selecione...'}</option>
                              {valorSelect && !opcoesSelect.includes(valorSelect) && (
                                <option value={valorSelect}>{valorSelect}</option>
                              )}
                              {opcoesSelect.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          ) : (
                            <input
                              data-nav={`${rowIndex}:${c}`}
                              value={linha[c] || ''}
                              onChange={e => onChange(linha._tmpId, c, e.target.value)}
                              onPaste={e => onPaste(linha._tmpId, c, e)}
                              onKeyDown={e => navegar(e, rowIndex, c)}
                              placeholder={campoObrigatorioVazio ? 'Obrigatório — não deixe em branco' : undefined}
                              style={{
                                width: '100%',
                                border: 'none',
                                outline: 'none',
                                background: 'transparent',
                                color,
                                fontWeight: 600,
                                fontSize: 12,
                              }}
                            />
                          )}
                          {(ehSituacao || ehProcesso) && valorRapido && (
                            <button
                              type="button"
                              title={`Aplicar ${valorRapido} nesta linha`}
                              onClick={() => onChange(linha._tmpId, c, valorRapido)}
                              style={{
                                border: '1px solid #99f6e4',
                                background: '#ecfdf5',
                                color: '#0f766e',
                                borderRadius: 6,
                                padding: '3px 6px',
                                fontSize: 10,
                                fontWeight: 900,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Usar
                            </button>
                          )}
                        </div>
                      ) : (
                        <span style={{ color, fontWeight: ehSituacao ? 900 : 600 }}>
                          {ehMatricula && ehDuplicada && <span title="Matrícula duplicada">⚠️ </span>}
                          {linha[c] || ''}
                        </span>
                      )}
                    </Td>
                  )
                })}
                {editando && <Td><button onClick={() => onRemove(linha._tmpId)} style={botao('#dc2626')}>Remover</button></Td>}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children, width, onResize, onSort, sortDirection, stickyLeft }) {
  const iniciarResize = (evento) => {
    if (!onResize) return
    evento.preventDefault()
    evento.stopPropagation()
    const inicioX = evento.clientX
    const inicioLargura = width || 120
    const mover = e => onResize(inicioLargura + e.clientX - inicioX)
    const soltar = () => {
      window.removeEventListener('mousemove', mover)
      window.removeEventListener('mouseup', soltar)
    }
    window.addEventListener('mousemove', mover)
    window.addEventListener('mouseup', soltar)
  }

  return (
    <th style={{
      position: 'sticky',
      top: 0,
      left: stickyLeft != null ? stickyLeft : undefined,
      zIndex: stickyLeft != null ? 3 : 2,
      background: '#f8fafc',
      color: '#334155',
      fontSize: 11,
      textAlign: 'left',
      padding: onSort ? '8px 48px 8px 10px' : '8px 10px',
      borderBottom: '1px solid #e2e8f0',
      borderRight: '1px solid #e2e8f0',
      whiteSpace: 'nowrap',
      textTransform: 'uppercase',
      width,
      minWidth: width,
      maxWidth: width,
      cursor: onSort ? 'pointer' : 'default',
      userSelect: 'none',
    }}
    onClick={onSort}
    title={onSort ? 'Clique para ordenar esta coluna' : undefined}
    >
      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
      {onSort && (
        <button
          type="button"
          onClick={(evento) => {
            evento.stopPropagation()
            onSort()
          }}
          title={sortDirection === 'desc' ? 'Ordenado Z-A. Clique para A-Z.' : sortDirection === 'asc' ? 'Ordenado A-Z. Clique para Z-A.' : 'Ordenar coluna'}
          style={{
            position: 'absolute',
            top: 5,
            right: onResize ? 12 : 5,
            border: sortDirection ? '1px solid #93c5fd' : '1px solid #cbd5e1',
            background: sortDirection ? '#dbeafe' : '#fff',
            color: sortDirection ? '#1d4ed8' : '#64748b',
            borderRadius: 999,
            padding: '2px 6px',
            fontSize: 9,
            fontWeight: 900,
            cursor: 'pointer',
            lineHeight: 1.2,
          }}
        >
          {sortDirection === 'desc' ? 'Z-A' : 'A-Z'}
        </button>
      )}
      {onResize && (
        <span
          onMouseDown={iniciarResize}
          onClick={evento => evento.stopPropagation()}
          title="Arraste para ajustar a largura da coluna"
          style={{
            position: 'absolute',
            top: 0,
            right: -3,
            width: 7,
            height: '100%',
            cursor: 'col-resize',
          }}
        />
      )}
    </th>
  )
}

function Td({ children, style, title }) {
  return <td title={title} style={{ padding: '7px 10px', borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #f8fafc', fontSize: 12, verticalAlign: 'middle', overflowWrap: 'break-word', ...style }}>{children}</td>
}

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  background: 'rgba(15, 23, 42, 0.58)',
  padding: 16,
  display: 'flex',
  alignItems: 'stretch',
  justifyContent: 'center',
}

const fullPanelStyle = {
  width: '100%',
  maxWidth: 'calc(100vw - 32px)',
  background: '#fff',
  borderRadius: 14,
  padding: 14,
  boxShadow: '0 24px 80px rgba(15, 23, 42, 0.35)',
  overflow: 'hidden',
}

function Campo({ label, children }) {
  return <div><label style={{ display: 'block', fontSize: 10, textTransform: 'uppercase', fontWeight: 900, color: '#334155', marginBottom: 5 }}>{label}</label>{children}</div>
}

function botao(bg, color = '#fff') {
  return {
    background: bg,
    border: 'none',
    color,
    borderRadius: 9,
    padding: '9px 12px',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
  }
}

function abaBtn(ativo) {
  return {
    border: 'none',
    borderRadius: 10,
    padding: '10px 14px',
    background: ativo ? '#0f766e' : '#e2e8f0',
    color: ativo ? '#fff' : '#1e293b',
    fontWeight: 900,
    cursor: 'pointer',
    textAlign: 'left',
  }
}

const inputStyle = {
  width: '100%',
  border: '1px solid #cbd5e1',
  borderRadius: 9,
  padding: '10px 12px',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
}

const filtroThStyle = {
  background: '#f8fafc',
  borderBottom: '1px solid #e2e8f0',
  borderRight: '1px solid #e2e8f0',
  padding: '4px 6px',
}

const filtroInputStyle = {
  width: '100%',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  padding: '4px 6px',
  fontSize: 11,
  outline: 'none',
  boxSizing: 'border-box',
  fontWeight: 600,
  color: '#0f172a',
}
