import { supabase } from './supabase.js'

// ═══════════════════════════════════════════════════════════════════════════
// Sincroniza as Não Conformidades de uma auditoria com a tabela auxiliar
// auditorias_nao_conformes. Usado tanto no salvamento online (S6Resultado.jsx)
// quanto no sync da fila offline (offline.js) — mesma lógica, um lugar só.
//
// - Nova auditoria: só INSERT
// - Reabertura (isEdicao=true): DELETE das antigas + INSERT das atuais
//   (as respostas podem ter mudado e NCs antigas podem não ser mais NCs)
// - camposTratamento carrega os campos de tratamento já resolvidos pelo
//   chamador (vazio para Pós Serviço, que nasce PENDENTE; preenchido para
//   Desempenho Operacional, que já nasce TRATADA no ato da auditoria)
// - Falhas são silenciosas (console.warn) pra não bloquear o salvar da auditoria
// ═══════════════════════════════════════════════════════════════════════════
export async function sincronizarNCs(auditoriaId, ncs, isEdicao, contexto = {}, camposTratamento = {}) {
  try {
    if (isEdicao) {
      const { error: delErr } = await supabase
        .from('auditorias_nao_conformes')
        .delete()
        .eq('auditoria_id', auditoriaId)
      if (delErr) {
        console.warn('⚠️ Erro ao limpar NCs antigas:', delErr.message)
      }
    }

    if (ncs && ncs.length > 0) {
      const linhas = ncs.map(item => ({
        auditoria_id:                 auditoriaId,
        item_id:                      String(item.id ?? ''),
        item_texto:                   item.p || '',
        fiscal:                       contexto.fiscal           || null,
        matricula:                    contexto.matricula        || null,
        prefixo:                      contexto.prefixo          || null,
        os:                           contexto.os               || null,
        uc:                           contexto.uc               || null,
        nome_eletricista:             contexto.nomeEletricista  || null,
        nome_eletricista2:            contexto.nomeEletricista2 || null,
        motivo_auditoria:             contexto.motivoAuditoria  || null,
        avaliacao_motivo_auditoria:   contexto.avaliacaoMotivoTexto || null,
        observacoes_motivo_auditoria: contexto.observacoesMotivoAuditoria || null,
        numero_as:                    contexto.numeroAS    || null,
        tipo_auditoria:               contexto.tipoAuditoria || null,
        ...camposTratamento,
      }))
      const { error: insErr } = await supabase
        .from('auditorias_nao_conformes')
        .upsert(linhas, {
          onConflict:       'auditoria_id,item_id',
          ignoreDuplicates: true,
        })
      if (insErr) {
        console.warn('⚠️ Erro ao salvar NCs na tabela auditorias_nao_conformes:', insErr.message)
      } else {
        console.log(`✅ ${linhas.length} NC(s) salvas em auditorias_nao_conformes`)
      }
    }
  } catch (e) {
    console.warn('⚠️ Erro ao sincronizar NCs (tabela pode não existir):', e.message)
  }
}
