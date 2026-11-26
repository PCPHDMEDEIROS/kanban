# Instalação corrigida da reconciliação Apps Script

O erro `HDK_stateMap_ is not defined` significa que `supabase-reconcile.gs` foi executado sem que o conteúdo completo de `supabase-sync.gs` estivesse disponível no mesmo projeto Apps Script.

## Arquivos que devem ser substituídos integralmente

1. Copie todo o conteúdo de `apps-script/supabase-sync.gs` para o arquivo `Supabase sync.gs`.
2. Copie todo o conteúdo de `apps-script/supabase-reconcile.gs` para o arquivo `Supabase Incr.gs`.
3. Não copie os dois conteúdos para o mesmo arquivo e não mantenha versões antigas das funções `HDK_*` em `Code.gs`.

Os nomes dos arquivos no editor podem ser diferentes. O requisito é que ambos sejam arquivos `.gs` do mesmo projeto.

## Configuração para projeto independente

Se o projeto não estiver vinculado a uma planilha, execute uma vez:

```javascript
HDK_configurarPlanilhaEstado('ID_DA_PLANILHA_AUXILIAR')
```

Essa planilha receberá somente as abas ocultas `HDK_SYNC_STATE` e `HDK_SYNC_QUEUE`. Em projeto vinculado, a planilha ativa continua sendo aceita.

As propriedades existentes `HDK_SUPABASE_FUNCTION_URL` e `HDK_SUPABASE_SYNC_TOKEN` devem ser preservadas. O token não deve ser incluído no código.

## Ordem de validação

1. Execute `HDK_testarInstalacao`. O resultado deve informar `ok: true` e `nao_sincronizados: 0`.
2. Execute `HDK_instalarGatilhos` uma vez.
3. Execute `HDK_reconciliarSupabaseCompleto`.
4. Se retornar `concluida: false`, não reinicie o processo. O gatilho `HDK_retomarReconciliacaoPendente` continuará a partir de `proximaLinha`.
5. Consulte `HDK_statusIntegracao` para acompanhar o cursor, a fila e a comparação final.

A reconciliação somente retorna `concluida: true` depois de comparar todos os IDs da coluna `ID` da origem com `hd_kanban.apontamentos.id_origem`. Registros existentes apenas no Supabase são relatados, mas não excluídos.

## Testes seletivos

- Incremental: execute `HDK_sincronizacaoIncremental` e verifique `ok`, `erros` e `proxima_linha`.
- Fila: execute `HDK_reprocessarPendencias`; uma fila vazia retorna zero sem modificar apontamentos.
- Instalação e IDs: execute `HDK_testarInstalacao`.
- Reconciliação: execute `HDK_reconciliarSupabaseCompleto` e acompanhe pelo status.

Nenhuma dessas rotinas exclui apontamentos históricos do AppSheet ou registros existentes do Supabase.


