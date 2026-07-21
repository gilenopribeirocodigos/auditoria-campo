// Número único de rastreabilidade da prestação de contas, no formato
// PC-YYYYMMDD-HHMMSS-XXXX (timezone América/Fortaleza) — mesmo padrão do
// numeroAS.js (src/lib/numeroAS.js), mas isolado aqui pra não criar
// dependência entre este módulo e o de Auditorias.
export function gerarNumeroPC() {
  const agora = new Date()
  const partes = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Fortaleza',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(agora)

  const valor = tipo => partes.find(p => p.type === tipo)?.value || '00'
  const data = `${valor('year')}${valor('month')}${valor('day')}`
  const hora = `${valor('hour')}${valor('minute')}${valor('second')}`
  const sufixo = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X')
  return `PC-${data}-${hora}-${sufixo}`
}
