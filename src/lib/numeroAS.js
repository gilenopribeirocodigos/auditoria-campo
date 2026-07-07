export function gerarNumeroAS() {
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
  return `AS-${data}-${hora}-${sufixo}`
}

export function normalizarNumeroAS(valor) {
  return String(valor || '').trim().toUpperCase()
}

export function obterNumeroAS(valor) {
  return normalizarNumeroAS(valor) || gerarNumeroAS()
}

function compactarData(valor) {
  const texto = String(valor || '').trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.slice(0, 10).replace(/\D/g, '')
  const data = texto ? new Date(texto) : new Date()
  if (Number.isNaN(data.getTime())) return gerarNumeroAS().split('-')[1]
  return `${data.getFullYear()}${String(data.getMonth() + 1).padStart(2, '0')}${String(data.getDate()).padStart(2, '0')}`
}

function compactarHora(valor) {
  const texto = String(valor || '').trim()
  const horaSimples = texto.match(/(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (horaSimples) return `${horaSimples[1]}${horaSimples[2]}${horaSimples[3] || '00'}`
  const data = texto ? new Date(texto) : null
  if (data && !Number.isNaN(data.getTime())) {
    return `${String(data.getHours()).padStart(2, '0')}${String(data.getMinutes()).padStart(2, '0')}${String(data.getSeconds()).padStart(2, '0')}`
  }
  return '000000'
}

function sufixoLegado(tipo, id) {
  const bruto = String(id || '').trim()
  const numero = Number(bruto.replace(/\D/g, '') || 0)
  const base = Number.isFinite(numero) && numero > 0
    ? numero.toString(36).toUpperCase()
    : bruto.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0).toString(36).toUpperCase()
  return `${tipo}${base.slice(-3).padStart(3, '0')}`
}

export function gerarNumeroASLegado(tipo, id, data, hora) {
  return `AS-${compactarData(data)}-${compactarHora(hora)}-${sufixoLegado(tipo, id)}`
}

export function numeroASDaPauta(pauta) {
  return normalizarNumeroAS(pauta?.numero_as)
    || gerarNumeroASLegado('P', pauta?.id, pauta?.data_prevista || pauta?.created_at, pauta?.hora_geracao || pauta?.created_at)
}

export function numeroASDaAuditoria(auditoria) {
  return normalizarNumeroAS(auditoria?.numero_as)
    || gerarNumeroASLegado('A', auditoria?.id, auditoria?.data_auditoria || auditoria?.created_at, auditoria?.hora_auditoria || auditoria?.created_at)
}
