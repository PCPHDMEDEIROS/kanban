-- Fase 5 preparada para homologação. Não altera fornos nem apontamentos existentes.
alter table hd_kanban.capacidade_operacao
  add column if not exists centro_trabalho text,
  add column if not exists quantidade_operadores integer check (quantidade_operadores is null or quantidade_operadores > 0),
  add column if not exists jornada text,
  add column if not exists dias_produtivos smallint[] check (dias_produtivos is null or dias_produtivos <@ array[1,2,3,4,5,6,7]::smallint[]),
  add column if not exists recursos_compartilhados text[],
  add column if not exists excecoes jsonb not null default '[]'::jsonb,
  add column if not exists setup_horas numeric(10,2) check (setup_horas is null or setup_horas >= 0);

create table if not exists hd_kanban.tempo_modelo_operacao (
  id uuid primary key default gen_random_uuid(),
  modelo text not null,
  operacao_id uuid not null references hd_kanban.operacoes(id),
  horas_padrao numeric(10,2) not null check (horas_padrao > 0),
  origem text not null default 'CADASTRADO' check (origem in ('CADASTRADO','HISTORICO_VALIDADO')),
  tamanho_amostra integer check (tamanho_amostra is null or tamanho_amostra > 0),
  vigencia_inicio date not null default current_date,
  vigencia_fim date,
  observacao text,
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(modelo,operacao_id,vigencia_inicio),
  check(vigencia_fim is null or vigencia_fim >= vigencia_inicio),
  check(origem <> 'HISTORICO_VALIDADO' or tamanho_amostra is not null)
);

create table if not exists hd_kanban.historico_preparacao_eletrica (
  id uuid primary key default gen_random_uuid(),
  preparacao_id uuid not null references hd_kanban.preparacao_eletrica(id),
  forno_id uuid not null references hd_kanban.fornos(id),
  status_anterior text,
  status_novo text not null,
  observacao text,
  alterado_por uuid not null references auth.users(id),
  alterado_em timestamptz not null default now()
);

alter table hd_kanban.tempo_modelo_operacao enable row level security;
alter table hd_kanban.historico_preparacao_eletrica enable row level security;
grant select on hd_kanban.tempo_modelo_operacao,hd_kanban.historico_preparacao_eletrica to authenticated;
grant insert,update on hd_kanban.tempo_modelo_operacao to authenticated;
grant insert on hd_kanban.historico_preparacao_eletrica to authenticated;

create policy leitura_tempo_modelo on hd_kanban.tempo_modelo_operacao for select to authenticated using(true);
create policy grava_tempo_modelo on hd_kanban.tempo_modelo_operacao for insert to authenticated
with check(coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA')='ADMIN' and updated_by=(select auth.uid()));
create policy atualiza_tempo_modelo on hd_kanban.tempo_modelo_operacao for update to authenticated
using(coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA')='ADMIN')
with check(coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA')='ADMIN' and updated_by=(select auth.uid()));
create policy leitura_historico_eletrica on hd_kanban.historico_preparacao_eletrica for select to authenticated using(true);
create policy grava_historico_eletrica on hd_kanban.historico_preparacao_eletrica for insert to authenticated
with check(
  coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA') in ('ADMIN','PCP','ELETRICA')
  and alterado_por=(select auth.uid())
);

create or replace function hd_kanban.auditar_preparacao_eletrica()
returns trigger language plpgsql security invoker set search_path=hd_kanban,pg_temp as $$
begin
  if tg_op='INSERT' or old.status is distinct from new.status or old.observacao is distinct from new.observacao then
    insert into hd_kanban.historico_preparacao_eletrica(preparacao_id,forno_id,status_anterior,status_novo,observacao,alterado_por)
    values(new.id,new.forno_id,case when tg_op='UPDATE' then old.status end,new.status,new.observacao,coalesce(new.updated_by,(select auth.uid())));
  end if;
  return new;
end $$;

drop trigger if exists preparacao_eletrica_auditoria on hd_kanban.preparacao_eletrica;
create trigger preparacao_eletrica_auditoria after insert or update on hd_kanban.preparacao_eletrica
for each row execute function hd_kanban.auditar_preparacao_eletrica();

create index if not exists tempo_modelo_operacao_lookup_idx on hd_kanban.tempo_modelo_operacao(modelo,operacao_id,vigencia_inicio desc);
create index if not exists historico_preparacao_eletrica_forno_idx on hd_kanban.historico_preparacao_eletrica(forno_id,alterado_em desc);

