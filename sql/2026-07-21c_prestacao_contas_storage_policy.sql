-- Rodar uma única vez no Supabase (Storage é global, não separa dev/public)
-- Corrige: upload de foto no bucket comprovantes-prestacao falhando com
-- "new row violates row-level security policy" (403) — o Storage do
-- Supabase sempre tem RLS ativo em storage.objects; "Public bucket" só
-- libera LEITURA, o upload (insert) precisa de uma política própria por
-- bucket, do mesmo jeito que já existe (em algum lugar) para fotos-auditoria.

CREATE POLICY "comprovantes_prestacao_select"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'comprovantes-prestacao');

CREATE POLICY "comprovantes_prestacao_insert"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'comprovantes-prestacao');

CREATE POLICY "comprovantes_prestacao_update"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'comprovantes-prestacao')
WITH CHECK (bucket_id = 'comprovantes-prestacao');
