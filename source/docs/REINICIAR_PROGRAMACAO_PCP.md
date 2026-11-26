# Reiniciar Programação PCP

## Operação

No **Kanban PCP**, usuários com perfil `ADMIN` ou `PCP` podem abrir **Nova programação / Reiniciar PCP**.

1. Escolha toda a programação, um intervalo de semanas planejadas ou lotes específicos.
2. Clique em **Visualizar impacto** e confira os fornos, lotes e semanas.
3. Informe a justificativa. No escopo total, digite `REINICIAR PCP`.
4. Confirme. A operação cria um snapshot e, na mesma transação, retira semanas e vínculos ativos.
5. Use **Criar nova programação** ou consulte **Histórico / Restaurar**.

Fornos, pedidos, apontamentos e histórico produtivo não são apagados. Lotes sem participantes ativos ficam cancelados como registros históricos.

## Restauração

Abra **Histórico / Restaurar**, gere a prévia e selecione os itens elegíveis. Fornos finalizados, já reprogramados ou com versão divergente aparecem como conflito e ficam bloqueados. A restauração dos selecionados ocorre de forma atômica e auditada.

## Rollback técnico

O rollback operacional é feito pela própria restauração do snapshot. Não use `TRUNCATE`, exclusão de lotes ou exclusão de apontamentos. Para reverter somente o código, publique o commit anterior; mantenha as tabelas e snapshots para preservar a auditoria.
