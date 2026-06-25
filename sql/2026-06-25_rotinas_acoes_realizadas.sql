-- Acoes realizadas nas Rotinas Administrativas
-- Executar em desenvolvimento (schema dev) e producao (schema public).

ALTER TABLE dev.rotinas_subrotinas
  ADD COLUMN IF NOT EXISTS prefixo text,
  ADD COLUMN IF NOT EXISTS supervisor_campo text,
  ADD COLUMN IF NOT EXISTS eletricista text;

ALTER TABLE public.rotinas_subrotinas
  ADD COLUMN IF NOT EXISTS prefixo text,
  ADD COLUMN IF NOT EXISTS supervisor_campo text,
  ADD COLUMN IF NOT EXISTS eletricista text;

CREATE INDEX IF NOT EXISTS idx_rotinas_subrotinas_dev_prefixo ON dev.rotinas_subrotinas (prefixo);
CREATE INDEX IF NOT EXISTS idx_rotinas_subrotinas_dev_supervisor ON dev.rotinas_subrotinas (supervisor_campo);
CREATE INDEX IF NOT EXISTS idx_rotinas_subrotinas_dev_eletricista ON dev.rotinas_subrotinas (eletricista);

CREATE INDEX IF NOT EXISTS idx_rotinas_subrotinas_public_prefixo ON public.rotinas_subrotinas (prefixo);
CREATE INDEX IF NOT EXISTS idx_rotinas_subrotinas_public_supervisor ON public.rotinas_subrotinas (supervisor_campo);
CREATE INDEX IF NOT EXISTS idx_rotinas_subrotinas_public_eletricista ON public.rotinas_subrotinas (eletricista);

-- Forca o PostgREST/Supabase API a recarregar o cache de schema.
NOTIFY pgrst, 'reload schema';

-- Verificacao rapida apos executar:
-- SELECT table_schema, column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema IN ('dev', 'public')
--   AND table_name = 'rotinas_subrotinas'
--   AND column_name IN ('observacao', 'prefixo', 'supervisor_campo', 'eletricista')
-- ORDER BY table_schema, column_name;
