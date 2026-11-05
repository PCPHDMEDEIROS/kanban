create index if not exists historico_planejamento_alterado_por_idx
  on hd_kanban.historico_planejamento(alterado_por);
create index if not exists capacidade_operacao_updated_by_idx
  on hd_kanban.capacidade_operacao(updated_by);

