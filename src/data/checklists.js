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
// EMERGENCIAL tem 2 dimensões com checklists DISTINTOS para PRODUTIVO e IMPRODUTIVO:
//   EMERGENCIAL.DESEMPENHO.PRODUTIVO    — 15 perguntas (5 desclassificadores)
//   EMERGENCIAL.DESEMPENHO.IMPRODUTIVO  — 10 perguntas (1 desclassificador invertido)
//   EMERGENCIAL.POS_SERVICO.PRODUTIVO   — 11 perguntas (8 desclassificadores)
//   EMERGENCIAL.POS_SERVICO.IMPRODUTIVO —  5 perguntas
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
          { id: 4,  cat: 'DESEMPENHO',    p: 'A equipe realmente executou o corte?', disqualify: true, conditionalGroup: 'nao_debito' },
          { id: 5,  cat: 'DESEMPENHO',    p: 'O corte foi executado no local indicado na OS?', conditionalGroup: 'nao_debito' },
          { id: 6,  cat: 'QUALIDADE',     p: 'O local informado no corte condiz com o real?', conditionalGroup: 'nao_debito' },
          { id: 7,  cat: 'QUALIDADE',     p: 'Preenchido corretamente as informações no PDA (medidor, vizinhos, leitura, poste, placa trafo, etc)?' },
          { id: 8,  cat: 'QUALIDADE',     p: 'Foi feito o registro com foto conforme diretriz (local do corte, fachada, mini toi, etc)?' },
          { id: 9,  cat: 'QUALIDADE',     p: 'Havendo necessidade, foi deixado folheto referente à atividade em execução?', conditionalGroup: 'nao_debito' },
          { id: 10, cat: 'DESEMPENHO',    p: 'Equipe solicitou comprovante de pagamento das faturas apontadas na OS?', conditionalGroup: 'debito' },
          { id: 11, cat: 'DESEMPENHO',    p: 'Foi confirmado pagamento de todas as faturas apontadas na OS?',         conditionalGroup: 'debito' },
          { id: 12, cat: 'QUALIDADE',     p: 'Baixou a nota com o motivo correto?' },
          { id: 13, cat: 'DESEMPENHO',    p: 'Executou a atividade num tempo adequado (18 min)?', conditionalGroup: 'nao_debito' },
        { id: 14, cat: 'DESEMPENHO',    p: 'Executou a atividade num tempo adequado (10 min)?', conditionalGroup: 'so_debito' },
        ],
      },
      IMPRODUTIVO: {
        label: 'Improdutivo',
        peso: 11.1,
        items: [
          { id: 1,  cat: 'COMPORTAMENTO', p: 'A equipe seguiu padrão de abordagem ao cliente?' },
          { id: 2,  cat: 'COMPORTAMENTO', p: 'Conduta adequada? (bom comportamento, relacionamento, sem brigas ou discussões)' },
          { id: 3,  cat: 'DESEMPENHO',    p: 'A equipe deixou de executar o serviço de forma adequada?', inverted: true },
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
          { id: 4,  cat: 'DESEMPENHO',    p: 'A equipe realmente executou o corte?', disqualify: true, conditionalGroup: 'nao_debito' },
          { id: 5,  cat: 'DESEMPENHO',    p: 'O corte foi executado no local indicado na OS?', conditionalGroup: 'nao_debito' },
          { id: 6,  cat: 'QUALIDADE',     p: 'O local informado no corte condiz com o real?', conditionalGroup: 'nao_debito' },
          { id: 7,  cat: 'QUALIDADE',     p: 'Preenchido corretamente as informações no PDA (medidor, vizinhos, leitura, poste, placa trafo, etc)?' },
          { id: 8,  cat: 'QUALIDADE',     p: 'Foi feito o registro com foto conforme diretriz (local do corte, fachada, mini toi, etc)?' },
          { id: 10, cat: 'DESEMPENHO',    p: 'Equipe solicitou comprovante de pagamento das faturas apontadas na OS?' },
          { id: 12, cat: 'QUALIDADE',     p: 'Baixou a nota com o motivo correto?' },
          { id: 13, cat: 'DESEMPENHO',    p: 'Executou a atividade num tempo adequado (18 min)?', conditionalGroup: 'nao_debito' },
        { id: 14, cat: 'DESEMPENHO',    p: 'Executou a atividade num tempo adequado (10 min)?', conditionalGroup: 'so_debito' },
        ],
      },
      IMPRODUTIVO: {
        label: 'Improdutivo',
        peso: 12.5,
        items: [
          { id: 3,  cat: 'DESEMPENHO',    p: 'A equipe deixou de executar o serviço de forma adequada?', inverted: true },
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
          { id: 5,  cat: 'DESEMPENHO',    p: 'Houve instalação de medidor?',               marriedGroup: 'medidor', marriedRole: 'pai' },
          { id: 6,  cat: 'QUALIDADE',     p: 'Equipe lançou instalação do medidor na OS?',  marriedGroup: 'medidor', marriedRole: 'filho' },
          { id: 7,  cat: 'DESEMPENHO',    p: 'Houve instalação de ramal?',                  marriedGroup: 'ramal',   marriedRole: 'pai' },
          { id: 8,  cat: 'QUALIDADE',     p: 'Equipe lançou instalação do ramal na OS?',    marriedGroup: 'ramal',   marriedRole: 'filho' },
          { id: 9,  cat: 'QUALIDADE',     p: 'As informações no PDA foram preenchidas corretamente (medidor instalado, medidores vizinhos, leitura, poste, placa trafo, etc.)?' },
          { id: 10, cat: 'QUALIDADE',     p: 'O registro fotográfico foi feito conforme a diretriz (local do corte, fachada, mini toi, etc.)?' },
          { id: 11, cat: 'QUALIDADE',     p: 'A nota foi baixada com o motivo correto?' },
          { id: 12, cat: 'DESEMPENHO',    p: 'A atividade foi executada em tempo adequado (23 min)?' },
        ],
      },
      IMPRODUTIVO: {
        label: 'Improdutivo',
        peso: 11.1,
        items: [
          { id: 1,  cat: 'COMPORTAMENTO', p: 'A equipe seguiu padrão de abordagem ao cliente?' },
          { id: 2,  cat: 'COMPORTAMENTO', p: 'A conduta da equipe foi adequada (sem brigas, discussões ou desvios de comportamento)?' },
          { id: 3,  cat: 'DESEMPENHO',    p: 'A equipe deixou de executar o serviço de forma adequada?', inverted: true },
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
          { id: 5,  cat: 'DESEMPENHO',    p: 'Houve instalação de medidor?',               marriedGroup: 'medidor', marriedRole: 'pai' },
          { id: 6,  cat: 'QUALIDADE',     p: 'Equipe lançou instalação do medidor na OS?',  marriedGroup: 'medidor', marriedRole: 'filho' },
          { id: 7,  cat: 'DESEMPENHO',    p: 'Houve instalação de ramal?',                  marriedGroup: 'ramal',   marriedRole: 'pai' },
          { id: 8,  cat: 'QUALIDADE',     p: 'Equipe lançou instalação do ramal na OS?',    marriedGroup: 'ramal',   marriedRole: 'filho' },
          { id: 9,  cat: 'QUALIDADE',     p: 'As informações no PDA foram preenchidas corretamente (medidor instalado, medidores vizinhos, leitura, poste, placa trafo, etc.)?' },
          { id: 10, cat: 'QUALIDADE',     p: 'O registro fotográfico foi feito conforme a diretriz (local do corte, fachada, mini toi, etc.)?' },
          { id: 11, cat: 'QUALIDADE',     p: 'A nota foi baixada com o motivo correto?' },
          { id: 12, cat: 'DESEMPENHO',    p: 'A atividade foi executada em tempo adequado (23 min)?' },
        ],
      },
      IMPRODUTIVO: {
        label: 'Improdutivo',
        peso: 12.5,
        items: [
          { id: 3,  cat: 'DESEMPENHO',    p: 'A equipe deixou de executar o serviço de forma adequada?', inverted: true },
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

  // ═══════════════════════════════════════════════════════════════════════════
  // EMERGENCIAL — equipes de plantão / atendimento emergencial
  // PRODUTIVO e IMPRODUTIVO usam o MESMO checklist (decisão do negócio).
  // Vários itens são DESCLASSIFICADORES (resposta NÃO zera a nota).
  // ═══════════════════════════════════════════════════════════════════════════
  EMERGENCIAL: {
    label: 'Emergencial',
    emoji: '🚒',
    // ── 3 dimensões: tem nível de tipoAuditoria ──
    porAuditoria: true,
    DESEMPENHO: {
      PRODUTIVO: {
        label: 'Produtivo',
        peso: 6.7,
        items: [
          { id: 1,  cat: 'COMPORTAMENTO', p: 'Os eletricistas identificaram-se adequadamente para o cliente/morador caso estivesse presente no local?' },
          { id: 2,  cat: 'COMPORTAMENTO', p: 'A postura verbal e corporal de todos os integrantes foi profissional, educada e segura?' },
          { id: 3,  cat: 'DESEMPENHO',    p: 'A equipe estava equipada com todas as ferramentas, equipamentos de proteção coletiva (EPCs) e individuais (EPIs) necessários para realizar a tarefa acompanhada e as demais de forma totalmente segura?', disqualify: true },
          { id: 4,  cat: 'DESEMPENHO',    p: 'O veículo dispunha de um estoque mínimo e adequado de materiais (kit técnico: cabos de diversas bitolas, conectores, elos fusíveis variados, emendas automáticas, espaçadores, medidores etc.), garantindo autonomia para atendimento das ordens de serviços sem a necessidade de ressuprimento em campo ou abertura de nota de pendências?', disqualify: true },
          { id: 5,  cat: 'DESEMPENHO',    p: 'A equipe atualizou o status de "Trabalhando/Iniciado" imediatamente no sistema assim que concluiu o deslocamento?' },
          { id: 6,  cat: 'QUALIDADE',     p: 'O tempo total de deslocamento até o local foi condizente com a distância geográfica informada na ordem de serviço?' },
          { id: 7,  cat: 'DESEMPENHO',    p: 'Diante de uma falta de energia coletiva, a equipe percorreu minuciosamente a rede de distribuição (RDS) para identificar visualmente a causa raiz (condutores partidos, árvores tocando, isolador quebrado, transformador queimado etc.) antes de qualquer tentativa de reenergização?', disqualify: true },
          { id: 8,  cat: 'DESEMPENHO',    p: 'No restabelecimento coletivo, foi utilizado o elo fusível com a capacidade exata exigida para a potência do transformador ou ramal, garantindo a seletividade e a proteção correta do circuito?', disqualify: true },
          { id: 9,  cat: 'DESEMPENHO',    p: 'Em chamados individuais, a equipe realizou todos os testes e inspeções adequadas no quadro de medição e no ramal (Procedimento 360º)?', disqualify: true },
          { id: 10, cat: 'QUALIDADE',     p: 'O diagnóstico do problema (causa raiz) foi assertivo na primeira análise de campo?' },
          { id: 11, cat: 'DESEMPENHO',    p: 'A equipe executou tudo o que estava ao seu alcance técnico imediato para proteger a rede no local (poda de galhos pequenos/médios em contato com os fios, instalação de espaçadores para evitar curto-circuito em vãos de BT, emendas padrão com conectores corretos)?' },
          { id: 12, cat: 'QUALIDADE',     p: 'A equipe identificou e registrou de forma clara as vulnerabilidades que necessitam de intervenção planejada para evitar reincidências de falta de energia no curto prazo (Necessidade de Podas de Grande Porte, Necessidade de Troca de Transformador por indícios de Sobrecarga e Necessidade de Divisão de Área / Readequação de Circuitos ou troca de postes avariados)?' },
          { id: 13, cat: 'QUALIDADE',     p: 'A equipe realizou os registros fotográficos obrigatórios de campo demonstrando de forma nítida e correta o "Antes", o "Durante" e o "Depois" (ponto de defeito, leitura de grandezas elétricas, foto legível do medidor, abertura e fechamento das chaves etc.)?' },
          { id: 14, cat: 'COMPORTAMENTO', p: 'A equipe aplicou as diretrizes de atendimento verbal junto ao cliente, confirmando a normalização da energia, desculpando-se pelos transtornos causados e indicando o canal oficial para abertura de serviços (visita de despedida)?' },
          { id: 15, cat: 'COMPORTAMENTO', p: 'Caso o problema fosse de responsabilidade interna do consumidor, a equipe fez todos os registros necessários e instruiu o cliente corretamente sobre o tratamento do problema com um profissional particular?' },
        ],
      },
      IMPRODUTIVO: {
        label: 'Improdutivo',
        peso: 10.0,
        items: [
          { id: 1,  cat: 'COMPORTAMENTO', p: 'Os eletricistas identificaram-se adequadamente para o cliente/morador caso estivesse presente no local?' },
          { id: 2,  cat: 'COMPORTAMENTO', p: 'A postura verbal e corporal de todos os integrantes foi profissional, educada e segura?' },
          { id: 3,  cat: 'QUALIDADE',     p: 'Em caso de Casa Fechada, a equipe fez o registro claro de que a residência estava trancada/inacessível?' },
          { id: 4,  cat: 'QUALIDADE',     p: 'Em caso de defeito interno (responsabilidade do cliente), a equipe realizou a baixa de forma correta?' },
          { id: 5,  cat: 'COMPORTAMENTO', p: 'Em caso de Endereço não localizado, a equipe acionou o Fiscal/COI antes da conclusão?' },
          { id: 6,  cat: 'COMPORTAMENTO', p: 'Sobre o Procedimento 360º, a equipe verificou o disjuntor geral do padrão?' },
          { id: 7,  cat: 'COMPORTAMENTO', p: 'Sobre o Procedimento 360º, foi realizado teste de tensão/teste visual no medidor?' },
          { id: 8,  cat: 'COMPORTAMENTO', p: 'Sobre o Procedimento 360º, foi verificada a integridade do ramal de ligação no poste?' },
          { id: 9,  cat: 'COMPORTAMENTO', p: 'Sobre o Procedimento 360º, foram verificadas as conexões no poste?' },
          { id: 10, cat: 'COMPORTAMENTO', p: 'A equipe tentou classificar a nota de forma divergente da realidade observada?', inverted: true, disqualify: true },
        ],
      },
    },
    POS_SERVICO: {
      PRODUTIVO: {
        label: 'Produtivo',
        peso: 9.1,
        items: [
          { id: 1,  cat: 'DESEMPENHO',    p: 'As emendas de condutores, conexões elétricas e amarrações em isoladores seguem o padrão construtivo homologado da distribuidora (Sem gambiarras ou emendas frouxas)?' },
          { id: 2,  cat: 'DESEMPENHO',    p: 'O reparo executado resolveu o problema em definitivo?', disqualify: true },
          { id: 3,  cat: 'DESEMPENHO',    p: 'As vulnerabilidades estruturais encontradas na área que fogem do alcance da equipe emergencial foram cadastradas no sistema para programação planejada (solicitação de abertura de NDS para Necessidade de Podas de Grande Porte, Transformador com sinais visíveis de sobrecarga (vazamento de óleo/ruído excessivo) pendente de troca e/ou Estrutura com postes avariados, fiação desalinhada ou necessidade de divisão de área registrada)?' },
          { id: 4,  cat: 'DESEMPENHO',    p: 'Caso a equipe tenha relatado a execução de ações mitigadoras no local, os galhos pequenos foram cortados corretamente e os espaçadores foram instalados de forma firme para evitar curtos em vãos de BT?', disqualify: true },
          { id: 5,  cat: 'QUALIDADE',     p: 'A quantidade de cabo e o modelo de conector (cunha/perfurante) aplicados fisicamente na rede correspondem exatamente ao volume e tipo baixados pela equipe no encerramento da ordem de serviço?', disqualify: true },
          { id: 6,  cat: 'QUALIDADE',     p: 'Em chaves de proteção aérea, o elo fusível deixado instalado possui a capacidade exata e adequada para a potência do transformador (Sem superdimensionamento)?', disqualify: true },
          { id: 7,  cat: 'QUALIDADE',     p: 'A calçada, postes e vias públicas foram deixados limpos e livres de detritos, pedaços de fios decapados, isoladores velhos ou galhos provenientes de podas emergenciais?' },
          { id: 8,  cat: 'QUALIDADE',     p: 'As fotografias anexadas pela equipe para o encerramento da OS no sistema são nítidas, comprovam as três etapas ("Antes", "Durante" e "Depois") e correspondem à realidade encontrada em campo?', disqualify: true },
          { id: 9,  cat: 'COMPORTAMENTO', p: 'Se o cliente estiver presente, ele confirma que a energia voltou sem oscilações e que a equipe o instruiu corretamente (inclusive explicando sobre a contratação de profissional particular se o defeito fosse interno)?', disqualify: true },
          { id: 10, cat: 'DESEMPENHO',    p: 'Em casos de substituição de medidor por queima ou avaria, o equipamento antigo foi recolhido e encaminhado para o almoxarifado?', disqualify: true },
          { id: 11, cat: 'DESEMPENHO',    p: 'A sucata do ramal antigo (cobre ou alumínio) foi inteiramente retirada do local e registrada para devolução ao almoxarifado (Sem deixar sobras na calçada ou desvios de material)?', disqualify: true },
        ],
      },
      IMPRODUTIVO: {
        label: 'Improdutivo',
        peso: 20.0,
        items: [
          { id: 1, cat: 'QUALIDADE',  p: 'Em caso de Casa Fechada, a equipe realmente não teve acesso ao medidor para confirmar a interrupção?' },
          { id: 2, cat: 'QUALIDADE',  p: 'Em caso de Casa Fechada, há evidências fotográficas ou registro claro de que a residência estava trancada/inacessível?' },
          { id: 3, cat: 'DESEMPENHO', p: 'Em caso de interrupção individual por defeito interno (responsabilidade do cliente) sem recomposição do fornecimento, a equipe orientou o cliente corretamente sobre a contratação de profissional particular para tratamento das pendências?' },
          { id: 4, cat: 'QUALIDADE',  p: 'Em caso de conclusão por Endereço não localizado, as informações não eram suficientes para localizar o cliente?' },
          { id: 5, cat: 'DESEMPENHO', p: 'Em caso de conclusão Normal, a equipe realizou o fluxo do "Procedimento 360º"? (Checar Medidor, Checar Beiral, Checar Conexões Poste, Corrigir Defeito e Acionar Disjuntor)' },
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
  const deb = form?.debitoPago
  return items.filter(i => {
    // 'debito' (10,11): some APENAS quando NÃO (false). Aparece no SIM e no null.
    if (i.conditionalGroup === 'debito'     && deb === false) return false
    // 'nao_debito' (4,5,6,9,13): só aparece quando NÃO (false) ou null. Some quando SIM.
    if (i.conditionalGroup === 'nao_debito' && deb === true)  return false
    // 'so_debito' (14): só aparece quando SIM (true). Some quando NÃO ou null.
    if (i.conditionalGroup === 'so_debito'  && deb !== true)  return false
    return true
  })
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
  // Um item desclassificador zera a nota quando RESPONDIDO de forma NÃO CONFORME.
  // Item normal:    NÃO conforme = resposta "false" (NÃO)
  // Item invertido: NÃO conforme = resposta "true"  (SIM)
  // Reusa isItemConforme pra cobrir as duas situações de forma uniforme.
  return items.some(i => {
    if (!i.disqualify) return false
    const r = form.respostas[i.id]
    if (r === undefined || r === null) return false
    return !isItemConforme(i, items, form.respostas)
  })
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
    fiscal: '', matricula: '', prefixo: '', os: '', uc: '', numeroAS: '', endereco: '',
    lat: null, lng: null, gpsStatus: 'idle',
    respostas: {}, fotos: [], observacoes: '', feedback: '',
    nomeEletricista: '', assinatura: null,
    tipoAuditoria: '',
    nomeEletricista2: '',
    assinatura2: null,
    matriculaEletricista1: '',
    matriculaEletricista2: '',
    debitoPago: null, // null = ainda não respondeu o check "Foi débito pago?"
    // ── Motivo da Auditoria (vem da pauta, ex: "MATERIAL APLICADO EM CAMPO") ──
    motivoAuditoria:            '',   // '' = sem motivo específico nesta auditoria
    qtdeCabosOs:                '',
    qtdeCabosEmCampo:           '',
    fotosMotivo:                [],   // fotos exclusivas do motivo (mesmo formato de `fotos`)
    statusMotivoAuditoria:      null, // null | true (CONFORME) | false (NÃO CONFORME)
    observacoesMotivoAuditoria: '',
    // ── Tratamento instantâneo de NC (só Desempenho Operacional, tela S6) ──
    tratamentoNcTempoReal:      false, // checkbox obrigatório quando há NC
    fiscalAssinatura:           null,  // assinatura nova do fiscal — Termo de Ciência do Fiscal
    fiscalAssinaturaNome:       '',
  }
}
