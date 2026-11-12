# Motor de programação preliminar

## Regras implementadas

- A data de entrega é convertida em data-limite interna pela antecedência de expedição informada.
- A busca começa na última semana viável e percorre semanas anteriores dentro do horizonte.
- Programações aprovadas fora do filtro entram na ocupação existente.
- No modo **Programar novos fornos**, compromissos anteriores são preservados.
- No modo **Reprogramar carteira**, somente os itens selecionados são retirados da ocupação antes da simulação.
- A carga projetada é `ocupação existente + novas sugestões`.
- A meta de 100 fornos/mês é referência quantitativa, não capacidade técnica.
- Semanas que atravessam meses recebem parcelas proporcionais aos dias produtivos de cada mês.
- Feriados e exceções podem ser fornecidos ao motor sem alterar o algoritmo.
- Lotes mantêm compatibilidade por modelo, tensão e controlador.
- Códigos usam semana e identidade persistente do primeiro forno e são comparados com todos os códigos existentes.
- Uma colisão concorrente no banco provoca rollback, sem atualizar lote anterior.

## Motivos de não alocação

- Data de entrega ausente.
- Compromisso aprovado preservado.
- Prazo vencido antes do horizonte.
- Horizonte insuficiente para a antecedência.
- Referência semanal já comprometida.

## Limitações explícitas

`capacidade_operacao` e tempos padrão continuam vazios. Por isso:

- a capacidade técnica não é afirmada;
- os tempos das operações restantes não são estimados;
- a sugestão não garante prazo de entrega;
- o resultado permanece identificado como programação preliminar por quantidade e prazo.

