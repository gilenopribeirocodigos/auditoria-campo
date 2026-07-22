-- Aplicar em ambos schemas: dev e public via Codex
-- Correção: mesmo padrão de falha já visto em pc_itens/pc_historico — o
-- DISABLE ROW LEVEL SECURITY do script anterior não pegou em
-- pc_classificacoes/pc_tipos_comprovante. Como o seed de dados rodou ANTES
-- do RLS estar de fato desabilitado, o INSERT inteiro falhou e as tabelas
-- ficaram vazias — por isso este script repete o DISABLE/GRANT e também
-- repete o seed (idempotente via ON CONFLICT DO NOTHING, seguro rodar de novo).

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

INSERT INTO public.pc_tipos_comprovante (nome) VALUES
('Recibo'),('Nota Fiscal'),('Extrato Conta')
ON CONFLICT (nome) DO NOTHING;

notify pgrst, 'reload schema';
