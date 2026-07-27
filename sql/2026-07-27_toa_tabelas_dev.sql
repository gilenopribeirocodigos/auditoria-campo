-- Recria em dev (só teste) a estrutura das 5 tabelas TOA que já existem em
-- public (produção). Diferente do padrão usual do projeto (estrutura aplicada
-- nos dois schemas ao mesmo tempo), aqui é o caminho inverso: public já tem
-- as tabelas, dev está sendo criado agora pra permitir testar antes de mexer
-- em produção. Não altera nada em public.
--
-- Estrutura de colunas conferida via information_schema.columns em public
-- (arquivo Toa_Banco.csv fornecido pelo Gileno em 27/07/2026). PK/FK não
-- foram confirmadas por constraint — assumido que "id" é PRIMARY KEY (mesmo
-- padrão de nextval/sequência de toda tabela do projeto); nenhuma FK foi
-- adicionada por não ter confirmação de constraint em produção (evita
-- bloquear inserts de teste por engano — se precisar de FK de verdade,
-- confirme com o Codex antes).

CREATE TABLE IF NOT EXISTS dev.toa_pessoas (
  id                 bigserial PRIMARY KEY,
  matricula          text,
  cpf                text,
  nome               text NOT NULL,
  primeiro_visto_em  timestamptz NOT NULL DEFAULT now(),
  ultimo_visto_em    timestamptz NOT NULL DEFAULT now(),
  id_eletricista     uuid,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dev.toa_execucoes (
  id                     bigserial PRIMARY KEY,
  run_key                text NOT NULL,
  bloco                  text NOT NULL,
  inicio_em              timestamptz NOT NULL DEFAULT now(),
  fim_em                 timestamptz,
  status                 text NOT NULL,
  arquivo_xlsx           text,
  total_linhas           integer DEFAULT 0,
  total_com_rota         integer DEFAULT 0,
  total_com_eletricista  integer DEFAULT 0,
  total_erros            integer DEFAULT 0,
  mensagem               text
);

CREATE TABLE IF NOT EXISTS dev.toa_alocacoes_eletricistas (
  id                 bigserial PRIMARY KEY,
  data_base          date NOT NULL,
  localidade         text,
  recurso            text NOT NULL,
  pessoa_id          bigint NOT NULL,
  primeiro_visto_em  timestamptz NOT NULL DEFAULT now(),
  ultimo_visto_em    timestamptz NOT NULL DEFAULT now(),
  qtd_confirmacoes   integer NOT NULL DEFAULT 1,
  id_eletricista     uuid
);

CREATE TABLE IF NOT EXISTS dev.toa_leituras_recursos (
  id             bigserial PRIMARY KEY,
  execucao_id    bigint,
  run_key        text NOT NULL,
  bloco          text NOT NULL,
  localidade     text,
  recurso        text,
  login          text,
  logoff         text,
  inicio_almoco  text,
  fim_almoco     text,
  login_grade    text,
  logoff_grade   text,
  rota_detalhe   text,
  status_rota    text,
  placa_viatura  text,
  recurso_online text,
  erro_detalhe   text,
  dados          jsonb,
  coletado_em    timestamptz NOT NULL DEFAULT now(),
  data_extracao  date,
  hora_extracao  text
);

CREATE TABLE IF NOT EXISTS dev.toa_presencas_eletricistas (
  id             bigserial PRIMARY KEY,
  execucao_id    bigint,
  run_key        text NOT NULL,
  localidade     text,
  recurso        text NOT NULL,
  pessoa_id      bigint,
  matricula      text,
  nome           text,
  cpf            text,
  login          text,
  logoff         text,
  inicio_almoco  text,
  fim_almoco     text,
  placa_viatura  text,
  observado_em   timestamptz NOT NULL DEFAULT now(),
  data_extracao  date,
  hora_extracao  text,
  id_eletricista uuid
);

ALTER TABLE dev.toa_pessoas                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE dev.toa_execucoes               DISABLE ROW LEVEL SECURITY;
ALTER TABLE dev.toa_alocacoes_eletricistas  DISABLE ROW LEVEL SECURITY;
ALTER TABLE dev.toa_leituras_recursos       DISABLE ROW LEVEL SECURITY;
ALTER TABLE dev.toa_presencas_eletricistas  DISABLE ROW LEVEL SECURITY;

GRANT ALL ON dev.toa_pessoas                TO anon, authenticated;
GRANT ALL ON dev.toa_execucoes              TO anon, authenticated;
GRANT ALL ON dev.toa_alocacoes_eletricistas TO anon, authenticated;
GRANT ALL ON dev.toa_leituras_recursos      TO anon, authenticated;
GRANT ALL ON dev.toa_presencas_eletricistas TO anon, authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA dev TO anon, authenticated;

notify pgrst, 'reload schema';
