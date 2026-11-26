# Capacidade produtiva e preparação elétrica

## Princípios

- Nenhuma capacidade, jornada, eficiência, quantidade de operadores ou tempo padrão é presumido.
- A ausência de cadastro aparece como **capacidade não validada**.
- A meta mensal é uma referência de produção e não substitui capacidade técnica.
- A implantação não modifica fornos nem apontamentos sincronizados pelo AppSheet.

## Capacidade

Cada registro possui uma operação e uma vigência. Quando houver mais de uma vigência aplicável, vale a de início mais recente.

A capacidade semanal disponível é calculada como:

`horas semanais por operador × eficiência × quantidade de operadores`

A ocupação somente pode ser calculada quando a carga estiver expressa na mesma unidade:

`ocupação = carga em horas / capacidade disponível em horas × 100`

Recursos compartilhados, jornada, dias produtivos e exceções ficam registrados para análise. A migração não insere valores iniciais.

## Tempos por modelo e operação

Os tempos têm duas origens possíveis:

- `CADASTRADO`: valor técnico informado pelo administrador.
- `HISTORICO_VALIDADO`: valor derivado do histórico, obrigatoriamente acompanhado do tamanho da amostra.

O motor continuará informando que a capacidade não foi tecnicamente validada enquanto não houver cobertura suficiente de capacidades e tempos para as operações restantes. Um cadastro parcial não autoriza afirmar que o prazo está garantido.

## Preparação elétrica

São apresentados:

- fornos programados;
- fornos que chegaram à Montagem Geral;
- fornos que já possuem acompanhamento elétrico.

Status disponíveis:

- aguardando programação;
- preparação necessária;
- materiais em separação;
- materiais prontos;
- materiais indisponíveis;
- preparação concluída.

Cada inclusão ou alteração relevante gera histórico com usuário e data. Os alertas usam uma chave única de evento para impedir duplicidade.

## Permissões

- Consulta: usuários autenticados.
- Capacidade e tempos: somente `ADMIN`.
- Preparação elétrica: `ADMIN`, `PCP` e `ELETRICA`.

As políticas são aplicadas no banco; a ocultação de botões no navegador é apenas uma melhoria de interface.

## Implantação

A migração `20261112080000_capacidade_eletrica_complementos.sql` deve ser aplicada somente após homologação. Antes e depois, reconciliar a quantidade de fornos, apontamentos, planejamentos, lotes e vínculos ativos. A reversão funcional consiste em retirar a nova página e manter as estruturas sem dados; remover tabelas ou colunas requer avaliação explícita para não apagar cadastros feitos após a implantação.

