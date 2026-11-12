# Publicação e rollback

## Pré-condições

1. PR #9 revisada e aprovada.
2. Backup/PITR do projeto confirmado.
3. Fotografia de reconciliação registrada imediatamente antes da mudança.
4. Responsáveis do PCP e da Elétrica disponíveis para teste.
5. Migrações pendentes `20261112070000_reprogramacao_transacional_pcp.sql` e `20261112140000_limite_mensal_programacao.sql` revisadas e autorizadas explicitamente.

## Ordem de implantação

1. Suspender aprovações de programação durante a janela.
2. Registrar totais de fornos, planejamentos, lotes, vínculos e históricos.
3. Aplicar somente as migrações explicitamente autorizadas, uma por vez, na ordem de dependência.
4. Executar consultas de integridade e advisors.
5. Testar leitura com perfil `CONSULTA`.
6. Testar capacidade e tempos com perfil `ADMIN`.
7. Testar movimentação e retirada da programação com `PCP` e `ADMIN`.
8. Testar o limite mensal, incluindo mês parcialmente ocupado, excesso e exceção administrativa.
9. Executar a suíte automatizada e o build a partir do commit aprovado.
10. Mesclar a PR e aguardar o GitHub Pages concluir a publicação.
11. Fazer smoke test das quatro páginas oficiais em desktop e celular.
12. Liberar novamente as aprovações de programação.

## Reconciliação obrigatória

Comparar antes e depois:

- quantidade total de fornos;
- quantidade por status;
- planejamentos com semana;
- lotes por status;
- vínculos ativos;
- órfãos;
- fornos em múltiplos lotes ativos;
- divergências de semana;
- quantidade de apontamentos e última data sincronizada.

Qualquer redução ou divergência não explicada interrompe a publicação.

## Rollback da interface

Reverter o merge/deploy para o commit anterior do GitHub Pages. A interface antiga não depende das novas tabelas e continuará operando.

## Rollback do banco

As estruturas novas são aditivas. Em caso de falha:

1. Revogar temporariamente `EXECUTE` das RPCs novas para `authenticated` se a falha envolver movimentação ou aprovação.
2. Desabilitar somente o trigger do limite mensal se ele estiver bloqueando operações válidas, preservando os registros para análise.
3. Reverter a interface para o commit anterior.
4. Não excluir colunas, tempos, históricos ou preparações já cadastrados.
5. Corrigir a migração em nova versão e reaplicar somente após nova homologação.

Não usar `DROP TABLE`, `TRUNCATE` ou exclusão de histórico como rollback operacional. Uma restauração física do projeto é a última alternativa e requer autorização explícita.

## Critérios de aborto

- alteração inesperada em fornos ou apontamentos;
- perda ou duplicidade de lotes/vínculos;
- falha de RLS;
- RPC de aprovação acessível por papel indevido;
- sincronização AppSheet interrompida;
- alerta duplicado ou trigger bloqueando apontamentos;
- erro de autenticação generalizado.
