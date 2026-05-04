export const CHECKLISTS = {
  CORTE: {
    label: 'Corte / Recorte',
    emoji: '✂️',
    PRODUTIVO: {
      label: 'Produtivo',
      peso: 7.7, // 13 itens × 7.7 = 100.1
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
        { id: 13, cat: 'DESEMPENHO',    p: 'Executou a atividade num tempo adequado?' },
      ],
    },
    IMPRODUTIVO: {
      label: 'Improdutivo',
      peso: 10.0, // 10 itens × 10 = 100
      items: [
        { id: 1,  cat: 'COMPORTAMENTO', p: 'A equipe seguiu padrão de abordagem ao cliente?' },
        { id: 2,  cat: 'COMPORTAMENTO', p: 'Conduta adequada? (bom comportamento, relacionamento, sem brigas ou discussões)' },
        { id: 3,  cat: 'DESEMPENHO',    p: 'A equipe deixou de executar o serviço de forma adequada?' },
        { id: 4,  cat: 'DESEMPENHO',    p: 'A equipe apontou o motivo correto da não execução?' },
        { id: 5,  cat: 'QUALIDADE',     p: 'Preenchido corretamente as informações no PDA?' },
        { id: 6,  cat: 'QUALIDADE',     p: 'Registrado com foto o padrão (montagem/rejeição/poste) conforme diretriz?' },
        { id: 7,  cat: 'QUALIDADE',     p: 'Havendo necessidade, foi deixado folheto referente à atividade em execução?' },
        { id: 8,  cat: 'DESEMPENHO',    p: 'Embora havendo padrão inadequado, havia algo proativo que a equipe poderia ter feito para resolver?' },
        { id: 9,  cat: 'QUALIDADE',     p: 'Baixou a nota com o motivo correto?' },
        { id: 10, cat: 'DESEMPENHO',    p: 'Executou a atividade num tempo adequado?' },
      ],
    },
  },
  ANEXO: {
    label: 'Anexo (Liga Nova, GDIS, etc.)',
    emoji: '🔌',
    PRODUTIVO: {
      label: 'Produtivo',
      peso: 8.3,
      items: [
        { id: 1,  cat: 'COMPORTAMENTO', p: 'A equipe seguiu padrão de abordagem ao cliente?' },
        { id: 2,  cat: 'COMPORTAMENTO', p: 'Conduta adequada? (bom comportamento, relacionamento, sem brigas ou discussões)' },
        { id: 3,  cat: 'QUALIDADE',     p: 'O padrão de medição do cliente foi montado conforme especifica a atividade (aterramento, altura, material, etc)?' },
        { id: 4,  cat: 'DESEMPENHO',    p: 'Houve instalação de medidor?' },
        { id: 5,  cat: 'QUALIDADE',     p: 'Equipe lançou instalação do medidor na OS?' },
        { id: 6,  cat: 'QUALIDADE',     p: 'Equipe lançou instalação do ramal?' },
        { id: 7,  cat: 'QUALIDADE',     p: 'Preenchido corretamente as informações no PDA (medidor instalado, medidores vizinhos, leitura, poste, placa trafo, etc)?' },
        { id: 8,  cat: 'QUALIDADE',     p: 'Registrado com foto o padrão (montagem/rejeição/poste) conforme diretriz?' },
        { id: 9,  cat: 'QUALIDADE',     p: 'Foi testado/validado com leitura de grandezas elétricas (tensão, corrente, etc)?' },
        { id: 10, cat: 'QUALIDADE',     p: 'Baixou a nota com o motivo correto?' },
        { id: 11, cat: 'DESEMPENHO',    p: 'Executou a atividade num tempo adequado?' },
      ],
    },
    IMPRODUTIVO: {
      label: 'Improdutivo',
      peso: 9.1,
      items: [
        { id: 1,  cat: 'COMPORTAMENTO', p: 'A equipe seguiu padrão de abordagem ao cliente?' },
        { id: 2,  cat: 'COMPORTAMENTO', p: 'Conduta adequada? (bom comportamento, relacionamento, sem brigas ou discussões)' },
        { id: 3,  cat: 'QUALIDADE',     p: 'A equipe rejeitou o serviço de forma adequada?' },
        { id: 4,  cat: 'QUALIDADE',     p: 'A equipe apontou o motivo correto de rejeição?' },
        { id: 5,  cat: 'QUALIDADE',     p: 'Preenchido corretamente as informações no PDA?' },
        { id: 6,  cat: 'QUALIDADE',     p: 'Registrado com foto o padrão (montagem/rejeição/poste) conforme diretriz?' },
        { id: 7,  cat: 'QUALIDADE',     p: 'Havendo necessidade, foi deixado folheto referente à atividade em execução?' },
        { id: 8,  cat: 'DESEMPENHO',    p: 'Embora havendo padrão inadequado, havia algo proativo que a equipe poderia ter feito para resolver?' },
        { id: 9,  cat: 'QUALIDADE',     p: 'Baixou a nota com o motivo correto?' },
        { id: 10, cat: 'DESEMPENHO',    p: 'Executou a atividade num tempo adequado?' },
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
  const sim   = items.filter(i => form.respostas[i.id] === true).length
  return Math.round((sim / items.length) * 1000) / 10
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
  }
}
