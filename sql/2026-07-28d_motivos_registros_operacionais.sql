-- Aplicar em ambos schemas: dev e public via Codex
--
-- Cadastro de "Motivos" por tipo de Registro Operacional (Alinhamento com
-- Equipe, Diálogo de Segurança, Treinamento, Feedback, Reunião de Resultado,
-- Medida Disciplinar). Objetivo: ser mais específico sobre o que motivou
-- cada registro, em vez de só o texto livre da Pauta/Conteúdo.
--
-- tipo_registro usa as MESMAS chaves de TIPOS_REGISTRO em
-- src/data/registros_config.js (ALINHAMENTO, DS, TREINAMENTO, FEEDBACK,
-- REUNIAO, DISCIPLINAR) — não o label em português.
--
-- Também adiciona a coluna "motivo" em registros_operacionais, onde o
-- registro final grava o motivo escolhido (texto livre em maiúsculas, não FK
-- — mesmo padrão de pc_classificacoes: cadastro serve só de sugestão/padrão,
-- remover um motivo daqui não afeta registros já lançados com esse texto).

-- DESENVOLVIMENTO ─────────────────────────────────────────────────────────────

create table if not exists dev.motivos_registros_operacionais (
  id            bigserial primary key,
  tipo_registro text not null,
  motivo        text not null,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  unique (tipo_registro, motivo)
);

alter table dev.registros_operacionais
  add column if not exists motivo text;

alter table dev.motivos_registros_operacionais disable row level security;
grant all on dev.motivos_registros_operacionais to anon, authenticated;
grant usage, select on sequence dev.motivos_registros_operacionais_id_seq to anon, authenticated;

insert into dev.motivos_registros_operacionais (tipo_registro, motivo) values
  ('ALINHAMENTO', 'REPASSE DE PROCEDIMENTO OPERACIONAL'),
  ('ALINHAMENTO', 'ALINHAMENTO DE METAS/INDICADORES'),
  ('ALINHAMENTO', 'NOVA DIRETRIZ/NORMA DA EQUATORIAL'),
  ('ALINHAMENTO', 'LIÇÃO APRENDIDA (REPASSE DE OCORRÊNCIA)'),
  ('ALINHAMENTO', 'ORGANIZAÇÃO DE ROTINA (ESCALA, VIATURA, EQUIPAMENTOS)'),
  ('ALINHAMENTO', 'QUALIDADE DO SERVIÇO EXECUTADO'),
  ('ALINHAMENTO', 'OUTROS'),

  ('DS', 'USO DE EPI/EPC'),
  ('DS', 'RISCO ELÉTRICO (CHOQUE/ARCO ELÉTRICO)'),
  ('DS', 'TRABALHO EM ALTURA'),
  ('DS', 'BLOQUEIO E ETIQUETAGEM (LOTO)'),
  ('DS', 'DISTÂNCIA MÍNIMA DE SEGURANÇA'),
  ('DS', 'CONDIÇÕES CLIMÁTICAS'),
  ('DS', 'DIREÇÃO DEFENSIVA/USO DE VIATURA'),
  ('DS', 'ORDEM E LIMPEZA (5S)'),
  ('DS', 'ANÁLISE PRELIMINAR DE RISCO (APR)'),
  ('DS', 'CUMPRIMENTO DE PROCEDIMENTO DE SEGURANÇA'),
  ('DS', 'OUTROS'),

  ('TREINAMENTO', 'NRS (NR-10, NR-35, ETC)'),
  ('TREINAMENTO', 'USO DE EQUIPAMENTO/FERRAMENTA NOVA'),
  ('TREINAMENTO', 'PROCEDIMENTO OPERACIONAL PADRÃO (POP)'),
  ('TREINAMENTO', 'USO DE SISTEMA/APP (SIGA, APP AUDITORIA)'),
  ('TREINAMENTO', 'DIREÇÃO DEFENSIVA'),
  ('TREINAMENTO', 'PRIMEIROS SOCORROS/RCP'),
  ('TREINAMENTO', 'OUTROS'),

  ('FEEDBACK', 'DESEMPENHO OPERACIONAL/PRODUTIVIDADE'),
  ('FEEDBACK', 'CUMPRIMENTO DE PRAZO/META'),
  ('FEEDBACK', 'QUALIDADE DO SERVIÇO'),
  ('FEEDBACK', 'POSTURA EM CAMPO'),
  ('FEEDBACK', 'USO DE EPI/EPC'),
  ('FEEDBACK', 'RELACIONAMENTO COM CLIENTE'),
  ('FEEDBACK', 'RECONHECIMENTO POR BOM DESEMPENHO'),
  ('FEEDBACK', 'DESCUMPRIMENTO DE JORNADA DE TRABALHO (CARGA HORÁRIA 8H)'),
  ('FEEDBACK', 'NÃO REALIZAÇÃO DE EXTENSÃO DE TURNO'),
  ('FEEDBACK', 'ATRASO/FALTA INJUSTIFICADA'),
  ('FEEDBACK', 'OUTROS'),

  ('REUNIAO', 'RESULTADO DE INDICADORES OPERACIONAIS'),
  ('REUNIAO', 'RESULTADO DE AUDITORIAS DE CAMPO'),
  ('REUNIAO', 'RESULTADO DE SEGURANÇA (ACIDENTES/QUASE-ACIDENTES)'),
  ('REUNIAO', 'METAS DO PERÍODO'),
  ('REUNIAO', 'PLANO DE AÇÃO CORRETIVO'),
  ('REUNIAO', 'OUTROS'),

  ('DISCIPLINAR', 'DESCUMPRIMENTO DE PROCEDIMENTO OPERACIONAL'),
  ('DISCIPLINAR', 'NÃO USO DE EPI/EPC'),
  ('DISCIPLINAR', 'ATRASO/FALTA INJUSTIFICADA'),
  ('DISCIPLINAR', 'CONDUTA INADEQUADA COM CLIENTE'),
  ('DISCIPLINAR', 'USO INDEVIDO DE VIATURA/EQUIPAMENTO'),
  ('DISCIPLINAR', 'NÃO CONFORMIDADE EM AUDITORIA'),
  ('DISCIPLINAR', 'OUTROS')
on conflict (tipo_registro, motivo) do nothing;

-- PRODUCAO ────────────────────────────────────────────────────────────────────

create table if not exists public.motivos_registros_operacionais (
  id            bigserial primary key,
  tipo_registro text not null,
  motivo        text not null,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  unique (tipo_registro, motivo)
);

alter table public.registros_operacionais
  add column if not exists motivo text;

alter table public.motivos_registros_operacionais disable row level security;
grant all on public.motivos_registros_operacionais to anon, authenticated;
grant usage, select on sequence public.motivos_registros_operacionais_id_seq to anon, authenticated;

insert into public.motivos_registros_operacionais (tipo_registro, motivo) values
  ('ALINHAMENTO', 'REPASSE DE PROCEDIMENTO OPERACIONAL'),
  ('ALINHAMENTO', 'ALINHAMENTO DE METAS/INDICADORES'),
  ('ALINHAMENTO', 'NOVA DIRETRIZ/NORMA DA EQUATORIAL'),
  ('ALINHAMENTO', 'LIÇÃO APRENDIDA (REPASSE DE OCORRÊNCIA)'),
  ('ALINHAMENTO', 'ORGANIZAÇÃO DE ROTINA (ESCALA, VIATURA, EQUIPAMENTOS)'),
  ('ALINHAMENTO', 'QUALIDADE DO SERVIÇO EXECUTADO'),
  ('ALINHAMENTO', 'OUTROS'),

  ('DS', 'USO DE EPI/EPC'),
  ('DS', 'RISCO ELÉTRICO (CHOQUE/ARCO ELÉTRICO)'),
  ('DS', 'TRABALHO EM ALTURA'),
  ('DS', 'BLOQUEIO E ETIQUETAGEM (LOTO)'),
  ('DS', 'DISTÂNCIA MÍNIMA DE SEGURANÇA'),
  ('DS', 'CONDIÇÕES CLIMÁTICAS'),
  ('DS', 'DIREÇÃO DEFENSIVA/USO DE VIATURA'),
  ('DS', 'ORDEM E LIMPEZA (5S)'),
  ('DS', 'ANÁLISE PRELIMINAR DE RISCO (APR)'),
  ('DS', 'CUMPRIMENTO DE PROCEDIMENTO DE SEGURANÇA'),
  ('DS', 'OUTROS'),

  ('TREINAMENTO', 'NRS (NR-10, NR-35, ETC)'),
  ('TREINAMENTO', 'USO DE EQUIPAMENTO/FERRAMENTA NOVA'),
  ('TREINAMENTO', 'PROCEDIMENTO OPERACIONAL PADRÃO (POP)'),
  ('TREINAMENTO', 'USO DE SISTEMA/APP (SIGA, APP AUDITORIA)'),
  ('TREINAMENTO', 'DIREÇÃO DEFENSIVA'),
  ('TREINAMENTO', 'PRIMEIROS SOCORROS/RCP'),
  ('TREINAMENTO', 'OUTROS'),

  ('FEEDBACK', 'DESEMPENHO OPERACIONAL/PRODUTIVIDADE'),
  ('FEEDBACK', 'CUMPRIMENTO DE PRAZO/META'),
  ('FEEDBACK', 'QUALIDADE DO SERVIÇO'),
  ('FEEDBACK', 'POSTURA EM CAMPO'),
  ('FEEDBACK', 'USO DE EPI/EPC'),
  ('FEEDBACK', 'RELACIONAMENTO COM CLIENTE'),
  ('FEEDBACK', 'RECONHECIMENTO POR BOM DESEMPENHO'),
  ('FEEDBACK', 'DESCUMPRIMENTO DE JORNADA DE TRABALHO (CARGA HORÁRIA 8H)'),
  ('FEEDBACK', 'NÃO REALIZAÇÃO DE EXTENSÃO DE TURNO'),
  ('FEEDBACK', 'ATRASO/FALTA INJUSTIFICADA'),
  ('FEEDBACK', 'OUTROS'),

  ('REUNIAO', 'RESULTADO DE INDICADORES OPERACIONAIS'),
  ('REUNIAO', 'RESULTADO DE AUDITORIAS DE CAMPO'),
  ('REUNIAO', 'RESULTADO DE SEGURANÇA (ACIDENTES/QUASE-ACIDENTES)'),
  ('REUNIAO', 'METAS DO PERÍODO'),
  ('REUNIAO', 'PLANO DE AÇÃO CORRETIVO'),
  ('REUNIAO', 'OUTROS'),

  ('DISCIPLINAR', 'DESCUMPRIMENTO DE PROCEDIMENTO OPERACIONAL'),
  ('DISCIPLINAR', 'NÃO USO DE EPI/EPC'),
  ('DISCIPLINAR', 'ATRASO/FALTA INJUSTIFICADA'),
  ('DISCIPLINAR', 'CONDUTA INADEQUADA COM CLIENTE'),
  ('DISCIPLINAR', 'USO INDEVIDO DE VIATURA/EQUIPAMENTO'),
  ('DISCIPLINAR', 'NÃO CONFORMIDADE EM AUDITORIA'),
  ('DISCIPLINAR', 'OUTROS')
on conflict (tipo_registro, motivo) do nothing;

notify pgrst, 'reload schema';
