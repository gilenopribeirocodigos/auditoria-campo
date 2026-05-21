// ─── Tipos de Registro ────────────────────────────────────────────────────────
export const TIPOS_REGISTRO = {
  ALINHAMENTO: {
    label:          'Alinhamento com Equipe',
    emoji:          '📋',
    color:          '#2563eb',
    bg:             '#eff6ff',
    border:         '#bfdbfe',
    descricao:      'Orientações operacionais, metas, procedimentos e diretrizes',
    apenasIndividual: false,
  },
  DS: {
    label:          'Diálogo de Segurança',
    emoji:          '🛡️',
    color:          '#16a34a',
    bg:             '#f0fdf4',
    border:         '#bbf7d0',
    descricao:      'Tópicos de segurança NR-10, EPI, riscos elétricos, boas práticas',
    apenasIndividual: false,
  },
  TREINAMENTO: {
    label:          'Treinamento',
    emoji:          '🎓',
    color:          '#7c3aed',
    bg:             '#f5f3ff',
    border:         '#ddd6fe',
    descricao:      'Capacitações técnicas e comportamentais com tema e carga horária',
    apenasIndividual: false,
    temTema:        true,
    temCargaHoraria: true,
  },
  FEEDBACK: {
    label:          'Feedback',
    emoji:          '💬',
    color:          '#0891b2',
    bg:             '#ecfeff',
    border:         '#a5f3fc',
    descricao:      'Retorno individual ou coletivo sobre desempenho operacional',
    apenasIndividual: false,
  },
  REUNIAO: {
    label:          'Reunião de Resultado',
    emoji:          '📊',
    color:          '#d97706',
    bg:             '#fffbeb',
    border:         '#fde68a',
    descricao:      'Apresentação de indicadores, metas e resultados do período',
    apenasIndividual: false,
  },
  DISCIPLINAR: {
    label:          'Medida Disciplinar',
    emoji:          '⚠️',
    color:          '#dc2626',
    bg:             '#fef2f2',
    border:         '#fecaca',
    descricao:      'Advertência verbal ou escrita por descumprimento de normas',
    apenasIndividual: true,
    tiposMedida: [
      { value: 'FEEDBACK',            label: 'Feedback' },
      { value: 'ADVERTENCIA_VERBAL',  label: 'Advertência Verbal' },
      { value: 'ADVERTENCIA_ESCRITA', label: 'Advertência Escrita' },
      { value: 'SUSPENSAO',           label: 'Suspensão' },
    ],
  },
}

// ─── Modalidades ──────────────────────────────────────────────────────────────
export const MODALIDADES = {
  INDIVIDUAL: {
    label:    'Individual',
    emoji:    '👤',
    descricao: '1 eletricista',
    maxPart:  1,
  },
  DUPLA: {
    label:    'Dupla',
    emoji:    '👥',
    descricao: '2 eletricistas',
    maxPart:  2,
  },
  COLETIVO: {
    label:    'Coletivo',
    emoji:    '👨‍👩‍👧‍👦',
    descricao: 'Vários participantes (até 100)',
    maxPart:  100,
  },
}

// ─── Form inicial ─────────────────────────────────────────────────────────────
export const FORM_REGISTRO_INICIAL = () => ({
  tipo:           '',
  modalidade:     '',
  tipo_medida:    '',
  fiscal:         '',
  matricula_fiscal: '',
  data:           new Date().toISOString().split('T')[0],
  hora:           new Date().toTimeString().slice(0, 5),
  endereco:       '',
  lat:            null,
  lng:            null,
  gpsStatus:      'idle',
  pauta:          '',
  tema:           '',
  carga_horaria:  '',
  participantes:  [], // [{nome, matricula, assinatura (base64), assinaturaUrl, assinado_em}]
  fotos:          [], // [{url: base64}]
  lista_impressa: null, // base64 foto da lista impressa
  observacoes:    '',
})

// ─── Steps do fluxo ──────────────────────────────────────────────────────────
export const STEPS_REGISTRO = [
  'Tipo',
  'Modalidade',
  'Identificação',
  'Participantes',
  'Conteúdo',
  'Evidências',
  'Resultado',
]
