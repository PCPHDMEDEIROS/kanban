# Integração 2.0 — conclusão e operação

## Arquitetura implantada

- Apps Script: varredura incremental a cada 5 minutos, estado persistente por hash, fila local e reconciliação completa diária.
- Edge Function `sync-hd-medeiros`: autenticação por token dedicado, validação, idempotência, normalização temporal e uma RPC SQL por lote.
- PostgreSQL: UPSERT condicional, auditoria dos valores temporais legados, fila seletiva, histórico de troca de série e diagnóstico administrativo protegido por RLS.
- Frontend: usa campos tipados para datas/horas e consulta a saúde somente quando um administrador abre o painel.

## Instalação manual no Google Apps Script

1. Substitua o conteúdo do arquivo de integração pelo arquivo completo `apps-script/supabase-sync.gs`.
2. Adicione ou substitua `apps-script/supabase-reconcile.gs`.
3. Confirme as propriedades `HDK_SUPABASE_FUNCTION_URL` e `HDK_SUPABASE_SYNC_TOKEN`; nunca coloque o token no GitHub.
4. Execute uma vez `HDK_instalarGatilhos` e autorize o projeto.
5. Execute `HDK_reconciliarSupabaseCompleto` uma vez e confira `HDK_statusIntegracao`.

Os gatilhos instalados são: sincronização incremental a cada 5 minutos, reprocessamento a cada 5 minutos e reconciliação diária às 2h no fuso do projeto.

## Validação e integridade

- O cursor incremental só avança quando todos os lotes do ciclo terminam sem erro.
- A reconciliação envia toda a fonte; o banco ignora linhas cujo hash de negócio não mudou.
- Datas técnicas e número da linha não participam do hash.
- Registros órfãos e fornos sem evidência produtiva são diagnosticados, nunca excluídos nem reclassificados automaticamente.
- A tabela `auditoria_horarios` preserva os timestamps anteriores ao contrato tipado.

## Rollback

1. Reimplante a versão anterior da Edge Function pelo histórico do Supabase.
2. Reverta o commit de publicação do GitHub Pages.
3. No Apps Script, restaure as versões anteriores dos dois arquivos e execute novamente o instalador de gatilhos.
4. Não remova as colunas nem as tabelas de auditoria: elas são aditivas, não interferem no contrato anterior e preservam evidências.

## Pendências operacionais

- Os casos com horário `AMBIGUO` devem ser verificados na fonte; o sistema não presume automaticamente virada de dia.
- Os órfãos continuam preservados até que haja evidência de cadastro ou transferência.
- A proteção de senhas vazadas é uma configuração opcional do Auth e pode exigir plano pago; não foi habilitada para manter a operação gratuita.


