// ── lib/ocorrencias.js ───────────────────────────────────────────────────────
// Módulo "Ocorrências": almoxarifado relata um problema (ex: devolução de
// medidor/sucata não realizada) e direciona manualmente para um fiscal
// tratar. Tabela independente (`ocorrencias`) — sem relação com auditorias,
// auditorias_nao_conformes ou registros_operacionais.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase, uploadBase64 } from './supabase.js'

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
    eletricista_equipe:        form.eletricista_equipe || null,
    prefixo:                   form.prefixo || null,
    aberto_por:                form.aberto_por,
    matricula_aberto_por:      form.matricula_aberto_por || null,
    direcionado_para:          form.direcionado_para,
    matricula_fiscal_destino:  form.matricula_fiscal_destino || null,
    foto_url:                  fotoUrl,
  }
}

// ─── Salva a ocorrência no banco ──────────────────────────────────────────────
export async function salvarOcorrenciaBD(payload) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase
    .from('ocorrencias')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
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

// ─── Confirma o tratamento de uma ocorrência ──────────────────────────────────
export async function tratarOcorrencia(id, { observacao, usuarioLogado }) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { error } = await supabase
    .from('ocorrencias')
    .update({
      status:                 'TRATADA',
      tratamento_observacao:  observacao.trim(),
      tratado_por:            usuarioLogado?.matricula || usuarioLogado?.login || usuarioLogado?.nome || null,
      tratado_em:             new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'PENDENTE')
  if (error) throw error
}
