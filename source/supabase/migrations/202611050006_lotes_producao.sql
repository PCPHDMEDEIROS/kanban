create table if not exists hd_kanban.lotes_producao(
 id uuid primary key default gen_random_uuid(),codigo text not null unique,modelo text not null,
 semana_planejada date,status text not null default 'RASCUNHO' check(status in('RASCUNHO','PLANEJADO','CONCLUIDO','CANCELADO')),
 justificativa text,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists hd_kanban.lote_fornos(
 lote_id uuid not null references hd_kanban.lotes_producao(id) on delete cascade,
 forno_id uuid not null references hd_kanban.fornos(id),adicionado_por uuid not null references auth.users(id),adicionado_em timestamptz not null default now(),primary key(lote_id,forno_id)
);
alter table hd_kanban.lotes_producao enable row level security;alter table hd_kanban.lote_fornos enable row level security;
grant select,insert,update on hd_kanban.lotes_producao to authenticated;grant select,insert,delete on hd_kanban.lote_fornos to authenticated;
create policy leitura_lotes on hd_kanban.lotes_producao for select to authenticated using(true);
create policy grava_lotes on hd_kanban.lotes_producao for insert to authenticated with check(coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA') in('ADMIN','PCP') and created_by=(select auth.uid()));
create policy atualiza_lotes on hd_kanban.lotes_producao for update to authenticated using(coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA') in('ADMIN','PCP')) with check(coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA') in('ADMIN','PCP'));
create policy leitura_lote_fornos on hd_kanban.lote_fornos for select to authenticated using(true);
create policy grava_lote_fornos on hd_kanban.lote_fornos for insert to authenticated with check(coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA') in('ADMIN','PCP') and adicionado_por=(select auth.uid()));
create policy remove_lote_fornos on hd_kanban.lote_fornos for delete to authenticated using(coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA') in('ADMIN','PCP'));
create index if not exists lotes_created_by_idx on hd_kanban.lotes_producao(created_by);create index if not exists lote_fornos_forno_idx on hd_kanban.lote_fornos(forno_id);create index if not exists lote_fornos_usuario_idx on hd_kanban.lote_fornos(adicionado_por);

