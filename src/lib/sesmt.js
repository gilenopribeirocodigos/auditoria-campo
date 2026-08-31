import { supabase } from './supabase.js'

// ── Módulo AÇÕES SESMT — independente de Auditoria/Registros/Estrutura ────────
// Pessoas carregadas só para este módulo (chapa + nome), sem relação com
// estrutura_equipes/eletricistas_cadastro.

export async function listarPessoasSesmt() {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase
    .from('sesmt_pessoas')
    .select('*')
    .order('nome')
  if (error) throw error
  return data || []
}

export async function buscarPessoasSesmtPorNome(termo) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const t = (termo || '').trim()
  if (!t) return []
  const { data, error } = await supabase
    .from('sesmt_pessoas')
    .select('*')
    .eq('ativo', true)
    .ilike('nome', `%${t}%`)
    .order('nome')
    .limit(20)
  if (error) throw error
  return data || []
}

// linhas: [{ chapa, nome }]. Upsert por chapa — quem já está na lista
// mantém o id; quem não veio mais na carga é marcado inativo (nunca
// removido, pra não perder histórico de quem já assinou alguma ação).
export async function importarPessoasSesmt(linhas, usuarioLogin) {
  if (!supabase) throw new Error('Supabase não configurado.')

  const validas = (linhas || [])
    .map(l => ({ chapa: String(l.chapa || '').trim(), nome: String(l.nome || '').trim().toUpperCase() }))
    .filter(l => l.chapa && l.nome)

  if (validas.length === 0) {
    throw new Error('Nenhuma linha válida (é preciso CHAPA e NOME preenchidos).')
  }

  const chapasCount = {}
  validas.forEach(l => { chapasCount[l.chapa] = (chapasCount[l.chapa] || 0) + 1 })
  const duplicadas = Object.entries(chapasCount).filter(([, c]) => c > 1).map(([chapa]) => chapa)
  if (duplicadas.length > 0) {
    throw new Error(`Chapa(s) duplicada(s) no arquivo: ${duplicadas.join(', ')}. Corrija antes de importar.`)
  }

  const agora = new Date().toISOString()
  const payload = validas.map(l => ({
    chapa: l.chapa,
    nome: l.nome,
    ativo: true,
    carregado_por: usuarioLogin || null,
    carregado_em: agora,
  }))

  for (let i = 0; i < payload.length; i += 100) {
    const { error } = await supabase.from('sesmt_pessoas').upsert(payload.slice(i, i + 100), { onConflict: 'chapa' })
    if (error) throw error
  }

  const chapasCarregadas = new Set(validas.map(l => l.chapa))
  const { data: atuais, error: errAtuais } = await supabase.from('sesmt_pessoas').select('id, chapa, ativo')
  if (errAtuais) throw errAtuais

  const ficamInativos = (atuais || []).filter(p => p.ativo && !chapasCarregadas.has(p.chapa))
  if (ficamInativos.length > 0) {
    const ids = ficamInativos.map(p => p.id)
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await supabase.from('sesmt_pessoas').update({ ativo: false }).in('id', ids.slice(i, i + 100))
      if (error) throw error
    }
  }

  return { importadas: payload.length, inativadas: ficamInativos.length }
}
