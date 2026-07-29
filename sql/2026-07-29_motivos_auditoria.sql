-- Aplicar em ambos schemas: dev e public via Codex
--
-- Cadastro de "Motivos da Auditoria" (Pauta de Fiscalização). Antes era uma
-- lista fixa no código (MOTIVOS_AUDITORIA em src/pages/GestaoPauta.jsx:
-- 'MATERIAL APLICADO EM CAMPO' e 'RELIGA VINCULADA'). Agora vira cadastro
-- editável — mesmo padrão de motivos_registros_operacionais/pc_classificacoes:
-- a tabela serve só de sugestão/padrão pro dropdown da pauta; a pauta grava o
-- motivo escolhido como texto livre (não FK), então remover um motivo daqui
-- não afeta pautas já lançadas com esse texto.
--
-- ATENÇÃO: o texto 'MATERIAL APLICADO EM CAMPO' é tratado como valor especial
-- em código (MOTIVO_MATERIAL_APLICADO em GestaoPauta.jsx/S4Fotos.jsx/
-- checklists.js) — habilita o campo QTDE CABOS OS e uma foto extra
-- obrigatória. Não renomear/remover essa linha do cadastro sem atualizar
-- também esses arquivos.

-- DESENVOLVIMENTO ─────────────────────────────────────────────────────────────

create table if not exists dev.motivos_auditoria (
  id        bigserial primary key,
  motivo    text not null unique,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table dev.motivos_auditoria disable row level security;
grant all on dev.motivos_auditoria to anon, authenticated;
grant usage, select on sequence dev.motivos_auditoria_id_seq to anon, authenticated;

insert into dev.motivos_auditoria (motivo) values
  ('MATERIAL APLICADO EM CAMPO'),
  ('RELIGA VINCULADA')
on conflict (motivo) do nothing;

-- PRODUCAO ────────────────────────────────────────────────────────────────────

create table if not exists public.motivos_auditoria (
  id        bigserial primary key,
  motivo    text not null unique,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table public.motivos_auditoria disable row level security;
grant all on public.motivos_auditoria to anon, authenticated;
grant usage, select on sequence public.motivos_auditoria_id_seq to anon, authenticated;

insert into public.motivos_auditoria (motivo) values
  ('MATERIAL APLICADO EM CAMPO'),
  ('RELIGA VINCULADA')
on conflict (motivo) do nothing;

notify pgrst, 'reload schema';
