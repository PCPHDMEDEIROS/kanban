# Regras do PCP — Fase 2

1. Apontamentos reais permanecem a fonte da operação atual.
2. Finalizados não entram na carteira de demanda nem em “não programados”.
3. Um forno é programado quando `planejado_para` possui data válida.
4. As semanas começam na segunda-feira e terminam no domingo.
5. A tela apresenta a semana atual e as quatro semanas seguintes.
6. Fornos sem `planejado_para` aparecem em “Fornos não programados”.
7. Não programados são ordenados por atraso, entrega mais próxima e prioridade.
8. A demanda por modelo conta séries ativas, sem duplicar registros.
9. Capacidade e horas são exibidas como “Não configurado” até existirem cadastros reais.
10. Nesta fase, o PCP é somente leitura; nenhuma ação altera apontamentos ou planejamento oficial.

