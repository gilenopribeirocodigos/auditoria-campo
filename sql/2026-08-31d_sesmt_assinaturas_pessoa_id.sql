-- Aplicar em ambos schemas: dev e public via Codex
--
-- Ate agora, sesmt_assinaturas_coletadas so guardava nome/matricula como
-- texto digitado na hora de assinar — sem vinculo confiavel com
-- sesmt_pessoas (a pessoa podia digitar algo que nao batesse exatamente
-- com a lista carregada). Isso impedia responder com confianca "quantas e
-- quais pessoas, do total carregado, ja assinaram uma acao".
--
-- pessoa_id passa a gravar o id exato da linha de sesmt_pessoas escolhida
-- no autocomplete (o app agora EXIGE selecionar da lista, nao aceita mais
-- nome/matricula livre). Sem constraint de FK formal (mesmo padrao "sem FK"
-- ja adotado nas outras tabelas do modulo SESMT) — o vinculo e controlado
-- pela aplicacao.
--
-- Com isso, pra saber quantos/quais assinaram do total de uma acao:
--   select p.* from sesmt_pessoas p
--   where p.ativo
--     and p.id in (
--       select pessoa_id from sesmt_assinaturas_coletadas where acao_id = <id da acao>
--     );
-- E pra saber quem NAO assinou (do total ativo):
--   select p.* from sesmt_pessoas p
--   where p.ativo
--     and p.id not in (
--       select pessoa_id from sesmt_assinaturas_coletadas
--       where acao_id = <id da acao> and pessoa_id is not null
--     );

-- DESENVOLVIMENTO ─────────────────────────────────────────────────────────────

alter table dev.sesmt_assinaturas_coletadas add column if not exists pessoa_id bigint;

-- PRODUCAO ────────────────────────────────────────────────────────────────────

alter table public.sesmt_assinaturas_coletadas add column if not exists pessoa_id bigint;

notify pgrst, 'reload schema';
