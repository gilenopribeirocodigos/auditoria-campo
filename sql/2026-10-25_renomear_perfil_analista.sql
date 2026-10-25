-- Aplicar em ambos schemas: dev e public via Codex
--
-- Renomeia o perfil "ANALISTA" para "ANALISTA I" — abre espaço pro novo
-- perfil "ANALISTA II" (acesso restrito: só Registros Operacionais, e
-- dentro dele só o tipo "Tratamento de Reincidência" — usado por quem fica
-- alocado dentro da Equatorial). ANALISTA II não precisa de INSERT aqui:
-- é criado escolhendo o perfil no cadastro de usuário e marcando as
-- permissões em Gestão de Usuários → Permissões por Perfil (perfis não
-- vivem numa tabela própria, são só um texto usado em `usuarios.perfil` e
-- `perfis_permissoes.perfil`).
--
-- Atualiza:
--   1) usuarios.perfil         — quem tinha "ANALISTA" passa a ter "ANALISTA I"
--   2) perfis_permissoes.perfil — permissões já cadastradas pro perfil antigo
--      migram pro nome novo, sem precisar recriar nada em Permissões por Perfil

UPDATE dev.usuarios
   SET perfil = 'ANALISTA I'
 WHERE perfil = 'ANALISTA';

UPDATE dev.perfis_permissoes
   SET perfil = 'ANALISTA I'
 WHERE perfil = 'ANALISTA';

UPDATE public.usuarios
   SET perfil = 'ANALISTA I'
 WHERE perfil = 'ANALISTA';

UPDATE public.perfis_permissoes
   SET perfil = 'ANALISTA I'
 WHERE perfil = 'ANALISTA';

-- Modelos de Rotinas Administrativas que liberam a rotina "por perfil"
-- (campo perfil_responsavel) também precisam acompanhar o nome novo,
-- senão o modelo para de bater com quem logar como ANALISTA I.
UPDATE dev.rotinas_modelos
   SET perfil_responsavel = 'ANALISTA I'
 WHERE perfil_responsavel = 'ANALISTA';

UPDATE public.rotinas_modelos
   SET perfil_responsavel = 'ANALISTA I'
 WHERE perfil_responsavel = 'ANALISTA';
