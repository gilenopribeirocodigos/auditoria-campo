-- Aplicar em ambos schemas: dev e public via Codex
--
-- Suporte ao QR de autoatendimento presencial: além do link "Online" (pra
-- quem assina remotamente, restrito à lista de participantes que o fiscal
-- já adicionou), agora existe um segundo modo de token — "AUTOATENDIMENTO"
-- — pensado pra imprimir/fixar no local: qualquer pessoa da lista carregada
-- (sesmt_pessoas) pode escanear e assinar sozinha, sem precisar já estar
-- pré-adicionada pelo fiscal.
--
-- A coluna "modo" na tabela de tokens (sesmt_assinaturas_pendentes) marca
-- qual dos dois é aquele link/QR — a página pública /assinar-sesmt/:token
-- usa isso pra decidir se restringe a assinatura à lista de participantes
-- da ação ou libera pra qualquer um da lista geral.

-- DESENVOLVIMENTO ─────────────────────────────────────────────────────────────

alter table dev.sesmt_assinaturas_pendentes
  add column if not exists modo text not null default 'ONLINE';

-- PRODUCAO ────────────────────────────────────────────────────────────────────

alter table public.sesmt_assinaturas_pendentes
  add column if not exists modo text not null default 'ONLINE';

notify pgrst, 'reload schema';
