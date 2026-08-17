-- Aplicar em ambos schemas: dev e public via Codex
--
-- Cria um indice UNICO em estrutura_equipes.matricula, necessario para a
-- reimportacao da Estrutura Online (e da aba Arquivo CSV) passar a usar
-- UPSERT (onConflict: 'matricula') em vez do padrao antigo de apagar a
-- tabela inteira e inserir tudo de novo.
--
-- Causa raiz do bug "justificativas de Presente/Ausente somem depois de
-- reimportar a estrutura": o fluxo antigo fazia SELECT -> DELETE (tabela
-- inteira) -> INSERT em 3+ chamadas separadas ao banco, sem transacao. Se
-- algo interrompesse o processo entre o DELETE e o INSERT (conexao
-- instavel no celular, app em segundo plano, recarregamento do PWA), a
-- tabela ficava vazia por um instante; a importacao seguinte lia essa
-- tabela vazia, nao reconhecia ninguem como "ja existente" e recriava o id
-- numerico de todo mundo — quebrando o vinculo com Frequencia/
-- Indisponibilidade (equipes_dia/indisponibilidades) ja registradas no dia.
-- Com upsert por matricula, a tabela nunca e apagada por completo: quem ja
-- esta la tem o id preservado sempre.
--
-- Passo 1: conferencia ANTES — nao deve haver matricula duplicada hoje.
-- Passo 2: dedupe de seguranca, mantendo so o registro mais recente
-- (maior carregado_em/id) por matricula, caso exista alguma duplicata.
-- Passo 3: cria o indice unico.
--
-- Rodar primeiro no DESENVOLVIMENTO (schema dev) e depois na PRODUCAO (schema public).

-- DESENVOLVIMENTO ─────────────────────────────────────────────────────────────

select 'dev.estrutura_equipes' as tabela, matricula, count(*)
from dev.estrutura_equipes
where matricula is not null and matricula <> ''
group by matricula
having count(*) > 1;

delete from dev.estrutura_equipes t
using dev.estrutura_equipes t2
where t.matricula is not null and t.matricula <> ''
  and t.matricula = t2.matricula
  and (t.carregado_em, t.id) < (t2.carregado_em, t2.id);

create unique index if not exists ux_estrutura_equipes_matricula
  on dev.estrutura_equipes (matricula);

select 'dev.estrutura_equipes' as tabela, matricula, count(*)
from dev.estrutura_equipes
where matricula is not null and matricula <> ''
group by matricula
having count(*) > 1;

-- PRODUCAO ────────────────────────────────────────────────────────────────────

select 'public.estrutura_equipes' as tabela, matricula, count(*)
from public.estrutura_equipes
where matricula is not null and matricula <> ''
group by matricula
having count(*) > 1;

delete from public.estrutura_equipes t
using public.estrutura_equipes t2
where t.matricula is not null and t.matricula <> ''
  and t.matricula = t2.matricula
  and (t.carregado_em, t.id) < (t2.carregado_em, t2.id);

create unique index if not exists ux_estrutura_equipes_matricula_public
  on public.estrutura_equipes (matricula);

select 'public.estrutura_equipes' as tabela, matricula, count(*)
from public.estrutura_equipes
where matricula is not null and matricula <> ''
group by matricula
having count(*) > 1;

notify pgrst, 'reload schema';
