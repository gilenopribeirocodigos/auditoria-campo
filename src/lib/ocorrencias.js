// ── lib/ocorrencias.js ───────────────────────────────────────────────────────
// Módulo "Ocorrências": almoxarifado relata um problema (ex: devolução de
// medidor/sucata não realizada) e direciona manualmente para um fiscal
// tratar. Tabela independente (`ocorrencias`) — sem relação com auditorias,
// auditorias_nao_conformes ou registros_operacionais.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase, uploadBase64 } from './supabase.js'
import { temPermissao } from './auth.js'

// Mesmo padrão de numeroAS.js/gerarNumeroAcaoSesmt() — implementação própria
// pra manter o módulo isolado (ver convenção do projeto). `prefixo`
// diferencia Tratamento de Retrabalho (RT-, ver nota abaixo — é o
// tipo_ocorrencia 'OCORRENCIA' original, só renomeado), Tratamento de
// Reincidência (RE-) e a Ocorrência Genérica (OC-, cópia do fluxo original
// com Motivo, preservada à parte — ver tipo_ocorrencia 'OCORRENCIA_GENERICA')
// — mesma coluna numero_ocorrencia nos três casos, só muda o prefixo gerado.
//
// ⚠️ O prefixo OC- (Retrabalho) virou RT- a partir desta mudança (pedido do
// Gileno) — só pra números NOVOS daqui pra frente. Ocorrências já salvas
// antes disso continuam com "OC-..." gravado em numero_ocorrencia; nunca
// renumerar/migrar o que já existe.
function gerarNumeroRegistroOcorrencia(prefixo) {
  const agora = new Date()
  const partes = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Fortaleza',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(agora)
  const valor = tipo => partes.find(p => p.type === tipo)?.value || '00'
  const data = `${valor('year')}${valor('month')}${valor('day')}`
  const hora = `${valor('hour')}${valor('minute')}${valor('second')}`
  const sufixo = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X')
  return `${prefixo}-${data}-${hora}-${sufixo}`
}

export function gerarNumeroRetrabalho() {
  return gerarNumeroRegistroOcorrencia('RT')
}

export function gerarNumeroReincidencia() {
  return gerarNumeroRegistroOcorrencia('RE')
}

export function gerarNumeroOcorrenciaGenerica() {
  return gerarNumeroRegistroOcorrencia('OC')
}

// Ocorrências salvas antes da coluna numero_ocorrencia existir (não deve
// acontecer em produção, mas evita quebrar a exibição de dados antigos).
export function numeroOcorrencia(oc) {
  if (oc?.numero_ocorrencia) return oc.numero_ocorrencia
  const prefixoLegado = oc?.tipo_ocorrencia === 'REINCIDENCIA' ? 'RE' : 'OC'
  const base = Number(oc?.id || 0).toString(36).toUpperCase().padStart(4, '0')
  return `${prefixoLegado}-LEGADO-${base}`
}

// Selo "⏳ há N dias" dos cards de Retrabalho/Ocorrência Genérica/
// Reincidência (Tratamento de Não Conformidades e Registros Operacionais) —
// só pra quem tá pendente. Conta dias corridos de calendário (meia-noite a
// meia-noite), não 24h exatas, pra bater com a intuição de "abriu ontem =
// há 1 dia" independente do horário exato da abertura. Compartilhado pelos
// dois arquivos pra não duplicar a mesma conta de data em dois lugares.
export function diasPendenteLabel(dataAbertura) {
  if (!dataAbertura) return null
  const meiaNoite = d => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dias = Math.round((meiaNoite(new Date()) - meiaNoite(new Date(dataAbertura))) / 86400000)
  if (dias <= 0) return '⏳ hoje'
  if (dias === 1) return '⏳ há 1 dia'
  return `⏳ há ${dias} dias`
}

// ─── Busca lista de fiscais ativos pra direcionamento (usado online) ─────────
export async function listarFiscaisParaDirecionamento() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('usuarios')
    .select('nome, matricula')
    .eq('status', 'ATIVO')
    .order('nome')
  if (error) throw error
  return data || []
}

// ─── Faz upload da foto (se houver) e monta o payload pra inserir ────────────
// `form.tipo_ocorrencia` ('OCORRENCIA' | 'REINCIDENCIA' | 'OCORRENCIA_GENERICA')
// decide o prefixo do número gerado; os 7 campos extras
// (numero_oe...reincidencia_r90) só fazem sentido pra Reincidência — ficam
// null quando o form não os preenche.
export async function prepararPayloadOcorrencia(form) {
  let fotoUrl = null
  if (form.foto) {
    const ref = `${Date.now()}_ocorrencia`.replace(/\s+/g, '_')
    fotoUrl = await uploadBase64(form.foto, `ocorrencias/${ref}/foto.jpg`, 'fotos-auditoria')
  }

  const tipoOcorrencia = form.tipo_ocorrencia || 'OCORRENCIA'
  const geradorNumero =
    tipoOcorrencia === 'REINCIDENCIA'        ? gerarNumeroReincidencia :
    tipoOcorrencia === 'OCORRENCIA_GENERICA' ? gerarNumeroOcorrenciaGenerica :
    gerarNumeroRetrabalho

  return {
    numero_ocorrencia:         form.numero_ocorrencia || geradorNumero(),
    tipo_ocorrencia:           tipoOcorrencia,
    descricao:                 form.descricao,
    motivo:                    form.motivo || null,
    eletricista_equipe:        form.eletricista_equipe || null,
    eletricista_equipe_2:      form.eletricista_equipe_2 || null,
    prefixo:                   form.prefixo || null,
    aberto_por:                form.aberto_por,
    matricula_aberto_por:      form.matricula_aberto_por || null,
    direcionado_para:          form.direcionado_para,
    matricula_fiscal_destino:  form.matricula_fiscal_destino || null,
    foto_url:                  fotoUrl,
    data_abertura:             form.data || null,
    hora_abertura:             form.hora || null,
    endereco:                  form.endereco || null,
    lat:                       form.lat ?? null,
    lng:                       form.lng ?? null,
    numero_oe:                 form.numero_oe || null,
    abrangencia:               form.abrangencia || null,
    componente_pdf:            form.componente_pdf || null,
    alimentador_al:            form.alimentador_al || null,
    reincidencia_r07:          form.reincidencia_r07 || null,
    reincidencia_r30:          form.reincidencia_r30 || null,
    reincidencia_r90:          form.reincidencia_r90 || null,
    // "Dados Técnicos" do Tratamento de Retrabalho — vêm da planilha TOA
    // (ImportarOcorrenciasLote/importacaoOcorrencias.js) OU digitados à mão
    // aqui no formulário manual (ver AberturaOcorrencia.jsx). uc/os/
    // data_conclusao já existiam como colunas (import em lote já usava);
    // registro_execucao é novo — ver sql/2026-10-26_ocorrencias_registro_execucao.sql.
    uc:                        form.uc || null,
    os:                        form.os || null,
    registro_execucao:         form.registro_execucao || null,
    data_conclusao:            form.data_conclusao || null,
  }
}

// ─── Lista os colaboradores vinculados a uma Ocorrência — tabela nova
// (ocorrencias_colaboradores), 1 linha por pessoa, suporta qualquer tamanho
// de equipe. Ocorrência criada antes desta migração (ou antes dela ser
// aplicada no banco) simplesmente não tem linhas aqui — devolve [] e quem
// chama cai de volta no padrão antigo (eletricista_equipe/_2 fixos).
export async function listarColaboradoresOcorrencia(ocorrenciaId) {
  if (!supabase || !ocorrenciaId) return []
  const { data, error } = await supabase
    .from('ocorrencias_colaboradores')
    .select('*')
    .eq('ocorrencia_id', ocorrenciaId)
    .order('ordem')
  if (error) {
    if (/relation .* does not exist/i.test(error.message || '')) return []
    throw error
  }
  return data || []
}

// ─── Grava a equipe completa de uma Ocorrência recém-criada (1 linha por
// colaborador) — aceita string simples ou { nome, matricula }. Silenciosa
// se a migração ainda não foi aplicada no banco (mesmo padrão de
// compatibilidade usado no resto deste arquivo), pra não travar a criação
// da ocorrência por causa de uma tabela auxiliar que ainda não existe.
export async function salvarColaboradoresOcorrencia(ocorrenciaId, colaboradores) {
  if (!supabase || !ocorrenciaId) return
  const linhas = (colaboradores || [])
    .map(c => (typeof c === 'string' ? { nome: c, matricula: null } : c))
    .filter(c => c?.nome?.trim())
    .map((c, i) => ({
      ocorrencia_id: ocorrenciaId,
      ordem:         i + 1,
      nome:          c.nome.trim(),
      matricula:     c.matricula || null,
    }))
  if (linhas.length === 0) return
  const { error } = await supabase.from('ocorrencias_colaboradores').insert(linhas)
  if (error && !/relation .* does not exist/i.test(error.message || '')) throw error
}

// ─── Salva a ocorrência no banco ──────────────────────────────────────────────
export async function salvarOcorrenciaBD(payload) {
  if (!supabase) throw new Error('Supabase não configurado.')
  let { data, error } = await supabase
    .from('ocorrencias')
    .insert(payload)
    .select()
    .single()

  // Mantém o salvamento funcionando caso o deploy do app chegue antes da
  // migração SQL que adiciona data_abertura/hora_abertura/endereco/lat/lng/
  // eletricista_equipe_2/tipo_ocorrencia/numero_oe/abrangencia/
  // componente_pdf/alimentador_al/reincidencia_r07-r90/uc/os/
  // registro_execucao/data_conclusao (mesmo padrão de salvarRegistroBD em
  // lib/registros.js).
  if (error && /column .* does not exist/i.test(error.message || '')) {
    const {
      data_abertura, hora_abertura, endereco, lat, lng, eletricista_equipe_2, motivo,
      tipo_ocorrencia, numero_oe, abrangencia, componente_pdf, alimentador_al,
      reincidencia_r07, reincidencia_r30, reincidencia_r90,
      uc, os, registro_execucao, data_conclusao,
      ...payloadCompat
    } = payload
    ;({ data, error } = await supabase
      .from('ocorrencias')
      .insert(payloadCompat)
      .select()
      .single())
  }

  if (error) throw error
  await salvarColaboradoresOcorrencia(data.id, [
    { nome: payload.eletricista_equipe, matricula: null },
    { nome: payload.eletricista_equipe_2, matricula: null },
  ])
  return data
}

// ─── Lista ocorrências (Tratamento de Não Conformidades → aba Ocorrências,
// hoje rotulada "Tratamento de Retrabalho" na UI) ─── Só
// tipo_ocorrencia = 'OCORRENCIA' (igualdade explícita, não só "diferente de
// REINCIDENCIA" — senão a Ocorrência Genérica, tipo_ocorrencia
// 'OCORRENCIA_GENERICA', cairia aqui misturada) — Reincidência tem sua
// própria lista/aba, ver listarReincidencias() logo abaixo.
export async function listarOcorrencias(statusTab = 'TODOS', { ini, fim } = {}) {
  if (!supabase) return []
  let q = supabase.from('ocorrencias').select('*').eq('tipo_ocorrencia', 'OCORRENCIA').order('criado_em', { ascending: false })
  if (statusTab !== 'TODOS') q = q.eq('status', statusTab)
  if (ini) q = q.gte('criado_em', `${ini}T00:00:00`)
  if (fim) q = q.lte('criado_em', `${fim}T23:59:59`)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

// ─── Lista reincidências (Tratamento de Não Conformidades → aba Reincidência)
// Espelha listarOcorrencias() acima, trocando .neq por .eq — mesma tabela,
// só o tipo_ocorrencia filtrado muda.
export async function listarReincidencias(statusTab = 'TODOS', { ini, fim } = {}) {
  if (!supabase) return []
  let q = supabase.from('ocorrencias').select('*').eq('tipo_ocorrencia', 'REINCIDENCIA').order('criado_em', { ascending: false })
  if (statusTab !== 'TODOS') q = q.eq('status', statusTab)
  if (ini) q = q.gte('criado_em', `${ini}T00:00:00`)
  if (fim) q = q.lte('criado_em', `${fim}T23:59:59`)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

// ─── Lista Ocorrências Genéricas — cópia do fluxo original de "Abertura de
// Ocorrência" (com Motivo), preservada à parte depois que o tipo_ocorrencia
// 'OCORRENCIA' virou Tratamento de Retrabalho. Mesmo padrão de
// listarReincidencias() acima, só o tipo_ocorrencia filtrado muda. Usada hoje
// só em RegistrosOperacionais.jsx (listagem) — ainda não tem aba própria em
// Tratamento de Não Conformidades (fica pra quando o Gileno definir a
// próxima demanda que vai usar esse tipo).
export async function listarOcorrenciasGenericas(statusTab = 'TODOS', { ini, fim } = {}) {
  if (!supabase) return []
  let q = supabase.from('ocorrencias').select('*').eq('tipo_ocorrencia', 'OCORRENCIA_GENERICA').order('criado_em', { ascending: false })
  if (statusTab !== 'TODOS') q = q.eq('status', statusTab)
  if (ini) q = q.gte('criado_em', `${ini}T00:00:00`)
  if (fim) q = q.lte('criado_em', `${fim}T23:59:59`)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

// ─── Corrige os dados de abertura (prefixo/colaborador(es)/descrição) ──────
// Só faz sentido enquanto a ocorrência ainda está PENDENTE — depois de
// tratada, os dados de abertura já foram usados na assinatura/tratamento e
// não devem mais mudar (o .eq('status','PENDENTE') é o cinto de segurança
// no banco; quem pode chamar isso é decidido na tela — quem abriu ou ADMIN).
export async function editarOcorrencia(id, { prefixo, eletricista_equipe, eletricista_equipe_2, descricao }) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const payload = {
    prefixo:              prefixo || null,
    eletricista_equipe:   eletricista_equipe || null,
    eletricista_equipe_2: eletricista_equipe_2 || null,
    descricao,
  }
  let { error } = await supabase.from('ocorrencias').update(payload).eq('id', id).eq('status', 'PENDENTE')

  // Mesmo padrão de compatibilidade das demais funções deste arquivo — evita
  // quebrar se o deploy chegar antes da migração que adiciona
  // eletricista_equipe_2.
  if (error && /column .* does not exist/i.test(error.message || '')) {
    const { eletricista_equipe_2, ...payloadCompat } = payload
    ;({ error } = await supabase.from('ocorrencias').update(payloadCompat).eq('id', id).eq('status', 'PENDENTE'))
  }

  if (error) throw error
}

// ─── Confirma o tratamento de uma ocorrência ──────────────────────────────────
// Exige evidência (mín. 1 foto) e assinatura do colaborador envolvido, mesmo
// padrão do tratamento de Não Conformidade (auditorias_nao_conformes). Quando
// a ocorrência tem um 2º colaborador (eletricista_equipe_2), exige também a
// assinatura dele — mesmo padrão de temEletricista2/assinatura2 já usado no
// tratamento de NC de auditoria.
// `colaboradoresAssinados` (opcional): [{ id, assinaturaUrl }] — ids de
// ocorrencias_colaboradores que de fato assinaram nessa rodada, quando a
// ocorrência tem equipe dinâmica (ver listarColaboradoresOcorrencia). Quem
// não assinou simplesmente não entra aqui e não fica registrado como
// cientificado. `assinaturaUrl/Nome` e `assinatura2Url/Nome` continuam
// sendo gravados (1º e 2º que assinaram) só como resumo/compatibilidade
// pros lugares que ainda leem direto dessas colunas (PDF, WhatsApp,
// exportação) — a lista completa mora em ocorrencias_colaboradores.
export async function tratarOcorrencia(id, {
  observacao, fotosUrls, assinaturaUrl, assinaturaNome,
  assinatura2Url, assinatura2Nome, colaboradoresAssinados, usuarioLogado,
}) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const payload = {
    status:                      'TRATADA',
    tratamento_observacao:       observacao.trim(),
    tratamento_fotos_urls:       fotosUrls || [],
    tratamento_assinatura_url:   assinaturaUrl || null,
    tratamento_assinatura_nome:  assinaturaNome || null,
    tratamento_assinatura2_url:  assinatura2Url || null,
    tratamento_assinatura2_nome: assinatura2Nome || null,
    tratado_por:                 usuarioLogado?.matricula || usuarioLogado?.login || usuarioLogado?.nome || null,
    tratado_por_nome:             usuarioLogado?.nome || null,
    tratado_em:                   new Date().toISOString(),
  }
  let { error } = await supabase.from('ocorrencias').update(payload).eq('id', id).eq('status', 'PENDENTE')

  // Mantém o tratamento funcionando caso o deploy chegue antes da migração
  // SQL que adiciona tratamento_fotos_urls/tratamento_assinatura_*/
  // tratamento_assinatura2_*/tratado_por_nome (mesmo padrão de
  // salvarOcorrenciaBD acima).
  if (error && /column .* does not exist/i.test(error.message || '')) {
    const {
      tratamento_fotos_urls, tratamento_assinatura_url, tratamento_assinatura_nome,
      tratamento_assinatura2_url, tratamento_assinatura2_nome, tratado_por_nome, ...payloadCompat
    } = payload
    ;({ error } = await supabase.from('ocorrencias').update(payloadCompat).eq('id', id).eq('status', 'PENDENTE'))
  }

  if (error) throw error

  if (Array.isArray(colaboradoresAssinados) && colaboradoresAssinados.length > 0) {
    const assinadoEm = new Date().toISOString()
    await Promise.all(colaboradoresAssinados.map(c =>
      supabase.from('ocorrencias_colaboradores')
        .update({ assinatura_url: c.assinaturaUrl, assinado_em: assinadoEm })
        .eq('id', c.id)
    ))
  }
}

// ─── Confirma o tratamento de uma reincidência ─────────────────────────────
// Reaproveita as mesmas colunas de evidência/ciência que tratarOcorrencia()
// usa (tratamento_fotos_urls, tratamento_assinatura_*/assinatura2_* — aqui
// guardam a ciência do Eletricista 1 e do Eletricista 2), mas troca a
// "observação" livre pelas 5 respostas do checklist específico de
// Reincidência, e acrescenta o Termo de Ciência do Fiscal (assinatura
// própria de quem tratou, exigida pelo checklist — distinta da ciência dos
// eletricistas).
export async function tratarReincidencia(id, {
  redeInspecionada, acoesEquipe, leiturasEletricas, resolvidoDefinitivo, vulnerabilidades,
  fotosUrls,
  assinaturaEletricista1Url, assinaturaEletricista1Nome,
  assinaturaEletricista2Url, assinaturaEletricista2Nome,
  termoFiscalNome, termoFiscalAssinaturaUrl,
  usuarioLogado,
}) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const payload = {
    status:                                    'TRATADA',
    reincidencia_rede_inspecionada:             !!redeInspecionada,
    reincidencia_acoes_equipe:                  acoesEquipe?.trim() || null,
    reincidencia_leituras_eletricas:            leiturasEletricas?.trim() || null,
    reincidencia_resolvido_definitivo:          !!resolvidoDefinitivo,
    reincidencia_vulnerabilidades:              vulnerabilidades?.trim() || null,
    reincidencia_termo_fiscal_nome:             termoFiscalNome || null,
    reincidencia_termo_fiscal_assinatura_url:   termoFiscalAssinaturaUrl || null,
    tratamento_fotos_urls:                      fotosUrls || [],
    tratamento_assinatura_url:                  assinaturaEletricista1Url || null,
    tratamento_assinatura_nome:                 assinaturaEletricista1Nome || null,
    tratamento_assinatura2_url:                 assinaturaEletricista2Url || null,
    tratamento_assinatura2_nome:                assinaturaEletricista2Nome || null,
    tratado_por:                                usuarioLogado?.matricula || usuarioLogado?.login || usuarioLogado?.nome || null,
    tratado_por_nome:                           usuarioLogado?.nome || null,
    tratado_em:                                 new Date().toISOString(),
  }
  let { error } = await supabase.from('ocorrencias').update(payload).eq('id', id).eq('status', 'PENDENTE')

  // Mesmo padrão de compatibilidade das demais funções deste arquivo — evita
  // quebrar se o deploy chegar antes da migração SQL que adiciona as colunas
  // reincidencia_* (ver sql/2026-10-24_reincidencia_tratamento.sql).
  if (error && /column .* does not exist/i.test(error.message || '')) {
    const {
      reincidencia_rede_inspecionada, reincidencia_acoes_equipe, reincidencia_leituras_eletricas,
      reincidencia_resolvido_definitivo, reincidencia_vulnerabilidades,
      reincidencia_termo_fiscal_nome, reincidencia_termo_fiscal_assinatura_url,
      ...payloadCompat
    } = payload
    ;({ error } = await supabase.from('ocorrencias').update(payloadCompat).eq('id', id).eq('status', 'PENDENTE'))
  }

  if (error) throw error
}

// ─── Lista ocorrências abertas pelo usuário logado (ou todas, se privilegiado)
// — usado em RegistrosOperacionais.jsx pra aparecerem junto com os registros
// comuns (mesma regra de visibilidade de listarRegistros em lib/registros.js).
export async function listarOcorrenciasDoUsuario(usuarioLogado) {
  if (!supabase) return []
  let q = supabase.from('ocorrencias').select('*').order('criado_em', { ascending: false })
  // Mesma permissão da tela onde essa lista aparece (Registros Operacionais)
  // — ADMIN sempre vê tudo (temPermissao já libera), os demais só com a
  // permissão marcada, senão só o que o próprio usuário abriu.
  const podeVerTodas = temPermissao(usuarioLogado, 'ver_todos_registros_operacionais')
  if (!podeVerTodas) q = q.eq('matricula_aberto_por', usuarioLogado?.matricula)
  const { data, error } = await q
  if (error) throw error
  return data || []
}
