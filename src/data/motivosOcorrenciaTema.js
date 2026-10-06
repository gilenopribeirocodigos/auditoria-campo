// ── data/motivosOcorrenciaTema.js ───────────────────────────────────────────
// Tema visual (emoji + cores) aplicado ao MOTIVO de uma Ocorrência — no
// card da lista, no modal de detalhe e no PDF/Zap (RegistrosOperacionais.jsx).
// Motivos são texto livre, cadastrados em ⚙️ Motivos (MotivosRegistrosOperacionais.jsx,
// tipo_registro = 'OCORRENCIA'), então o tema é por lookup exato (chave em
// MAIÚSCULO) — sem entrada aqui, cai no tema padrão (neutro).
//
// Ao cadastrar um motivo novo que mereça destaque diferente (ex.: algo que
// sinaliza problema de qualidade/retrabalho, como "TRATAMENTO DE
// RETRABALHO"), acrescentar uma entrada aqui com o tema adequado.
// ─────────────────────────────────────────────────────────────────────────────
export const TEMA_MOTIVO_PADRAO = {
  emoji: '🏷️', color: '#3730a3', bg: '#eef2ff', border: '#c7d2fe',
}

export const TEMAS_MOTIVO_OCORRENCIA = {
  // Eletricista fez um serviço que não ficou com a qualidade devida, o
  // cliente reclamou de novo e outra equipe teve que voltar pra corrigir —
  // sinaliza um problema real de qualidade, por isso o tema de alerta (vermelho).
  'TRATAMENTO DE RETRABALHO': {
    emoji: '🔁', color: '#b91c1c', bg: '#fef2f2', border: '#fca5a5',
  },
}

export function temaMotivoOcorrencia(motivo) {
  if (!motivo) return null
  return TEMAS_MOTIVO_OCORRENCIA[motivo.trim().toUpperCase()] || TEMA_MOTIVO_PADRAO
}
