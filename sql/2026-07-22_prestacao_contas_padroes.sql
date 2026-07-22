-- Aplicar em ambos schemas: dev e public via Codex
-- Tabelas de padrões (cadastro) pra Prestação de Contas: em vez de uma
-- lista fixa no código, Classificação e Tipo de Comprovante agora vêm de
-- tabelas que podem ser editadas pela tela "⚙️ Padrões" (permissão
-- prestacao_contas_configurar), sem precisar de deploy novo.
-- Seed inicial = os mesmos valores que já estavam fixos em categorias.js,
-- pra não perder nenhuma sugestão que já existia.

CREATE TABLE IF NOT EXISTS dev.pc_classificacoes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dev.pc_tipos_comprovante (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pc_classificacoes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pc_tipos_comprovante (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dev.pc_classificacoes DISABLE ROW LEVEL SECURITY;
GRANT ALL ON dev.pc_classificacoes TO anon, authenticated;
ALTER TABLE dev.pc_tipos_comprovante DISABLE ROW LEVEL SECURITY;
GRANT ALL ON dev.pc_tipos_comprovante TO anon, authenticated;
ALTER TABLE public.pc_classificacoes DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pc_classificacoes TO anon, authenticated;
ALTER TABLE public.pc_tipos_comprovante DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pc_tipos_comprovante TO anon, authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA dev TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- ── Seed: Classificação (dev) ────────────────────────────────────────────────
INSERT INTO dev.pc_classificacoes (nome) VALUES
('ABASTECIMENTO'),('ACESSORIO MOTO'),('ADAPTADOR'),('AJUSTE ROUPA'),('ALIMENTAÇÃO'),('ALMOÇO'),
('BALSA'),('BATERIA'),('BAU MOTO'),('BORRACHARIA'),('BROCA'),('CABO'),('CABO CARGA'),('CABO TIPO C'),
('CADEADO'),('CAFÉ DA MANHÃ'),('CAMARA DE AR'),('CANIVET'),('CARGA BATERIA'),('CARREGADOR'),('CHAVE'),
('COFFEE BREAK'),('COMPRA'),('CONSERTO'),('CONSERTO CELULAR'),('CONSERTO MOTO'),('CONSERTO PNEU'),
('CORREIOS'),('COSTURA'),('DADOS MOVEIS'),('EMPLACAMENTO'),('ENSAIO ELETRCICO'),('EPC'),('EPI'),
('EVENTO SIPAT'),('FAIXA DE SINALIZAÇÃO'),('GELO'),('JANTAR'),('LANCHE'),('LAVA JATO'),('LAVAGEM'),
('LAVAGEM DE VIATURA'),('LED'),('LIMPEZA BASE'),('LUVA'),('MANUTENÇÃO'),('MATERIAIS'),
('MATERIAL DE CONSTRUÇÃO'),('MATERIAL REPARO'),('MOLA'),('OLEO'),('PARAFUSOS'),('PASSAGEM'),('PLACA'),
('PREMIAÇÃO'),('PREMIAÇÃO EQUIPES'),('PRODUTO PARA VEÍCULO'),('RECARGA DADOS'),('REFEIÇÃO'),
('REMENDO'),('REMENDO PNEU'),('RESISTENCIA'),('SERRA COPO'),('SERVIDOR'),('SERVIÇO BATERIA'),
('SERVIÇO PNEU'),('SERVIÇO VIATURA'),('SISTEMA'),('SOLDA'),('SUPORTE TV'),('TELEFONIA'),('TONER'),
('TROCA BATERIA'),('TROFEU ACRÍLICO'),('VIAGEM'),('VULCANIZAÇÃO'),('VULCANIZAÇÃO PNEU'),('ÁGUA')
ON CONFLICT (nome) DO NOTHING;

-- ── Seed: Tipo de Comprovante (dev) — "Outro" fica fixo na tela, não entra aqui
INSERT INTO dev.pc_tipos_comprovante (nome) VALUES
('Recibo'),('Nota Fiscal'),('Extrato Conta')
ON CONFLICT (nome) DO NOTHING;

-- ── Seed: Classificação (public) ─────────────────────────────────────────────
INSERT INTO public.pc_classificacoes (nome) VALUES
('ABASTECIMENTO'),('ACESSORIO MOTO'),('ADAPTADOR'),('AJUSTE ROUPA'),('ALIMENTAÇÃO'),('ALMOÇO'),
('BALSA'),('BATERIA'),('BAU MOTO'),('BORRACHARIA'),('BROCA'),('CABO'),('CABO CARGA'),('CABO TIPO C'),
('CADEADO'),('CAFÉ DA MANHÃ'),('CAMARA DE AR'),('CANIVET'),('CARGA BATERIA'),('CARREGADOR'),('CHAVE'),
('COFFEE BREAK'),('COMPRA'),('CONSERTO'),('CONSERTO CELULAR'),('CONSERTO MOTO'),('CONSERTO PNEU'),
('CORREIOS'),('COSTURA'),('DADOS MOVEIS'),('EMPLACAMENTO'),('ENSAIO ELETRCICO'),('EPC'),('EPI'),
('EVENTO SIPAT'),('FAIXA DE SINALIZAÇÃO'),('GELO'),('JANTAR'),('LANCHE'),('LAVA JATO'),('LAVAGEM'),
('LAVAGEM DE VIATURA'),('LED'),('LIMPEZA BASE'),('LUVA'),('MANUTENÇÃO'),('MATERIAIS'),
('MATERIAL DE CONSTRUÇÃO'),('MATERIAL REPARO'),('MOLA'),('OLEO'),('PARAFUSOS'),('PASSAGEM'),('PLACA'),
('PREMIAÇÃO'),('PREMIAÇÃO EQUIPES'),('PRODUTO PARA VEÍCULO'),('RECARGA DADOS'),('REFEIÇÃO'),
('REMENDO'),('REMENDO PNEU'),('RESISTENCIA'),('SERRA COPO'),('SERVIDOR'),('SERVIÇO BATERIA'),
('SERVIÇO PNEU'),('SERVIÇO VIATURA'),('SISTEMA'),('SOLDA'),('SUPORTE TV'),('TELEFONIA'),('TONER'),
('TROCA BATERIA'),('TROFEU ACRÍLICO'),('VIAGEM'),('VULCANIZAÇÃO'),('VULCANIZAÇÃO PNEU'),('ÁGUA')
ON CONFLICT (nome) DO NOTHING;

-- ── Seed: Tipo de Comprovante (public) ───────────────────────────────────────
INSERT INTO public.pc_tipos_comprovante (nome) VALUES
('Recibo'),('Nota Fiscal'),('Extrato Conta')
ON CONFLICT (nome) DO NOTHING;

notify pgrst, 'reload schema';
