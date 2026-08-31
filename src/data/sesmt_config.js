// ── Config do módulo Ações SESMT — independente de Auditoria/Registros ───────

export const TIPOS_ACAO_SESMT = {
  DIALOGO_SEGURANCA: {
    label: 'Diálogo de Segurança', emoji: '🛡️',
    descricao: 'Tópicos de segurança NR-10, EPI, riscos elétricos, boas práticas',
    color: '#166534', bg: '#f0fdf4', border: '#86efac',
    disponivel: true,
  },
  TREINAMENTO: {
    label: 'Treinamento', emoji: '🎓',
    descricao: 'Capacitações técnicas e comportamentais com tema e carga horária',
    color: '#5b21b6', bg: '#f5f3ff', border: '#ddd6fe',
    disponivel: false,
  },
  RECICLAGEM: {
    label: 'Reciclagem', emoji: '♻️',
    descricao: 'Reciclagem periódica de normas e procedimentos (NR-10, NR-35...)',
    color: '#9a3412', bg: '#fff7ed', border: '#fed7aa',
    disponivel: false,
  },
}

export const STEPS_SESMT = ['Tipo de Ação', 'Identificação', 'Evidências', 'Participantes', 'Resultado']

const hojeISO = () => new Date().toISOString().slice(0, 10)
const horaAtual = () => new Date().toTimeString().slice(0, 5)

export function FORM_SESMT_INICIAL() {
  return {
    tipo: '',
    tema: '',
    motivo: '',
    observacao: '',
    data: hojeISO(),
    hora: horaAtual(),
    fiscal: '',
    matricula_fiscal: '',
    fotos: [],
    lat: null,
    lng: null,
    participantes: [],
    acaoRascunhoId: null,
  }
}
