# Programação simplificada

## Fluxo

`Período de entrega → consultar → agrupar → sugerir → revisar → aprovar → Kanban PCP`

O modo básico não depende de tempos padrão ou capacidade por operação.

## Elegibilidade

- Fornos finalizados ou cancelados são excluídos.
- Cada forno é identificado por `forno_id` e aparece uma vez.
- Fornos já programados são preservados e não entram automaticamente em nova sugestão.
- Sem apontamento produtivo significa `A PRODUZIR`; com apontamento significa `EM FABRICAÇÃO`.

## Priorização

1. Atrasados incluídos na consulta.
2. Data de entrega crescente.
3. Prioridade manual.
4. Número de série.

O agrupamento só ocorre quando modelo, tensão e controlador estão presentes e são idênticos. Configuração incompleta gera programação individual.

## Limite mensal

A meta inicial é 100 fornos programados por mês. Programações existentes consomem o limite. O excedente permanece visível como `Sem encaixe no limite mensal` e não é transferido silenciosamente.

A distribuição semanal é proporcional aos dias produtivos. Na ausência de calendário cadastrado, usa segunda a sexta-feira e informa essa premissa.

Uma migração separada, ainda não aplicada, adiciona proteção no banco: usuários `PCP` não podem ultrapassar o limite; `ADMIN` pode autorizar exceção e alterar a configuração `meta_mensal_pcp`.

## Aprovação

A prévia não grava dados. A aprovação reutiliza `aprovar_simulacao_pcp`, valida versões, elegibilidade, identidade persistente e unicidade. Aprovação parcial continua disponível.

Toda sugestão é identificada como programação preliminar por quantidade e prazo; ela não garante capacidade técnica por operação.
