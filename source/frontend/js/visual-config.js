export const COLOR_LEGEND = [
  {
    title: 'Situação do forno',
    items: [
      {className: 'late', label: 'Vermelho', description: 'Prazo de entrega atrasado.'},
      {className: 'critical', label: 'Laranja', description: 'Prazo crítico, entrega em até 7 dias.'},
      {className: 'open', label: 'Verde (contorno)', description: 'Apontamento produtivo em aberto.'},
      {className: 'neutral', label: 'Cinza', description: 'Cartão sem destaque de prazo.'},
      {className: 'blocked', label: 'Fundo rosa', description: 'Forno bloqueado.'}
    ]
  },
  {
    title: 'Status da caixa',
    items: [
      {className: 'box-bought', label: 'Verde', description: 'COMPRADA ou COMPRADO.'},
      {className: 'box-buy', label: 'Vermelho', description: 'COMPRAR.'},
      {className: 'box-stock', label: 'Azul', description: 'ESTOQUE.'}
    ]
  }
]

