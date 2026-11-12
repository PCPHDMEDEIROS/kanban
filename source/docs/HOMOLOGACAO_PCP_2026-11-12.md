# Relatório de homologação do PCP — 12/11/2026

## Escopo

Validação da branch `dev/pcp-conclusao-fase1-2` e da PR #9. Nenhuma migração pendente foi aplicada e nenhum arquivo foi publicado no GitHub Pages durante esta etapa.

## Fotografia do Supabase produtivo

Consulta somente leitura realizada no projeto `qzvsmsdssknghxjyajic`:

| Item | Total |
|---|---:|
| Fornos cadastrados | 297 |
| Apontamentos ativos | 4.989 |
| Planejamentos com semana | 87 |
| Lotes ativos | 45 |
| Vínculos ativos | 87 |
| Capacidades cadastradas | 0 |
| Preparações elétricas | 0 |
| Alertas PCP | 0 |

## Integridade

| Verificação | Resultado |
|---|---:|
| Planejamentos referenciando forno inexistente | 0 |
| Vínculos ativos órfãos | 0 |
| Fornos em mais de um lote ativo | 0 |
| Divergências entre semana do lote e do forno | 0 |

Os dados cresceram desde a fotografia anterior (42 lotes e 83 vínculos) e permanecem preservados. A fotografia atual não contém planejamentos duplicados, fornos em mais de um lote ativo ou vínculos órfãos.

## Segurança

- RLS está habilitado nas tabelas do esquema `hd_kanban`.
- A RPC `aprovar_simulacao_pcp` é `SECURITY INVOKER`.
- A RPC só possui `EXECUTE` para `authenticated`; `anon` e `PUBLIC` não possuem acesso.
- A RPC `reprogramar_pcp` ainda não existe no produtivo. A migração está versionada, mas depende de autorização explícita antes da homologação funcional de movimentação.
- Todas as funções `SECURITY DEFINER` existentes estão restritas ao proprietário `postgres`; não são executáveis por `anon`, `authenticated` ou `PUBLIC`.
- As políticas administrativas usam `app_metadata.hd_role`, não `user_metadata`.
- A tabela `integracao_segredos` possui RLS e nenhuma política. O advisor registra isso como informativo; neste caso o comportamento é intencionalmente bloqueado para clientes da Data API. [Referência do advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- A migração da Fase 5 revoga explicitamente `EXECUTE` das novas funções de trigger para que não sejam expostas como RPCs.

### Pendência externa ao código

O advisor do Supabase informa que a proteção contra senhas vazadas está desativada. A ativação deve ser feita no painel de autenticação e validada com os responsáveis antes da publicação. [Configuração recomendada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Desempenho e saúde

- Advisor de saúde: sem alertas.
- Advisor de desempenho: quatro chaves estrangeiras sem índice de cobertura e 17 índices ainda sem uso registrado. São avisos informativos e não bloqueiam a homologação; os índices não devem ser removidos antes de observar carga real. [Referência sobre chaves sem índice](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) e [índices sem uso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
- Carregamentos de carteira e tabelas auxiliares usam paginação para não depender do limite padrão da API.

## Testes automatizados

- Total: 56.
- Aprovados: 56.
- Falhas: 0.
- Cancelados ou ignorados: 0.

Cobertura funcional inclui classificação, paginação, lotes, movimentação, concorrência, programação retroativa, aprovação parcial, indicadores, capacidade e preparação elétrica.

## Build

Build Vite concluído com sucesso para:

- Kanban Operacional;
- PCP;
- Kanban PCP;
- Programação;
- Indicadores;
- Capacidade e Elétrica.

## Migrações aplicadas e pendentes

- `capacidade_eletrica_complementos`: aplicada anteriormente e confirmada no histórico remoto como `20261112112758`.
- `reprogramacao_transacional_pcp`: pendente; necessária para mover e retirar itens no Kanban PCP.
- `limite_mensal_programacao`: pendente; necessária para proteção do limite mensal também no banco.

Nenhuma migração foi aplicada nesta etapa de homologação.

## Pendências antes da publicação

- Obter autorização explícita para as migrações `reprogramacao_transacional_pcp` e `limite_mensal_programacao`.
- Repetir a fotografia imediatamente antes e depois da migração.
- Testar os perfis `ADMIN`, `PCP`, `ELETRICA` e `CONSULTA` com usuários de homologação.
- Validar gravação de capacidade, tempo padrão, preparação elétrica e respectivos históricos.
- Validar os três gatilhos de alertas e confirmar que repetições não duplicam eventos.
- Confirmar sincronização Google Sheets/AppSheet após a migração.
- Ativar e validar proteção contra senhas vazadas, se aprovada.
- Obter aceite funcional do PCP e da Elétrica.

## Conclusão

O código passou na validação automatizada e a base atual não apresenta duplicidades ou vínculos órfãos. A publicação ainda não está autorizada porque as RPCs/regras pendentes e os testes funcionais por perfil dependem de uma janela controlada.
