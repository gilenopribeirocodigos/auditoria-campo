-- Fechamento em lote dos Alertas TMA pendentes (public.stc_alertas) — rodar
-- manualmente via Codex, NÃO versiona migração de tabela nova (só um UPDATE
-- pontual). Essa tabela só existe em "public" — é alimentada pela integração
-- externa STC, sem espelho em "dev" (lib/alertasSTC.js aponta direto pra
-- public.stc_alertas via supabase.schema('public')).
--
-- Replica exatamente o que a função public.stc_encerrar_alerta() faz por
-- alerta individual (ver sql/stc_alertas_pagina_publica.sql), só que pra
-- TODOS os pendentes de uma vez em vez de um por um.
--
-- AJUSTE o nome e a justificativa abaixo antes de rodar, se quiser outro texto.

-- 1) Conferir ANTES de rodar — quantos pendentes vão ser fechados:
select count(*) as total_pendentes
from public.stc_alertas
where status_tratamento = 'PENDENTE';

-- 2) Fechamento em lote:
update public.stc_alertas
set
  status_tratamento           = 'ENCERRADO',
  encerrado_em                = now(),
  encerrado_por                = 'GILENO PONTES RIBEIRO',
  justificativa_encerramento  = 'Fechamento administrativo em lote — alerta sem tratamento do fiscal dentro do prazo.',
  atualizado_em                = now()
where status_tratamento = 'PENDENTE';

-- 3) Conferir DEPOIS de rodar — deve retornar 0:
select count(*) as pendentes_restantes
from public.stc_alertas
where status_tratamento = 'PENDENTE';
