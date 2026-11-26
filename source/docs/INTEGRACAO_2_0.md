# HD Medeiros — Integração 2.0

## Estado desta entrega

Implementação concluída e homologada localmente em PostgreSQL PGlite. Nenhuma migration, Edge Function, Apps Script ou página desta versão foi aplicada em produção. A implantação produtiva depende de backup validado e autorização específica.

## Diagnóstico inicial

Levantamento de 26/11/2026 no projeto `qzvsmsdssknghxjyajic`:

- 322 fornos, 4.991 apontamentos únicos, 87 programações e 45 lotes.
- 86.299 linhas em `sync_log`.
- Em sete dias, o fluxo antigo registrou 3.187.400 apontamentos lidos e 321.838 fornos lidos, embora a base tivesse apenas 4.991 apontamentos e 322 fornos.
- 1.915 erros foram registrados como `[object Object]`, eliminando o diagnóstico original.
- O Apps Script reenviava as 500 últimas linhas a cada cinco minutos e fazia reconciliação completa após qualquer falha.
- `source_updated_at` era criado antes do hash; portanto o hash mudava em toda execução.
- A ação batch da Edge Function executava uma leitura e um UPSERT HTTP por item via `Promise.all`.
- O erro `permission denied for table alertas_pcp` era causado pelos triggers `SECURITY INVOKER`: a Edge usa `service_role`, mas `alertas_pcp` não possuía grant para esse papel. RLS não era a causa.
- O frontend já evitava canais Realtime duplicados, mas recarregava toda a view após qualquer evento e ainda fazia polling completo a cada 60 segundos.

## Arquitetura implementada

1. O Apps Script calcula SHA-256 canônico apenas com campos de negócio.
2. A aba oculta `HDK_SYNC_STATE` mantém `entidade + chave + hash` por registro.
3. A varredura de apontamentos percorre blocos circulares de 500 linhas. Uma edição antiga feita pelo AppSheet é detectada quando o cursor alcançar sua linha.
4. Somente hashes novos ou alterados são enviados, em lotes de até 250 itens.
5. Cada lote possui chave de idempotência determinística.
6. A Edge Function valida o lote e faz uma única chamada RPC ao PostgreSQL.
7. A RPC executa INSERT/UPDATE set-based e só atualiza quando `row_hash` mudou.
8. Mudança de série atualiza o mesmo `id_origem`, preservando o UUID do apontamento, e grava o histórico antes da atualização.
9. Falhas são persistidas em `integracao_pendencias` e reprocessadas seletivamente com backoff.
10. O frontend faz atualização Realtime pelas séries afetadas e mantém uma reconciliação completa apenas a cada cinco minutos.
11. A tela “Saúde da Integração” é exclusiva de ADMIN e consulta dados somente quando aberta.

## Arquivos

Substituir no Apps Script:

- `apps-script/supabase-sync.gs`
- `apps-script/supabase-reconcile.gs`

Não substituir `Code.gs`. Os acionadores existentes de edição, conclusão ACAB. e atualização MONT.GERAL permanecem intactos.

Backend e banco:

- `supabase/functions/sync-hd-medeiros/index.ts`
- `supabase/migrations/20261126170000_integracao_2_0.sql`

Frontend:

- `frontend/index.html`
- `frontend/js/app.js`
- `frontend/js/data.js`

Testes:

- `tests/integration-2.test.js`
- `tests/homologacao_integracao_2.sql` — teste transacional com rollback para a branch.
- `tests/run-integration-2-pglite.mjs` — PostgreSQL local gratuito usado na homologação.

## Backup obrigatório

Antes da produção:

1. Confirmar no Dashboard que o backup diário mais recente está íntegro e anterior à implantação.
2. Exportar contagens e identificadores:

```sql
select count(*) total,count(distinct id_origem) ids from hd_kanban.apontamentos;
select count(*) total,count(distinct n_serie) series from hd_kanban.fornos;
select count(*) from hd_kanban.planejamento_kanban;
select count(*) from hd_kanban.lotes_producao;
select count(*) from hd_kanban.lote_fornos where ativo;
select count(*) from hd_kanban.historico_troca_serie;
```

3. Exportar `apontamentos`, `fornos`, `planejamento_kanban`, `lotes_producao`, `lote_fornos` e `historico_troca_serie` para arquivos versionados e protegidos.
4. Registrar a versão ativa da Edge Function e o commit publicado do GitHub Pages.
5. Fazer cópia dos arquivos atuais do Apps Script antes de substituí-los.

## Homologação obrigatória

Executar em uma branch Supabase ou projeto de homologação com cópia anonimizada:

- carga inicial completa;
- segunda execução sem alterações, esperando 100% ignorados e zero updates;
- inclusão de apontamento;
- alteração de apontamento antigo fora das últimas 500 linhas;
- transferência de série A → B e depois B → A, confirmando o mesmo UUID e dois eventos históricos;
- lote com um item inválido e itens válidos;
- repetição da mesma chave de idempotência;
- concorrência com a mesma chave;
- indisponibilidade simulada e reprocessamento seletivo;
- MONT.GERAL atualizando caixa;
- ACAB. concluído atualizando o forno para FINALIZADO;
- leitura dos Kanbans, indicadores, relatórios, lotes e programações existentes.

Critérios: zero perda, zero duplicidade por `id_origem`, contagens PCP inalteradas e segunda passagem sem writes de negócio.

### Resultado local

- Migration real aplicada em PostgreSQL local: aprovada.
- Segunda execução com o mesmo hash: ignorada, sem UPDATE.
- Transferência A → B: UUID original preservado e histórico gravado.
- MONT.GERAL: caixa atualizada para COMPRADA.
- ACAB. com início e fim: forno atualizado para FINALIZADO.
- Roteiro executado dentro de transação com rollback: aprovado.
- Contratos RPC, saúde administrativa e grant mínimo de `alertas_pcp`: aprovados.
- Comando reproduzível: `pnpm run test:integration-db`.

## Implantação

1. Pausar somente os gatilhos `HDK_sincronizacaoIncremental` e `HDK_reprocessarPendencias`. Não remover os gatilhos HDV/ACAB.
2. Aplicar `20261126170000_integracao_2_0.sql`.
3. Executar advisors de segurança e desempenho.
4. Implantar a Edge Function com verificação JWT desativada, mantendo o token `x-hd-sync-token` atual.
5. Substituir/adicionar os dois arquivos `.gs` e executar `HDK_instalarGatilhos()` uma vez.
6. Executar `HDK_reconciliarSupabaseCompleto()` manualmente para formar o estado inicial. Ele envia cada registro no máximo uma vez; uma segunda execução deve enviar zero registros.
7. Publicar o frontend.
8. Acompanhar “Saúde da Integração” e `sync_log` por 24 horas.

## Rollback

1. Pausar os dois gatilhos HDK 2.0.
2. Restaurar a versão anterior da Edge Function.
3. Restaurar os dois arquivos Apps Script anteriores e seus gatilhos.
4. Reverter o commit do frontend.
5. Revogar `EXECUTE` da nova RPC para `service_role` se necessário.
6. Manter as novas tabelas e colunas para preservar fila, hashes e evidências; não executar `TRUNCATE` nem exclusão em massa.
7. Se houver divergência, restaurar somente os registros afetados a partir do backup, comparando por UUID e `id_origem`.

## Evidência de redução projetada

O fluxo antigo registrou 3.187.400 leituras de apontamentos em sete dias. O tamanho médio observado de uma linha JSON foi 797 bytes, equivalente a aproximadamente 2,54 GB de conteúdo bruto por semana ou 10,9 GB por mês, antes de headers, respostas e logs. Sem alterações, o novo fluxo lê localmente blocos do Sheets, mas envia zero registros e executa zero UPSERTs. Com dez alterações por dia, a expectativa é aproximadamente 70 registros enviados por semana, redução superior a 99,99% frente ao volume observado e margem confortável abaixo da meta de 3 GB/mês. O valor real deve ser confirmado após 24 horas e sete dias de homologação/produção.

## Riscos e pendências

- A branch Supabase custaria US$ 0,01344/h e não foi criada por decisão do responsável. A homologação foi realizada gratuitamente em PostgreSQL local.
- A CLI Supabase não está instalada nesta estação; a migration foi criada manualmente, mas foi compilada e executada integralmente no PostgreSQL local.
- O Apps Script precisa ser copiado manualmente caso o projeto não esteja acessível pelo navegador/plugin.
- A primeira execução 2.0 atualiza hashes legados uma única vez; por isso a linha de base e as contagens devem ser coletadas antes e depois.
- O histórico antigo possuía índice único por combinação de séries, que impedia registrar uma transferência repetida futura. A migration troca esse índice por um índice cronológico não único.

