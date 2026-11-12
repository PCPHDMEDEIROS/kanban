# Registro de implantação — capacidade e elétrica

## Migração

- Projeto: `qzvsmsdssknghxjyajic`.
- Migração: `capacidade_eletrica_complementos`.
- Versão registrada pelo Supabase: `20261112112758`.
- Resultado: aplicada com sucesso em 12/11/2026.
- Publicação do frontend: não realizada nesta etapa.

## Reconciliação

| Item | Antes | Depois |
|---|---:|---:|
| Fornos | 295 | 295 |
| Apontamentos | 4.989 | 4.989 |
| Planejamentos com semana | 83 | 83 |
| Lotes ativos | 42 | 42 |
| Vínculos ativos | 83 | 83 |
| Fornos em múltiplos lotes ativos | 0 | 0 |
| Divergências de semana | 0 | 0 |

Nenhum cadastro produtivo foi inserido artificialmente. Capacidades, tempos por modelo, preparações e alertas permanecem zerados até uso real.

## Estruturas validadas

- Campos complementares de `capacidade_operacao`.
- Tabela `tempo_modelo_operacao` com RLS.
- Tabela `historico_preparacao_eletrica` com RLS.
- Trigger de auditoria da preparação elétrica.
- Trigger de alerta ao programar forno.
- Trigger de alerta ao incluir forno em lote planejado.
- Trigger de alerta ao chegar à Montagem Geral.
- `EXECUTE` revogado de `anon`, `authenticated` e `PUBLIC` nas quatro funções de trigger.

## Advisors após implantação

- Saúde: sem alertas.
- Segurança: nenhuma nova falha causada pela migração.
- Segurança preexistente: proteção contra senhas vazadas desativada.
- Informativo intencional: `integracao_segredos` possui RLS sem políticas para bloquear acesso pela Data API.
- Desempenho: quatro chaves estrangeiras das novas tabelas ainda não possuem índice dedicado. As tabelas estão vazias; a correção deve ser preparada em migração separada e aplicada somente com autorização.

## Estado para próxima etapa

O banco está pronto para homologação funcional por perfil. O frontend da PR #9 ainda não foi publicado, portanto os novos cadastros não estão acessíveis aos usuários pela aplicação pública.

