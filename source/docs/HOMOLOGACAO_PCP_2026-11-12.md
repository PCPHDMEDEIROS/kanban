# Relatório de homologação do PCP — 12/11/2026

## Escopo

Validação da branch `dev/pcp-conclusao-fase1-2` e da PR #9. Nenhuma migração pendente foi aplicada e nenhum arquivo foi publicado no GitHub Pages durante esta etapa.

## Fotografia do Supabase produtivo

Consulta somente leitura realizada no projeto `qzvsmsdssknghxjyajic`:

| Item | Total |
|---|---:|
| Fornos | 295 |
| Em fabricação | 146 |
| Finalizados | 149 |
| Planejamentos com semana | 83 |
| Lotes ativos | 42 |
| Vínculos ativos | 83 |
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

Os 42 lotes e 83 vínculos existentes permanecem preservados.

## Segurança

- RLS está habilitado nas tabelas do esquema `hd_kanban`.
- A RPC `aprovar_simulacao_pcp` é `SECURITY INVOKER`.
- A RPC só possui `EXECUTE` para `authenticated`; `anon` e `PUBLIC` não possuem acesso.
- Todas as funções `SECURITY DEFINER` existentes estão restritas ao proprietário `postgres`; não são executáveis por `anon`, `authenticated` ou `PUBLIC`.
- As políticas administrativas usam `app_metadata.hd_role`, não `user_metadata`.
- A tabela `integracao_segredos` possui RLS e nenhuma política. O advisor registra isso como informativo; neste caso o comportamento é intencionalmente bloqueado para clientes da Data API.
- A migração da Fase 5 revoga explicitamente `EXECUTE` das novas funções de trigger para que não sejam expostas como RPCs.

### Pendência externa ao código

O advisor do Supabase informa que a proteção contra senhas vazadas está desativada. A ativação deve ser feita no painel de autenticação e validada com os responsáveis antes da publicação.

## Desempenho e saúde

- Advisor de saúde: sem alertas.
- Advisor de desempenho: 15 índices ainda sem uso registrado. Como o módulo é novo e as tabelas possuem pouco ou nenhum dado, eles não devem ser removidos antes de observar carga real.
- Carregamentos de carteira e tabelas auxiliares usam paginação para não depender do limite padrão da API.

## Testes automatizados

- Total: 45.
- Aprovados: 45.
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

## Pendências antes da publicação

- Aplicar a migração de capacidade/elétrica em janela de homologação autorizada.
- Repetir a fotografia imediatamente antes e depois da migração.
- Testar os perfis `ADMIN`, `PCP`, `ELETRICA` e `CONSULTA` com usuários de homologação.
- Validar gravação de capacidade, tempo padrão, preparação elétrica e respectivos históricos.
- Validar os três gatilhos de alertas e confirmar que repetições não duplicam eventos.
- Confirmar sincronização Google Sheets/AppSheet após a migração.
- Ativar e validar proteção contra senhas vazadas, se aprovada.
- Obter aceite funcional do PCP e da Elétrica.

## Conclusão

O código e a base atual estão consistentes para avançar à homologação funcional. A publicação ainda não está autorizada porque a migração da Fase 5 e os testes por perfil dependem de uma janela controlada.

