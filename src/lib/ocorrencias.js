// ── lib/ocorrencias.js ───────────────────────────────────────────────────────
// Módulo "Ocorrências": almoxarifado relata um problema (ex: devolução de
// medidor/sucata não realizada) e direciona manualmente para um fiscal
// tratar. Tabela independente (`ocorrencias`) — sem relação com auditorias,
// auditorias_nao_conformes ou registros_operacionais.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase, uploadBase64 } from './supabase.js'
import { temPermissao } from './auth.js'

// Mesmo padrão de numeroAS.js/gerarNumeroAcaoSesmt() — implementação própria
// pra manter o módulo isolado (ver convenção do projeto).
export function gerarNumeroOcorrencia() {
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
  return `OC-${data}-${hora}-${sufixo}`
}

// Ocorrências salvas antes da coluna numero_ocorrencia existir (não deve
// acontecer em produção, mas evita quebrar a exibição de dados antigos).
export function numeroOcorrencia(oc) {
  if (oc?.numero_ocorrencia) return oc.numero_ocorrencia
  const base = Number(oc?.id || 0).toString(36).toUpperCase().padStart(4, '0')
  return `OC-LEGADO-${base}`
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
export async function prepararPayloadOcorrencia(form) {
  let fotoUrl = null
  if (form.foto) {
    const ref = `${Date.now()}_ocorrencia`.replace(/\s+/g, '_')
    fotoUrl = await uploadBase64(form.foto, `ocorrencias/${ref}/foto.jpg`, 'fotos-auditoria')
  }

  return {
    numero_ocorrencia:         form.numero_ocorrencia || gerarNumeroOcorrencia(),
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
  // eletricista_equipe_2 (mesmo padrão de salvarRegistroBD em lib/registros.js).
  if (error && /column .* does not exist/i.test(error.message || '')) {
    const { data_abertura, hora_abertura, endereco, lat, lng, eletricista_equipe_2, motivo, ...payloadCompat } = payload
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

// ─── Lista ocorrências (Tratamento de Não Conformidades → aba Ocorrências) ───
export async function listarOcorrencias(statusTab = 'TODOS', { ini, fim } = {}) {
  if (!supabase) return []
  let q = supabase.from('ocorrencias').select('*').order('criado_em', { ascending: false })
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
