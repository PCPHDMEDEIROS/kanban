create index if not exists snapshots_programacao_pcp_criado_por_idx
  on hd_kanban.snapshots_programacao_pcp(criado_por);
create index if not exists snapshots_programacao_pcp_restaurado_por_idx
  on hd_kanban.snapshots_programacao_pcp(restaurado_por)
  where restaurado_por is not null;
