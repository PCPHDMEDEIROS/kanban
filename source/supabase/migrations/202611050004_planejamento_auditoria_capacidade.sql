-- Estruturas próprias do PCP. Não altera fornos ou apontamentos operacionais.
create table if not exists hd_kanban.historico_planejamento (
  id uuid primary key default gen_random_uuid(),
  planejamento_id uuid,
  n_serie text not null,
  semana_anterior date,
  semana_nova date,
  prioridade_anterior integer,
  prioridade_nova integer,
  justificativa text,
  alterado_por uuid references auth.users(id),
  alterado_em timestamptz not null default now()
);

create index if not exists historico_planejamento_serie_data_idx
  on hd_kanban.historico_planejamento(n_serie,alterado_em desc);

alter table hd_kanban.historico_planejamento enable row level security;
grant select,insert on hd_kanban.historico_planejamento to authenticated;

drop policy if exists leitura_historico_planejamento on hd_kanban.historico_planejamento;
create policy leitura_historico_planejamento on hd_kanban.historico_planejamento
for select to authenticated using(true);

drop policy if exists grava_historico_planejamento on hd_kanban.historico_planejamento;
create policy grava_historico_planejamento on hd_kanban.historico_planejamento
for insert to authenticated with check(
  coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA') in ('ADMIN','PCP')
  and alterado_por=(select auth.uid())
);

create or replace function hd_kanban.auditar_planejamento()
returns trigger language plpgsql security invoker set search_path=hd_kanban,pg_temp as $$
begin
  if tg_op='INSERT' or old.planejado_para is distinct from new.planejado_para or old.prioridade is distinct from new.prioridade then
    insert into hd_kanban.historico_planejamento(
      planejamento_id,n_serie,semana_anterior,semana_nova,
      prioridade_anterior,prioridade_nova,justificativa,alterado_por
    ) values (
      new.id,new.n_serie,case when tg_op='UPDATE' then old.planejado_para end,new.planejado_para,
      case when tg_op='UPDATE' then old.prioridade end,new.prioridade,
      nullif(trim(new.observacao_pcp),''),coalesce(new.updated_by,(select auth.uid()))
    );
  end if;
  return new;
end $$;

drop trigger if exists planejamento_auditoria on hd_kanban.planejamento_kanban;
create trigger planejamento_auditoria after insert or update on hd_kanban.planejamento_kanban
for each row execute function hd_kanban.auditar_planejamento();

create table if not exists hd_kanban.capacidade_operacao (
  id uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references hd_kanban.operacoes(id),
  vigencia_inicio date not null,
  vigencia_fim date,
  horas_semanais numeric(10,2) check(horas_semanais is null or horas_semanais>=0),
  eficiencia numeric(5,2) check(eficiencia is null or eficiencia between 0 and 1),
  observacao text,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(operacao_id,vigencia_inicio)
);

alter table hd_kanban.capacidade_operacao enable row level security;
grant select,insert,update on hd_kanban.capacidade_operacao to authenticated;
create policy leitura_capacidade on hd_kanban.capacidade_operacao for select to authenticated using(true);
create policy grava_capacidade on hd_kanban.capacidade_operacao for insert to authenticated with check(
  coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA')='ADMIN'
  and updated_by=(select auth.uid())
);
create policy atualiza_capacidade on hd_kanban.capacidade_operacao for update to authenticated
using(coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA')='ADMIN')
with check(coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA')='ADMIN' and updated_by=(select auth.uid()));

