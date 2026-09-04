-- Encerramento controlado dos alertas pendentes anteriores ao início do novo processo.
-- Executado em produção em 04/09/2026, após validação prévia de 441 registros.
-- O corte usa o horário local de Fortaleza (-03) e preserva integralmente os alertas de 04/09/2026 em diante.

begin;

set local statement_timeout = '30s';

update public.stc_alertas
   set status_tratamento = 'ENCERRADO',
       encerrado_em = now(),
       atualizado_em = now(),
       encerrado_por = 'GILENO PONTES RIBEIRO',
       justificativa_encerramento = 'Encerramento em lote - Banco de dados travou e não foi possível tratar'
 where upper(trim(status_tratamento)) = 'PENDENTE'
   and criado_em < timestamptz '2026-09-04 00:00:00-03';

commit;
