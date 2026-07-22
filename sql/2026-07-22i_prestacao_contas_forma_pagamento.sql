-- Aplicar em ambos schemas: dev e public via Codex
-- Terceira tabela de padrões (cadastro) pra Prestação de Contas, mesmo
-- molde de pc_classificacoes/pc_tipos_comprovante: em vez de lista fixa no
-- código, "Forma de pagamento" também vira editável pela tela "⚙️ Padrões".
-- Seed inicial = os mesmos valores que já estavam fixos em categorias.js.

CREATE TABLE IF NOT EXISTS dev.pc_formas_pagamento (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pc_formas_pagamento (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dev.pc_formas_pagamento DISABLE ROW LEVEL SECURITY;
GRANT ALL ON dev.pc_formas_pagamento TO anon, authenticated;
ALTER TABLE public.pc_formas_pagamento DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pc_formas_pagamento TO anon, authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA dev TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- ── Seed: Forma de Pagamento (dev + public) ─────────────────────────────────
INSERT INTO dev.pc_formas_pagamento (nome) VALUES
('PIX'),('Dinheiro'),('Cartão'),('Transferência')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO public.pc_formas_pagamento (nome) VALUES
('PIX'),('Dinheiro'),('Cartão'),('Transferência')
ON CONFLICT (nome) DO NOTHING;

notify pgrst, 'reload schema';
