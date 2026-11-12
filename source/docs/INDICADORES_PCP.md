# Indicadores do PCP

Esta página descreve os critérios usados em `pcp-indicadores.html`. Os cálculos são feitos no navegador a partir dos registros autorizados pelo Supabase e respeitam os filtros exibidos na tela.

## Filtros

- Período: considera a data real de conclusão quando disponível e, nos demais casos, a data de entrega.
- Modelo, cliente, operação, status, semana planejada, lote e mês-alvo: restringem o mesmo conjunto-base usado pelos painéis.
- Meta mensal: valor informado pelo usuário para calcular atingimento, ritmo necessário e projeção.

Registros sem a informação escolhida no filtro continuam visíveis somente quando o filtro não exige esse campo.

## Resumo executivo

- Fornos: quantidade de números de série distintos, evitando contagem duplicada por operação ou apontamento.
- Concluídos: fornos com data real de conclusão no período filtrado.
- Atingimento: concluídos dividido pela meta mensal.
- Faltante: diferença positiva entre a meta e os concluídos.
- Média diária: concluídos divididos pelos dias produtivos decorridos.
- Ritmo necessário: faltante dividido pelos dias produtivos restantes.
- Projeção: concluídos mais a média diária multiplicada pelos dias produtivos restantes.
- Atrasados: fornos ainda não concluídos cuja data de entrega já passou.
- Próximos do prazo: fornos ainda não concluídos com entrega em até sete dias.
- Planejados e não planejados: presença ou ausência de vínculo ativo no planejamento.

Dias produtivos são dias de segunda a sexta-feira. Feriados não são descontados enquanto não houver um calendário industrial cadastrado.

## Demanda e Pareto

A demanda é agrupada por modelo usando números de série distintos. O Pareto classifica os modelos do maior para o menor volume e apresenta o percentual acumulado. A classificação ABC segue o acumulado: A até 80%, B até 95% e C acima de 95%.

## Filas por operação

- Aguardando: forno disponível para a operação sem apontamento produtivo aberto nela.
- Em execução: existe apontamento aberto na operação.
- Bloqueado: o forno está sinalizado como bloqueado.
- Espera média e máxima: tempo entre a disponibilidade para a operação e o início real, somente quando ambas as datas existem.

Uma fila elevada é apresentada como **acúmulo observado**. Ela não é classificada automaticamente como gargalo comprovado sem capacidade operacional cadastrada e comparável.

## Tempos por operação

- Execução: intervalo entre início e fim reais do apontamento concluído.
- Espera: intervalo anterior ao início real, quando a data de disponibilidade é conhecida.

Apontamentos ainda abertos não são convertidos em duração zero. Registros incompletos são excluídos da média correspondente e permanecem identificáveis na contagem de dados válidos.

## Planejado versus realizado

- Semana original: primeiro compromisso registrado para o forno.
- Semana atual: compromisso vigente após reprogramações.
- Realizado: semana da conclusão real.

O indicador preserva as três referências para não apagar o plano original quando houver reprogramação.

## Radar de entrega

Classifica fornos não concluídos em atrasados, até 7 dias, de 8 a 14 dias e acima de 14 dias. Fornos sem data de entrega são apresentados separadamente, sem inferência artificial de prazo.

## Segurança e atualização

A página usa a sessão autenticada e as políticas existentes do Supabase. Não contém chave privilegiada, não altera regras de negócio e não grava dados. A atualização usa Realtime quando disponível e uma recarga periódica de segurança.

