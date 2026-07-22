-- Aplicar em ambos schemas: dev e public via Codex
-- O rascunho não deve nascer com destinatario_id = o próprio criador
-- (o sistema não pode sugerir "enviar pra si mesmo"). Isso exige permitir
-- NULL nessa coluna enquanto a prestação ainda está em RASCUNHO — o
-- próprio código já bloqueia o envio até um destinatário real ser escolhido.

ALTER TABLE dev.pc_prestacoes ALTER COLUMN destinatario_id DROP NOT NULL;
ALTER TABLE public.pc_prestacoes ALTER COLUMN destinatario_id DROP NOT NULL;

notify pgrst, 'reload schema';
