# Aprovação transacional do PCP

Esta entrega permanece em homologação e a migração não foi aplicada ao banco produtivo.

## Garantias implementadas

- Cada item utiliza `forno_id` como identidade persistente e mantém a série atual para exibição.
- A simulação é bloqueada durante a aprovação e precisa estar em `RASCUNHO`.
- A versão recebida pelo cliente deve coincidir com a versão persistida.
- Cada planejamento possui versão própria; divergências geram conflito SQL `40001`.
- Planejamento, lote, participantes, aprovação congelada e publicação da simulação são gravados na mesma transação.
- A primeira semana aprovada permanece em `planejamento_original_para`; reprogramações alteram somente a semana vigente.
- A função é `SECURITY INVOKER`, verifica `app_metadata.hd_role` e não recebe acesso de `anon` ou `public`.
- Apontamentos, horas, operadores e operações produtivas não são modificados.

## Homologação necessária

1. Aplicar a migração em ambiente de teste.
2. Testar aprovação total e parcial com usuário PCP.
3. Testar conflito de versão com duas sessões.
4. Confirmar rollback integral ao introduzir um item inválido.
5. Executar os advisors de segurança e desempenho.
6. Somente após aprovação explícita aplicar no projeto produtivo.

