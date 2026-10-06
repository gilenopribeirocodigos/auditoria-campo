// ── lib/importacaoOcorrencias.js ────────────────────────────────────────────
// Importação em lote de "Abertura de Ocorrência" a partir da planilha do TOA
// (colunas PREFIXO, UC, OS, REGISTRO_EXEC, DATAC CONCLUSAO, TIPO_CONCLUSAO).
// Cada PREFIXO é casado com estrutura_equipes (supervisor de campo + até 2
// colaboradores) e a matrícula do supervisor é casada com usuarios — mesmo
// padrão de pega(aliases)/normChave de SesmtCargaPessoas.jsx. Linha que não
// resolve fica pendente (tabela ocorrencias_importacao_pendentes) em vez de
// travar a importação das demais (fluxo não-bloqueante).
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase.js'
import { gerarNumeroOcorrencia } from './ocorrencias.js'

export const MARCADOR_ERRO_CONCLUSAO = 'POSSÍVEL ERRO DE CONCLUSÃO DO SERVIÇO'

const normChave = s => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[\s_]+/g, ' ').trim()

const ALIAS_PREFIXO       = ['prefixo']
const ALIAS_UC            = ['uc']
const ALIAS_OS            = ['os']
const ALIAS_REGISTRO_EXEC = ['registro exec', 'registro execucao']
const ALIAS_DATA_CONCLUSAO = ['datac conclusao', 'data conclusao', 'data de conclusao']
const ALIAS_TIPO_CONCLUSAO = ['tipo conclusao', 'tipo de conclusao']
// MOTIVO não vem do TOA — é opcional, só existe se o próprio usuário
// acrescentar essa coluna na planilha (ex.: a partir do modelo baixado em
// ImportarOcorrenciasLote.jsx). Quando presente na linha, tem prioridade
// sobre o motivo único escolhido pra importação inteira (ver tela).
const ALIAS_MOTIVO = ['motivo']

// ─── Lê as linhas da planilha (objetos XLSX.utils.sheet_to_json) e normaliza
// pros nomes de campo usados no resto deste módulo ─────────────────────────
export function extrairLinhasPlanilha(objetos) {
  return (objetos || [])
    .map(linhaObj => {
      const chaves = Object.keys(linhaObj).reduce((acc, k) => { acc[normChave(k)] = linhaObj[k]; return acc }, {})
      const pega = aliases => {
        const key = aliases.find(a => chaves[a] !== undefined && String(chaves[a]).trim() !== '')
        return key ? String(chaves[key]).trim() : ''
      }
      return {
        prefixo:          pega(ALIAS_PREFIXO).toUpperCase(),
        uc:               pega(ALIAS_UC),
        os:               pega(ALIAS_OS),
        registroExec:     pega(ALIAS_REGISTRO_EXEC),
        dataConclusaoRaw: pega(ALIAS_DATA_CONCLUSAO),
        tipoConclusao:    pega(ALIAS_TIPO_CONCLUSAO),
        motivo:           pega(ALIAS_MOTIVO).toUpperCase(),
      }
    })
    .filter(l => l.prefixo || l.uc || l.os)
}

// ─── A planilha do TOA sempre exporta a data no formato americano
// (mês/dia/ano) — aqui só inverte pro formato brasileiro (dia/mês/ano) que
// o resto do app usa. Sem exportação válida reconhecida, devolve o valor
// original pra não perder a informação.
export function corrigirDataConclusao(raw) {
  const v = String(raw || '').trim()
  if (!v) return ''
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?)?/)
  if (!m) return v
  const [, mes, dia, anoRaw, hora, min] = m
  const ano  = anoRaw.length === 2 ? `20${anoRaw}` : anoRaw
  const data = `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${ano}`
  return hora ? `${data} às ${hora.padStart(2, '0')}:${min}` : data
}

// ─── Monta a descrição da Ocorrência a partir dos dados da planilha. O
// TIPO_CONCLUSAO vira uma linha com o marcador MARCADOR_ERRO_CONCLUSAO — os
// lugares que exibem a descrição (card/modal/PDF) destacam essa linha em
// vermelho procurando por esse marcador (ver destacarLinhasDescricao).
export function montarDescricaoImportada(linha) {
  const linhas = [
    'IMPORTADO DE PLANILHA (TOA)',
    '',
    linha.uc           ? `UC: ${linha.uc}` : null,
    linha.os           ? `OS: ${linha.os}` : null,
    linha.registroExec ? `Registro de Execução: ${linha.registroExec}` : null,
    linha.dataConclusaoFormatada ? `Data de Conclusão: ${linha.dataConclusaoFormatada}` : null,
  ].filter(v => v !== null)
  if (linha.tipoConclusao) {
    linhas.push('')
    linhas.push(`⚠️ ${MARCADOR_ERRO_CONCLUSAO}: ${linha.tipoConclusao}`)
  }
  return linhas.join('\n')
}

function montarResultadoBase(linha) {
  const dataConclusaoFormatada = corrigirDataConclusao(linha.dataConclusaoRaw)
  const comData = { ...linha, dataConclusaoFormatada }
  return { ...comData, descricao: montarDescricaoImportada(comData) }
}

// ─── Casa cada linha com estrutura_equipes (supervisor + colaboradores) e
// usuarios (nome/matrícula do supervisor). Linha sem PREFIXO reconhecido na
// Estrutura, ou cujo supervisor não tem matrícula válida/ativa, volta com
// `pendente: true` + `motivoPendencia` — não impede as demais linhas.
export async function resolverLinhasImportacao(linhas) {
  const prefixosUnicos = [...new Set(linhas.map(l => l.prefixo).filter(Boolean))]

  let porPrefixo = {}
  if (prefixosUnicos.length > 0) {
    const { data: equipes, error: erroEquipes } = await supabase
      .from('estrutura_equipes')
      .select('prefixo, colaborador, matricula_superv_campo')
      .in('prefixo', prefixosUnicos)
    if (erroEquipes) throw erroEquipes

    porPrefixo = (equipes || []).reduce((acc, e) => {
      const p = e.prefixo?.trim().toUpperCase()
      if (!p) return acc
      ;(acc[p] = acc[p] || []).push(e)
      return acc
    }, {})
  }

  const matriculasSuperv = [...new Set(
    Object.values(porPrefixo)
      .map(rows => rows.find(r => r.matricula_superv_campo)?.matricula_superv_campo)
      .filter(Boolean)
  )]

  let usuariosPorMatricula = {}
  if (matriculasSuperv.length > 0) {
    const { data: usuarios, error: erroUsuarios } = await supabase
      .from('usuarios')
      .select('nome, matricula')
      .eq('status', 'ATIVO')
      .in('matricula', matriculasSuperv)
    if (erroUsuarios) throw erroUsuarios
    usuariosPorMatricula = Object.fromEntries((usuarios || []).map(u => [u.matricula, u]))
  }

  return linhas.map(linhaOriginal => {
    const base = montarResultadoBase(linhaOriginal)
    const prefixo = base.prefixo

    if (!prefixo) {
      return { ...base, pendente: true, motivoPendencia: 'Linha sem PREFIXO preenchido na planilha' }
    }

    const rows = porPrefixo[prefixo]
    if (!rows || rows.length === 0) {
      return { ...base, pendente: true, motivoPendencia: `Prefixo "${prefixo}" não encontrado na Estrutura Online` }
    }

    const colaboradores   = [...new Set(rows.map(r => r.colaborador?.trim()).filter(Boolean))]
    const eletricistaEquipe  = colaboradores[0] || ''
    const eletricistaEquipe2 = colaboradores[1] || ''
    const matriculaSuperv = rows.find(r => r.matricula_superv_campo)?.matricula_superv_campo

    if (!matriculaSuperv) {
      return {
        ...base, pendente: true, eletricistaEquipe, eletricistaEquipe2,
        motivoPendencia: `Prefixo "${prefixo}" sem matrícula de supervisor de campo cadastrada na Estrutura`,
      }
    }

    const supervisor = usuariosPorMatricula[matriculaSuperv]
    if (!supervisor) {
      return {
        ...base, pendente: true, eletricistaEquipe, eletricistaEquipe2,
        motivoPendencia: `Matrícula do supervisor (${matriculaSuperv}) não encontrada ativa em usuários`,
      }
    }

    return {
      ...base, pendente: false, eletricistaEquipe, eletricistaEquipe2,
      direcionadoPara: supervisor.nome, matriculaFiscalDestino: supervisor.matricula,
    }
  })
}

function payloadOcorrenciaDaLinha(linha, usuarioLogado) {
  return {
    numero_ocorrencia:        gerarNumeroOcorrencia(),
    descricao:                linha.descricao,
    motivo:                   linha.motivo || null,
    eletricista_equipe:       linha.eletricistaEquipe  || null,
    eletricista_equipe_2:     linha.eletricistaEquipe2 || null,
    prefixo:                  linha.prefixo || null,
    aberto_por:                usuarioLogado?.nome || null,
    matricula_aberto_por:      usuarioLogado?.matricula || null,
    direcionado_para:          linha.direcionadoPara,
    matricula_fiscal_destino:  linha.matriculaFiscalDestino || null,
  }
}

// ─── Cria de fato as Ocorrências das linhas que resolveram tudo ───────────
export async function confirmarLinhasResolvidas(linhasResolvidas, usuarioLogado) {
  if (!supabase) throw new Error('Supabase não configurado.')
  if (linhasResolvidas.length === 0) return []
  const payloads = linhasResolvidas.map(l => payloadOcorrenciaDaLinha(l, usuarioLogado))

  let { data, error } = await supabase.from('ocorrencias').insert(payloads).select()
  if (error && /column .* does not exist/i.test(error.message || '')) {
    const compat = payloads.map(({ eletricista_equipe_2, motivo, ...resto }) => resto)
    ;({ data, error } = await supabase.from('ocorrencias').insert(compat).select())
  }
  if (error) throw error
  return data || []
}

// ─── Guarda as linhas que não resolveram em "Pendências de Importação" ────
export async function salvarPendenciasImportacao(linhasPendentes, usuarioLogado) {
  if (!supabase) throw new Error('Supabase não configurado.')
  if (linhasPendentes.length === 0) return []
  const criadoPor = usuarioLogado?.matricula || usuarioLogado?.login || usuarioLogado?.nome || null
  const payloads = linhasPendentes.map(l => ({
    prefixo:                  l.prefixo || null,
    uc:                       l.uc || null,
    os:                       l.os || null,
    registro_exec:            l.registroExec || null,
    data_conclusao_raw:       l.dataConclusaoRaw || null,
    data_conclusao:           l.dataConclusaoFormatada || null,
    tipo_conclusao:           l.tipoConclusao || null,
    descricao:                l.descricao || null,
    motivo:                   l.motivo || null,
    colaborador_1:            l.eletricistaEquipe || null,
    colaborador_2:            l.eletricistaEquipe2 || null,
    direcionado_para:         l.direcionadoPara || null,
    matricula_fiscal_destino: l.matriculaFiscalDestino || null,
    motivo_pendencia:         l.motivoPendencia || null,
    criado_por:               criadoPor,
  }))
  const { data, error } = await supabase.from('ocorrencias_importacao_pendentes').insert(payloads).select()
  if (error) throw error
  return data || []
}

// ─── Lista as pendências guardadas (tela "Pendências de Importação") ──────
export async function listarPendenciasImportacao() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('ocorrencias_importacao_pendentes')
    .select('*')
    .order('criado_em', { ascending: false })
  if (error) throw error
  return data || []
}

// ─── Descarta uma pendência sem nunca virar Ocorrência ────────────────────
export async function excluirPendenciaImportacao(id) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { error } = await supabase.from('ocorrencias_importacao_pendentes').delete().eq('id', id)
  if (error) throw error
}

// ─── Corrige o que faltou (normalmente o supervisor) e cria a Ocorrência,
// removendo a pendência em seguida ──────────────────────────────────────────
export async function corrigirEAbrirPendencia(pendencia, ajustes, usuarioLogado) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const linha = {
    descricao:              pendencia.descricao,
    motivo:                 pendencia.motivo,
    prefixo:                pendencia.prefixo,
    eletricistaEquipe:      ajustes.eletricistaEquipe  ?? pendencia.colaborador_1,
    eletricistaEquipe2:     ajustes.eletricistaEquipe2 ?? pendencia.colaborador_2,
    direcionadoPara:        ajustes.direcionadoPara,
    matriculaFiscalDestino: ajustes.matriculaFiscalDestino,
  }
  const payload = payloadOcorrenciaDaLinha(linha, usuarioLogado)

  let { error } = await supabase.from('ocorrencias').insert(payload)
  if (error && /column .* does not exist/i.test(error.message || '')) {
    const { eletricista_equipe_2, motivo, ...compat } = payload
    ;({ error } = await supabase.from('ocorrencias').insert(compat))
  }
  if (error) throw error

  await excluirPendenciaImportacao(pendencia.id)
}
