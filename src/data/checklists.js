export const CHECKLISTS = {
  CORTE: {
    label: 'Corte / Recorte',
    emoji: '✂️',
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
        { id: 10, cat: 'DESEMPENHO',    p: 'Equipe solicitou comprovante de pagamento das faturas apontadas na OS?' },
        { id: 11, cat: 'DESEMPENHO',    p: 'Foi confirmado pagamento de todas as faturas apontadas na OS?' },
        { id: 12, cat: 'QUALIDADE',     p: 'Baixou a nota com o motivo correto?' },
        { id: 13, cat: 'DESEMPENHO',    p: 'Executou a atividade num tempo adequado (18 min)?' },
      ],
    },
    IMPRODUTIVO: {
      label: 'Improdutivo',
      peso: 10.0,
      items: [
        { id: 1,  cat: 'COMPORTAMENTO', p: 'A equipe seguiu padrão de abordagem ao cliente?' },
        { id: 2,  cat: 'COMPORTAMENTO', p: 'Conduta adequada? (bom comportamento, relacionamento, sem brigas ou discussões)' },
        { id: 3,  cat: 'DESEMPENHO',    p: 'A equipe deixou de executar o serviço de forma adequada?' },
        { id: 4,  cat: 'DESEMPENHO',    p: 'A equipe apontou o motivo correto da não execução?' },
        { id: 5,  cat: 'QUALIDADE',     p: 'Preenchido corretamente as informações no PDA?' },
        { id: 6,  cat: 'QUALIDADE',     p: 'Registrado com foto o conforme diretriz (fachada/motivo impedimento/outro)?' },
        { id: 7,  cat: 'QUALIDADE',     p: 'Havendo necessidade, foi deixado folheto referente à atividade em execução?' },
        { id: 8,  cat: 'DESEMPENHO',    p: 'Embora tendo sido improdutivo, havia algo proativo que a equipe poderia ter feito para resolver?' },
        { id: 9,  cat: 'QUALIDADE',     p: 'Baixou a nota com o motivo correto?' },
        { id: 10, cat: 'DESEMPENHO',    p: 'Executou a atividade num tempo adequado (8 min)?' },
      ],
    },
  },

  ANEXO: {
    label: 'Anexo (Liga Nova, GDIS, etc.)',
    emoji: '🔌',
    PRODUTIVO: {
      label: 'Produtivo',
      peso: 7.7,
      items: [
        { id: 1,  cat: 'COMPORTAMENTO', p: 'A equipe seguiu padrão de abordagem ao cliente?' },
        { id: 2,  cat: 'COMPORTAMENTO', p: 'Conduta adequada? (bom comportamento, bom relacionamento, brincadeira, discursões)' },
        { id: 3,  cat: 'DESEMPENHO',    p: 'A equipe realmente executou a atividade que deveria fazer?', disqualify: true },
        { id: 4,  cat: 'QUALIDADE',     p: 'O padrão de medição do cliente foi montado conforme especifica a atividade (aterramento, altura, material, etc)?' },
        { id: 5,  cat: 'DESEMPENHO',    p: 'Houve instalação de medidor?',              marriedGroup: 'medidor', marriedRole: 'pai' },
        { id: 6,  cat: 'QUALIDADE',     p: 'Equipe lançou instalação do medidor na OS?', marriedGroup: 'medidor', marriedRole: 'filho' },
        { id: 7,  cat: 'DESEMPENHO',    p: 'Houve instalação de ramal?',                 marriedGroup: 'ramal',   marriedRole: 'pai' },
        { id: 8,  cat: 'QUALIDADE',     p: 'Equipe lançou instalação do ramal na OS?',   marriedGroup: 'ramal',   marriedRole: 'filho' },
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

  RELIGA: {
    label: 'Religação',
    emoji: '⚡',
    PRODUTIVO: {
      label: 'Produtivo',
      peso: 10.0,
      items: [
        { id: 1,  cat: 'COMPORTAMENTO', p: 'A equipe seguiu padrão de abordagem ao cliente?' },
        { id: 2,  cat: 'COMPORTAMENTO', p: 'Conduta adequada? (bom comportamento, bom relacionamento, brincadeira, discursões)' },
        { id: 3,  cat: 'QUALIDADE',     p: 'Foi confirmada a unidade consumidora?' },
        { id: 4,  cat: 'DESEMPENHO',    p: 'A equipe realmente executou a religa?', disqualify: true },
        { id: 5,  cat: 'QUALIDADE',     p: 'Preenchido corretamente as informações no PDA (medidor instalado; medidores vizinhos; leitura; poste; placa trafo, etc)?' },
        { id: 6,  cat: 'QUALIDADE',     p: 'Foi feito o registro com foto conforme diretriz (local do corte, faxada, mini toi, ect)?' },
        { id: 7,  cat: 'QUALIDADE',     p: 'Havendo necessidade, foi deixado folheto referente à atividade em execução?' },
        { id: 8,  cat: 'QUALIDADE',     p: 'Equipe solicitou comprovante de pagamento das faturas apontadas na OS?' },
        { id: 9,  cat: 'QUALIDADE',     p: 'Baixou a nota com o motivo correto?' },
        { id: 10, cat: 'DESEMPENHO',    p: 'Executou a atividade num tempo adequado (23 min)?' },
      ],
    },
    IMPRODUTIVO: {
      label: 'Improdutivo',
      peso: 10.0,
      items: [
        { id: 1,  cat: 'COMPORTAMENTO', p: 'A equipe seguiu padrão de abordagem ao cliente?' },
        { id: 2,  cat: 'COMPORTAMENTO', p: 'Conduta adequada? (bom comportamento, bom relacionamento, brincadeira, discursões)' },
        { id: 3,  cat: 'DESEMPENHO',    p: 'A equipe deixou de executar o serviço de forma adequada?' },
        { id: 4,  cat: 'DESEMPENHO',    p: 'A equipe apontou o motivo correto da não execução?' },
        { id: 5,  cat: 'QUALIDADE',     p: 'Preenchido corretamente as informações no PDA (medidor instalado; medidores vizinhos; leitura; poste; placa trafo, etc)?' },
        { id: 6,  cat: 'QUALIDADE',     p: 'Registrado com foto o padrão (montado/rejeição/poste) conforme diretriz?' },
        { id: 7,  cat: 'QUALIDADE',     p: 'Havendo necessidade, foi deixado folheto referente à atividade em execução?' },
        { id: 8,  cat: 'DESEMPENHO',    p: 'Embora sendo improdutivo havia algo proativo que a equipe poderia fazer para resolver?' },
        { id: 9,  cat: 'QUALIDADE',     p: 'Baixou a nota com o motivo correto?' },
        { id: 10, cat: 'DESEMPENHO',    p: 'Executou a atividade num tempo adequado (12 min)?' },
      ],
    },
  },
}

export const CAT_META = {
  COMPORTAMENTO: { label: 'Comportamento', cls: 'badge-comp'  },
  QUALIDADE:     { label: 'Qualidade',     cls: 'badge-qual'  },
  DESEMPENHO:    { label: 'Desempenho',    cls: 'badge-desemp'},
}

export function isDisqualified(form) {
  if (!form.tipoServico || form.produtivo === null) return false
  const tipo  = form.produtivo ? 'PRODUTIVO' : 'IMPRODUTIVO'
  const items = CHECKLISTS[form.tipoServico][tipo].items
  return items.some(i => i.disqualify && form.respostas[i.id] === false)
}

export function calcNota(form) {
  if (!form.tipoServico || form.produtivo === null) return 0
  if (isDisqualified(form)) return 0
  const tipo  = form.produtivo ? 'PRODUTIVO' : 'IMPRODUTIVO'
  const items = CHECKLISTS[form.tipoServico][tipo].items

  // Itens que participam da contagem
  // Filhos cujo pai = NÃO são excluídos (atividade não ocorreu, não penaliza)
  const itensAtivos = items.filter(i => {
    if (i.marriedGroup && i.marriedRole === 'filho') {
      const pai  = items.find(p => p.marriedGroup === i.marriedGroup && p.marriedRole === 'pai')
      const rPai = pai ? form.respostas[pai.id] : undefined
      if (rPai === false) return false // pai = NÃO → filho não conta
    }
    return true
  })

  const sim = itensAtivos.filter(i => {
    const r = form.respostas[i.id]

    // Pai: SIM = certo, NÃO = errado
    if (i.marriedGroup && i.marriedRole === 'pai') {
      return r === true
    }

    // Filho (pai = SIM garantido aqui): SIM = certo, NÃO = errado
    if (i.marriedGroup && i.marriedRole === 'filho') {
      const pai  = items.find(p => p.marriedGroup === i.marriedGroup && p.marriedRole === 'pai')
      const rPai = pai ? form.respostas[pai.id] : undefined
      return rPai === true && r === true
    }

    // Invertida: NÃO = certo
    if (i.inverted) return r === false

    // Normal: SIM = certo
    return r === true
  }).length

  return Math.round((sim / itensAtivos.length) * 1000) / 10
}

export function getStatus(nota) {
  if (nota >= 90) return { label: 'ATENDE',         color: '#16a34a', bg: '#dcfce7', border: '#86efac', icon: '🏆' }
  if (nota >= 80) return { label: 'ATENDE PARCIAL', color: '#d97706', bg: '#fef3c7', border: '#fcd34d', icon: '⚠️' }
  return              { label: 'NÃO ATENDE',     color: '#dc2626', bg: '#fee2e2', border: '#fca5a5', icon: '🚫' }
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
  }
}
