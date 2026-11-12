create index if not exists lotes_producao_aprovado_por_idx
  on hd_kanban.lotes_producao(aprovado_por);

create index if not exists planejamento_simulacao_id_idx
  on hd_kanban.planejamento_kanban(simulacao_id);

