// ═══════════════════════════════════════════════════════════════════════════
// ESTRUTURA DOS CHECKLISTS
//
// CORTE tem 4 checklists distintos (3 dimensões):
//   CORTE.DESEMPENHO.PRODUTIVO    — 13 perguntas, com lógica condicional "débito pago"
//   CORTE.DESEMPENHO.IMPRODUTIVO  —  9 perguntas
//   CORTE.POS_SERVICO.PRODUTIVO   —  8 perguntas
//   CORTE.POS_SERVICO.IMPRODUTIVO —  8 perguntas
//
// ANEXO e RELIGA mantêm checklist único (2 dimensões) — o mesmo vale para
// Desempenho e Pós Serviço. A função getChecklist() resolve isso.
//
// Lógica condicional (só CORTE.DESEMPENHO.PRODUTIVO):
//   Pergunta "Foi débito pago?" (campo form.debitoPago)
//     - SIM  → mostra perguntas 10 e 11 → 13 itens no cálculo
//     - NÃO  → esconde perguntas 10 e 11 → 11 itens no cálculo
//   Itens condicionais têm: conditionalGroup: 'debito'
// ═══════════════════════════════════════════════════════════════════════════

export const CHECKLISTS = {
  CORTE: {
    label: 'Corte / Recorte',
    emoji: '✂️',
    // ── 3 dimensões: tem nível de tipoAuditoria ──
    porAuditoria: true,
    DESEMPENHO: {
      PRODUTIVO: {
        label: 'Produtivo',
        peso: 7.7,
        items: [
          { id: 1,  cat: 'COMPORTAMENTO', p: 'A equipe seguiu padrão de abordagem ao cliente?' },
          { id: 2,  cat: 'COMPORTAMENTO', p: 'Conduta adequada? (bom comportamento, relacionamento, sem brigas ou discussões)' },
          { id: 3,  cat: 'DESEMPENHO',    p: 'Foi confirmada a unidade consumidora?' },
          { id: 4,  cat: 'DESEMPENHO',    p: 'A equipe realmente executou o corte?', disqualify: true },
          { id: 5,  cat: 'DESEMPENHO',    p: 'O corte foi executado no local indicado na OS?' },
          { id: 6,  cat: 'QUALIDADE',     p: 'O local informado no corte condiz com o real?' },
          { id: 7,  cat: 'QUALIDADE',     p: 'Preenchido corretamente as informações no PDA (medidor, vizinhos, leitura, poste, placa trafo, etc)?' },
          { id: 8,  cat: 'QUALIDADE',     p: 'Foi feito o registro com foto conforme diretriz (local do corte, fachada, mini toi, etc)?' },
          { id: 9,  cat: 'QUALIDADE',     p: 'Havendo necessidade, foi deixado folheto referente à atividade em execução?' },
          { id: 10, cat: 'DESEMPENHO',    p: 'Equipe solicitou comprovante de pagamento das faturas apontadas na OS?', conditionalGroup: 'debito' },
          { id: 11, cat: 'DESEMPENHO',    p: 'Foi confirmado pagamento de todas as faturas apontadas na OS?',         conditionalGroup: 'debito' },
          { id: 12, cat: 'QUALIDADE',     p: 'Baixou a nota com o motivo correto?' },
          { id: 13, cat: 'DESEMPENHO',    p: 'Executou a atividade num tempo adequado (18 min)?' },
        ],
      },
      IMPRODUTIVO: {
        label: 'Improdutivo',
        peso: 11.1,
        items: [
          { id: 1,  cat: 'COMPORTAMENTO', p: 'A equipe seguiu padrão de abordagem ao cliente?' },
          { id: 2,  cat: 'COMPORTAMENTO', p: 'Conduta adequada? (bom comportamento, relacionamento, sem brigas ou discussões)' },
          { id: 3,  cat: 'DESEMPENHO',    p: 'A equipe deixou de executar o serviço de forma adequada?' },
          { id: 4,  cat: 'DESEMPENHO',    p: 'A equipe apontou o motivo correto da não execução?' },
          { id: 5,  cat: 'QUALIDADE',     p: 'Preenchido corretamente as informações no PDA?' },
          { id: 6,  cat: 'QUALIDADE',     p: 'Registrado com foto o conforme diretriz (fachada/motivo impedimento/outro)?' },
          { id: 7,  cat: 'DESEMPENHO',    p: 'Embora tendo sido improdutivo, havia algo proativo que a equipe poderia ter feito para resolver?' },
          { id: 8,  cat: 'DESEMPENHO',    p: 'Baixou a nota com o motivo correto?' },
          { id: 9,  cat: 'DESEMPENHO',    p: 'Executou a atividade num tempo adequado (8 min)?' },
        ],
      },
    },
    POS_SERVICO: {
      PRODUTIVO: {
        label: 'Produtivo',
        peso: 12.5,
        items: [
          { id: 3,  cat: 'DESEMPENHO',    p: 'Foi cortada a unidade consumidora correta?' },
          { id: 4,  cat: 'DESEMPENHO',    p: 'A equipe realmente executou o corte?', disqualify: true },
          { id: 5,  cat: 'DESEMPENHO',    p: 'O corte foi executado no local indicado na OS?' },
          { id: 6,  cat: 'QUALIDADE',     p: 'O local informado no corte condiz com o real?' },
          { id: 7,  cat: 'QUALIDADE',     p: 'Preenchido corretamente as informações no PDA (medidor, vizinhos, leitura, poste, placa trafo, etc)?' },
          { id: 8,  cat: 'QUALIDADE',     p: 'Foi feito o registro com foto conforme diretriz (local do corte, fachada, mini toi, etc)?' },
          { id: 10, cat: 'DESEMPENHO',    p: 'Equipe solicitou comprovante de pagamento das faturas apontadas na OS?' },
          { id: 12, cat: 'QUALIDADE',     p: 'Baixou a nota com o motivo correto?' },
          { id: 13, cat: 'DESEMPENHO',    p: 'Executou a atividade num tempo adequado (18 min)?' },
        ],
      },
      IMPRODUTIVO: {
        label: 'Improdutivo',
        peso: 12.5,
        items: [
          { id: 3,  cat: 'DESEMPENHO',    p: 'A equipe deixou de executar o serviço de forma adequada?' },
          { id: 4,  cat: 'DESEMPENHO',    p: 'A equipe apontou o motivo correto da não execução?' },
          { id: 5,  cat: 'QUALIDADE',     p: 'Preenchido corretamente as informações no PDA?' },
          { id: 6,  cat: 'QUALIDADE',     p: 'Registrado com foto o conforme diretriz (fachada/motivo impedimento/outro)?' },
          { id: 8,  cat: 'DESEMPENHO',    p: 'Embora tendo sido improdutivo, havia algo proativo que a equipe poderia ter feito para resolver?' },
          { id: 9,  cat: 'DESEMPENHO',    p: 'Baixou a nota com o motivo correto?' },
          { id: 10, cat: 'DESEMPENHO',    p: 'Executou a atividade num tempo adequado (8 min)?' },
        ],
      },
    },
  },

  ANEXO: {
    label: 'Anexo (Liga Nova, GDIS, etc.)',
    emoji: '🔌',
    // ── 3 dimensões: tem nível de tipoAuditoria ──
    porAuditoria: true,
    DESEMPENHO: {
      PRODUTIVO: {
        label: 'Produtivo',
        peso: 7.7,
        items: [
          { id: 1,  cat: 'COMPORTAMENTO', p: 'A equipe seguiu padrão de abordagem ao cliente?' },
          { id: 2,  cat: 'COMPORTAMENTO', p: 'Conduta adequada? (bom comportamento, bom relacionamento, brincadeira, discursões)' },
          { id: 3,  cat: 'DESEMPENHO',    p: 'A equipe realmente executou a atividade que deveria fazer?', disqualify: true },
          { id: 4,  cat: 'QUALIDADE',     p: 'O padrão de medição do cliente foi montado conforme especifica a atividade (aterramento, altura, material, etc)?' },
          { id: 5,  cat: 'DESEMPENHO',    p: 'Houve instalação de medidor?',               marriedGroup: 'medidor', marriedRole: 'pai' },
          { id: 6,  cat: 'QUALIDADE',     p: 'Equipe lançou instalação do medidor na OS?',  marriedGroup: 'medidor', marriedRole: 'filho' },
          { id: 7,  cat: 'DESEMPENHO',    p: 'Houve instalação de ramal?',                  marriedGroup: 'ramal',   marriedRole: 'pai' },
          { id: 8,  cat: 'QUALIDADE',     p: 'Equipe lançou instalação do ramal na OS?',    marriedGroup: 'ramal',   marriedRole: 'filho' },
          { id: 9,  cat: 'QUALIDADE',     p: 'Preenchido corretamente as informações no PDA (medidor instalado; medidores vizinhos; leitura; poste; placa trafo, etc)?' },
          { id: 10, cat: 'QUALIDADE',     p: 'Registrado com foto o padrão (montado/rejeição/poste) conforme diretriz?' },
          { id: 11, cat: 'QUALIDADE',     p: 'Foi testado a instalação com leitura de grandezas elétricas (tensão, corrente, etc)?' },
          { id: 12, cat: 'QUALIDADE',     p: 'Baixou a nota com o motivo correto?' },
          { id: 13, cat: 'DESEMPENHO',    p: 'Executou a atividade num tempo adequado (40 min)?' },
        ],
      },
      IMPRODUTIVO: {
        label: 'Improdutivo',
        peso: 9.1,
        items: [
          { id: 1,  cat: 'COMPORTAMENTO', p: 'A equipe seguiu padrão de abordagem ao cliente?' },
          { id: 2,  cat: 'COMPORTAMENTO', p: 'Conduta adequada? (bom comportamento, bom relacionamento, brincadeira, discursões)' },
          { id: 3,  cat: 'DESEMPENHO',    p: 'Equipe tentou contato com o cliente?' },
          { id: 4,  cat: 'DESEMPENHO',    p: 'A equipe rejeitou o serviço de forma adequada?' },
          { id: 5,  cat: 'QUALIDADE',     p: 'A equipe apontou o motivo correto de rejeição?' },
          { id: 6,  cat: 'QUALIDADE',     p: 'Preenchido corretamente as informações no PDA (medidor instalado; medidores vizinhos; leitura; poste; placa trafo, etc)?' },
          { id: 7,  cat: 'QUALIDADE',     p: 'Registrado com foto o padrão (montado/rejeição/poste) conforme diretriz?' },
          { id: 8,  cat: 'QUALIDADE',     p: 'Havendo necessidade, foi deixado folheto referente à atividade em execução?' },
          { id: 9,  cat: 'DESEMPENHO',    p: 'Embora havendo padrão inadequado havia algo proativo que a equipe poderia fazer para resolver?', inverted: true },
          { id: 10, cat: 'QUALIDADE',     p: 'Baixou a nota com o motivo correto?' },
          { id: 11, cat: 'DESEMPENHO',    p: 'Executou a atividade num tempo adequado (10 min)?' },
        ],
      },
    },
    POS_SERVICO: {
      PRODUTIVO: {
        label: 'Produtivo',
        peso: 9.1,
        items: [
          { id: 3,  cat: 'DESEMPENHO',    p: 'A equipe realmente executou a atividade que deveria fazer?', disqualify: true },
          { id: 4,  cat: 'QUALIDADE',     p: 'O padrão de medição do cliente foi montado conforme especifica a atividade (aterramento, altura, material, etc)?' },
          { id: 5,  cat: 'DESEMPENHO',    p: 'Houve instalação de medidor?',               marriedGroup: 'medidor', marriedRole: 'pai' },
          { id: 6,  cat: 'QUALIDADE',     p: 'Equipe lançou instalação do medidor na OS?',  marriedGroup: 'medidor', marriedRole: 'filho' },
          { id: 7,  cat: 'DESEMPENHO',    p: 'Houve instalação de ramal?',                  marriedGroup: 'ramal',   marriedRole: 'pai' },
          { id: 8,  cat: 'QUALIDADE',     p: 'Equipe lançou instalação do ramal na OS?',    marriedGroup: 'ramal',   marriedRole: 'filho' },
          { id: 9,  cat: 'QUALIDADE',     p: 'Preenchido corretamente as informações no PDA (medidor instalado; medidores vizinhos; leitura; poste; placa trafo, etc)?' },
          { id: 10, cat: 'QUALIDADE',     p: 'Registrado com foto o padrão (montado/rejeição/poste) conforme diretriz?' },
          { id: 11, cat: 'QUALIDADE',     p: 'A unidade consumidora estava energizada (olhar se o medidor está com LED piscando)?' },
          { id: 12, cat: 'QUALIDADE',     p: 'Baixou a nota com o motivo correto?' },
          { id: 13, cat: 'DESEMPENHO',    p: 'Executou a atividade num tempo adequado (40 min)?' },
        ],
      },
      IMPRODUTIVO: {
        label: 'Improdutivo',
        peso: 11.1,
        items: [
          { id: 3,  cat: 'DESEMPENHO',    p: 'Equipe tentou contato com o cliente?' },
          { id: 4,  cat: 'DESEMPENHO',    p: 'A equipe rejeitou o serviço de forma adequada?' },
          { id: 5,  cat: 'QUALIDADE',     p: 'A equipe apontou o motivo correto de rejeição?' },
          { id: 6,  cat: 'QUALIDADE',     p: 'Preenchido corretamente as informações no PDA (medidor instalado; medidores vizinhos; leitura; poste; placa trafo, etc)?' },
          { id: 7,  cat: 'QUALIDADE',     p: 'Registrado com foto o padrão (montado/rejeição/poste) conforme diretriz?' },
          { id: 9,  cat: 'DESEMPENHO',    p: 'Embora havendo padrão inadequado havia algo proativo que a equipe poderia fazer para resolver?', inverted: true },
          { id: 10, cat: 'QUALIDADE',     p: 'Baixou a nota com o motivo correto?' },
          { id: 11, cat: 'DESEMPENHO',    p: 'Executou a atividade num tempo adequado (10 min)?' },
        ],
      },
    },
  },

  RELIGA: {
    label: 'Religação',
    emoji: '⚡',
    // ── 3 dimensões: tem nível de tipoAuditoria ──
    porAuditoria: true,
    DESEMPENHO: {
      PRODUTIVO: {
        label: 'Produtivo',
        peso: 12.5,
        items: [
          { id: 1,  cat: 'COMPORTAMENTO', p: 'A equipe seguiu padrão de abordagem ao cliente?' },
          { id: 2,  cat: 'COMPORTAMENTO', p: 'A conduta da equipe foi adequada (sem brigas, discussões ou desvios de comportamento)?' },
          { id: 3,  cat: 'QUALIDADE',     p: 'Foi confirmada a unidade consumidora antes da execução?' },
          { id: 4,  cat: 'DESEMPENHO',    p: 'A equipe realmente executou a religação?', disqualify: true },
          { id: 5,  cat: 'QUALIDADE',     p: 'As informações no PDA foram preenchidas corretamente (medidor instalado, medidores vizinhos, leitura, poste, placa trafo, etc.)?' },
          { id: 6,  cat: 'QUALIDADE',     p: 'O registro fotográfico foi feito conforme a diretriz (local do corte, fachada, mini toi, etc.)?' },
          { id: 9,  cat: 'QUALIDADE',     p: 'A nota foi baixada com o motivo correto?' },
          { id: 10, cat: 'DESEMPENHO',    p: 'A atividade foi executada em tempo adequado (23 min)?' },
        ],
      },
      IMPRODUTIVO: {
        label: 'Improdutivo',
        peso: 11.1,
        items: [
          { id: 1,  cat: 'COMPORTAMENTO', p: 'A equipe seguiu padrão de abordagem ao cliente?' },
          { id: 2,  cat: 'COMPORTAMENTO', p: 'A conduta da equipe foi adequada (sem brigas, discussões ou desvios de comportamento)?' },
          { id: 3,  cat: 'DESEMPENHO',    p: 'A equipe deixou de executar o serviço de forma adequada?' },
          { id: 4,  cat: 'DESEMPENHO',    p: 'A equipe apontou o motivo correto da não execução?' },
          { id: 5,  cat: 'QUALIDADE',     p: 'As informações no PDA foram preenchidas corretamente (medidor instalado, medidores vizinhos, leitura, poste, placa trafo, etc.)?' },
          { id: 6,  cat: 'QUALIDADE',     p: 'O registro fotográfico do padrão foi feito conforme a diretriz?' },
          { id: 8,  cat: 'DESEMPENHO',    p: 'Embora sendo improdutivo, havia algo proativo que a equipe poderia fazer para resolver?' },
          { id: 9,  cat: 'QUALIDADE',     p: 'A nota foi baixada com o motivo correto?' },
          { id: 10, cat: 'DESEMPENHO',    p: 'A atividade foi executada em tempo adequado (12 min)?' },
        ],
      },
    },
    POS_SERVICO: {
      PRODUTIVO: {
        label: 'Produtivo',
        peso: 12.5,
        items: [
          { id: 3,  cat: 'QUALIDADE',     p: 'A unidade consumidora estava energizada (olhar se o medidor está com LED piscando)?' },
          { id: 4,  cat: 'DESEMPENHO',    p: 'A equipe realmente executou a religação?', disqualify: true },
          { id: 5,  cat: 'QUALIDADE',     p: 'As informações no PDA foram preenchidas corretamente (medidor instalado, medidores vizinhos, leitura, poste, placa trafo, etc.)?' },
          { id: 6,  cat: 'QUALIDADE',     p: 'O registro fotográfico foi feito conforme a diretriz (local do corte, fachada, mini toi, etc.)?' },
          { id: 9,  cat: 'QUALIDADE',     p: 'A nota foi baixada com o motivo correto?' },
          { id: 10, cat: 'DESEMPENHO',    p: 'A atividade foi executada em tempo adequado (23 min)?' },
        ],
      },
      IMPRODUTIVO: {
        label: 'Improdutivo',
        peso: 12.5,
        items: [
          { id: 3,  cat: 'DESEMPENHO',    p: 'A equipe deixou de executar o serviço de forma adequada?' },
          { id: 4,  cat: 'DESEMPENHO',    p: 'A equipe apontou o motivo correto da não execução?' },
          { id: 5,  cat: 'QUALIDADE',     p: 'As informações no PDA foram preenchidas corretamente (medidor instalado, medidores vizinhos, leitura, poste, placa trafo, etc.)?' },
          { id: 6,  cat: 'QUALIDADE',     p: 'O registro fotográfico do padrão foi feito conforme a diretriz?' },
          { id: 8,  cat: 'DESEMPENHO',    p: 'Embora sendo improdutivo, havia algo proativo que a equipe poderia fazer para resolver?' },
          { id: 9,  cat: 'QUALIDADE',     p: 'A nota foi baixada com o motivo correto?' },
          { id: 10, cat: 'DESEMPENHO',    p: 'A atividade foi executada em tempo adequado (12 min)?' },
        ],
      },
    },
  },
}

export const CAT_META = {
  COMPORTAMENTO: { label: 'Comportamento', cls: 'badge-comp'  },
  QUALIDADE:     { label: 'Qualidade',     cls: 'badge-qual'  },
  DESEMPENHO:    { label: 'Desempenho',    cls: 'badge-desemp'},
}

// ─────────────────────────────────────────────────────────────────────────────
// getChecklist — resolve o checklist correto considerando as 3 dimensões.
// Para serviços com porAuditoria=true (CORTE), usa o nível tipoAuditoria.
// Para os demais (ANEXO, RELIGA), usa direto PRODUTIVO/IMPRODUTIVO (ignora auditoria).
// ─────────────────────────────────────────────────────────────────────────────
export function getChecklist(tipoServico, tipoAuditoria, produtivo) {
  const servico = CHECKLISTS[tipoServico]
  if (!servico) return null
  const tipo = produtivo ? 'PRODUTIVO' : 'IMPRODUTIVO'

  if (servico.porAuditoria) {
    // Fallback: se tipoAuditoria não vier, usa DESEMPENHO por padrão
    const aud = tipoAuditoria && servico[tipoAuditoria] ? tipoAuditoria : 'DESEMPENHO'
    return servico[aud]?.[tipo] || null
  }
  return servico[tipo] || null
}

// ─────────────────────────────────────────────────────────────────────────────
// getItemsAtivos — retorna apenas os itens que entram no cálculo, considerando
// a lógica condicional do "débito pago".
//   form.debitoPago === false → remove itens com conditionalGroup === 'debito'
//   form.debitoPago === true (ou undefined) → mantém todos
// ─────────────────────────────────────────────────────────────────────────────
export function getItemsAtivos(items, form) {
  if (!items) return []
  if (form?.debitoPago === false) {
    return items.filter(i => i.conditionalGroup !== 'debito')
  }
  return items
}

// ─────────────────────────────────────────────────────────────────────────────
// isItemConforme — determina se UM item específico está conforme
// Regra married (pai/filho), inverted e normal — inalteradas
// ─────────────────────────────────────────────────────────────────────────────
export function isItemConforme(item, items, respostas) {
  const r = respostas[item.id]

  if (item.marriedGroup && item.marriedRole === 'pai') {
    return true
  }

  if (item.marriedGroup && item.marriedRole === 'filho') {
    const pai  = items.find(p => p.marriedGroup === item.marriedGroup && p.marriedRole === 'pai')
    const rPai = pai ? respostas[pai.id] : undefined
    if (rPai === undefined || rPai === null) return true
    return rPai === r
  }

  if (item.inverted) return r === false

  return r === true
}

// ─────────────────────────────────────────────────────────────────────────────
// getItemsNaoConformes — itens NÃO conformes (já respeitando o débito condicional)
// ─────────────────────────────────────────────────────────────────────────────
export function getItemsNaoConformes(form) {
  if (!form.tipoServico || form.produtivo === null) return []
  const cl = getChecklist(form.tipoServico, form.tipoAuditoria, form.produtivo)
  if (!cl) return []
  const items = getItemsAtivos(cl.items, form)

  return items.filter(item => {
    const r = form.respostas[item.id]
    if (r === undefined || r === null) return false
    return !isItemConforme(item, items, form.respostas)
  })
}

export function isDisqualified(form) {
  if (!form.tipoServico || form.produtivo === null) return false
  const cl = getChecklist(form.tipoServico, form.tipoAuditoria, form.produtivo)
  if (!cl) return false
  const items = getItemsAtivos(cl.items, form)
  return items.some(i => i.disqualify && form.respostas[i.id] === false)
}

export function calcNota(form) {
  if (!form.tipoServico || form.produtivo === null) return 0
  if (isDisqualified(form)) return 0
  const cl = getChecklist(form.tipoServico, form.tipoAuditoria, form.produtivo)
  if (!cl) return 0
  const items = getItemsAtivos(cl.items, form)
  if (items.length === 0) return 0

  const sim = items.filter(i => isItemConforme(i, items, form.respostas)).length

  return Math.round((sim / items.length) * 1000) / 10
}

export function getStatus(nota) {
  if (nota >= 90) return { label: 'ATENDE',         color: '#16a34a', bg: '#dcfce7', border: '#86efac', icon: '🏆' }
  if (nota >= 80) return { label: 'ATENDE PARCIAL', color: '#d97706', bg: '#fef3c7', border: '#fcd34d', icon: '⚠️' }
  return                 { label: 'NÃO ATENDE',     color: '#dc2626', bg: '#fee2e2', border: '#fca5a5', icon: '🚫' }
}

export function nowDT() {
  const d = new Date()
  return { data: d.toISOString().split('T')[0], hora: d.toTimeString().slice(0, 5) }
}

export const FORM_INICIAL = () => {
  const dt = nowDT()
  return {
    tipoServico: '', produtivo: null,
    data: dt.data, hora: dt.hora,
    fiscal: '', matricula: '', prefixo: '', os: '', uc: '', endereco: '',
    lat: null, lng: null, gpsStatus: 'idle',
    respostas: {}, fotos: [], observacoes: '', feedback: '',
    nomeEletricista: '', assinatura: null,
    tipoAuditoria: '',
    nomeEletricista2: '',
    assinatura2: null,
    matriculaEletricista1: '',
    matriculaEletricista2: '',
    debitoPago: null, // null = ainda não respondeu o check "Foi débito pago?"
  }
}
