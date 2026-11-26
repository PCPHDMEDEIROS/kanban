-- Conclusão da Integração 2.0: contrato temporal confiável, auditoria e diagnóstico.
-- Preserva os timestamps legados e não exclui nem reclassifica registros automaticamente.

alter table hd_kanban.apontamentos
  add column if not exists data_produtiva date,
  add column if not exists hora_inicial_local time without time zone,
  add column if not exists hora_final_local time without time zone,
  add column if not exists horario_status text not null default 'DERIVADO_LEGADO';

alter table hd_kanban.apontamentos drop constraint if exists apontamentos_horario_status_check;
alter table hd_kanban.apontamentos add constraint apontamentos_horario_status_check
  check(horario_status in ('CONFIAVEL_ORIGEM','DERIVADO_LEGADO','AMBIGUO','INVALIDO'));

create or replace function hd_kanban.normaliza_horario_apontamento()
returns trigger language plpgsql set search_path='' as $$
declare
  v_data date;
  v_inicio time;
  v_fim time;
begin
  v_data:=coalesce(new.data_produtiva,
    case when new.data_hora is not null and extract(year from new.data_hora at time zone 'America/Sao_Paulo')>1900
      then (new.data_hora at time zone 'America/Sao_Paulo')::date end);
  v_inicio:=coalesce(new.hora_inicial_local,
    case when new.hora_inicial is not null then (new.hora_inicial at time zone 'America/Sao_Paulo')::time end);
  v_fim:=coalesce(new.hora_final_local,
    case when new.hora_final is not null then (new.hora_final at time zone 'America/Sao_Paulo')::time end);
  new.data_produtiva:=v_data;
  new.hora_inicial_local:=v_inicio;
  new.hora_final_local:=v_fim;
  if v_data is null or (v_inicio is null and v_fim is null) then
    new.horario_status:='INVALIDO';
  elsif new.horario_status='CONFIAVEL_ORIGEM'
    or (coalesce(extract(year from new.hora_inicial at time zone 'America/Sao_Paulo'),1900)>1900
      and coalesce(extract(year from new.hora_final at time zone 'America/Sao_Paulo'),1900)>1900) then
    new.horario_status:='CONFIAVEL_ORIGEM';
  elsif v_inicio is not null and v_fim is not null and v_fim<v_inicio then
    new.horario_status:='AMBIGUO';
  else
    new.horario_status:='DERIVADO_LEGADO';
  end if;
  return new;
end $$;

drop trigger if exists normaliza_horario_apontamento on hd_kanban.apontamentos;
create trigger normaliza_horario_apontamento
before insert or update of data_hora,hora_inicial,hora_final,data_produtiva,hora_inicial_local,hora_final_local,horario_status
on hd_kanban.apontamentos for each row execute function hd_kanban.normaliza_horario_apontamento();

-- Backfill apenas a representação tipada. Os campos originais permanecem imutáveis.
update hd_kanban.apontamentos set
  data_produtiva=case when data_hora is not null and extract(year from data_hora at time zone 'America/Sao_Paulo')>1900
    then (data_hora at time zone 'America/Sao_Paulo')::date end,
  hora_inicial_local=case when hora_inicial is not null then (hora_inicial at time zone 'America/Sao_Paulo')::time end,
  hora_final_local=case when hora_final is not null then (hora_final at time zone 'America/Sao_Paulo')::time end,
  horario_status='DERIVADO_LEGADO'
where data_produtiva is null or hora_inicial_local is null or hora_final_local is null;

create table if not exists hd_kanban.auditoria_horarios(
  apontamento_id uuid primary key references hd_kanban.apontamentos(id) on delete restrict,
  id_origem text not null,
  data_hora_original timestamptz,
  hora_inicial_original timestamptz,
  hora_final_original timestamptz,
  data_produtiva date,
  hora_inicial_local time,
  hora_final_local time,
  horario_status text not null,
  auditado_em timestamptz not null default now()
);
alter table hd_kanban.auditoria_horarios enable row level security;
revoke all on hd_kanban.auditoria_horarios from public,anon,authenticated;
grant all on hd_kanban.auditoria_horarios to service_role;
grant select on hd_kanban.auditoria_horarios to authenticated;
create policy admin_le_auditoria_horarios on hd_kanban.auditoria_horarios for select to authenticated
  using(coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA')='ADMIN');

insert into hd_kanban.auditoria_horarios(
  apontamento_id,id_origem,data_hora_original,hora_inicial_original,hora_final_original,
  data_produtiva,hora_inicial_local,hora_final_local,horario_status
)
select id,id_origem,data_hora,hora_inicial,hora_final,data_produtiva,hora_inicial_local,hora_final_local,horario_status
from hd_kanban.apontamentos
on conflict(apontamento_id) do nothing;

create table if not exists hd_kanban.integracao_auditorias(
  id uuid primary key default gen_random_uuid(),
  origem text not null,
  status text not null check(status in ('SUCESSO','PARCIAL','ERRO')),
  resumo jsonb not null default '{}'::jsonb,
  iniciado_em timestamptz,
  concluido_em timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table hd_kanban.integracao_auditorias enable row level security;
revoke all on hd_kanban.integracao_auditorias from public,anon,authenticated;
grant all on hd_kanban.integracao_auditorias to service_role;
grant select on hd_kanban.integracao_auditorias to authenticated;
create policy admin_le_integracao_auditorias on hd_kanban.integracao_auditorias for select to authenticated
  using(coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA')='ADMIN');

create or replace function hd_kanban.registrar_auditoria_integracao(p_origem text,p_status text,p_resumo jsonb,p_iniciado_em timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if upper(coalesce(p_status,'')) not in ('SUCESSO','PARCIAL','ERRO') then raise exception 'Status de auditoria inválido'; end if;
  insert into hd_kanban.integracao_auditorias(origem,status,resumo,iniciado_em)
  values(coalesce(nullif(trim(p_origem),''),'GOOGLE_SHEETS'),upper(p_status),coalesce(p_resumo,'{}'::jsonb),p_iniciado_em)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function hd_kanban.registrar_auditoria_integracao(text,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function hd_kanban.registrar_auditoria_integracao(text,text,jsonb,timestamptz) to service_role;

create or replace function hd_kanban.diagnostico_integracao_detalhado()
returns jsonb language sql stable security invoker set search_path='' as $$
with produtivos as(
  select distinct n_serie from hd_kanban.apontamentos
  where not source_deleted and not orphan and nullif(trim(coalesce(operacao,'')),'') is not null
), base as(
  select
    (select count(*) from hd_kanban.fornos where status_forno='FABRICAÇÃO') fabricacao,
    (select count(*) from hd_kanban.fornos f where status_forno='FABRICAÇÃO' and not exists(select 1 from produtivos p where p.n_serie=f.n_serie)) fabricacao_sem_apontamento,
    (select count(*) from hd_kanban.apontamentos where orphan) orfaos,
    (select count(*) from hd_kanban.apontamentos where horario_status='AMBIGUO') horarios_ambiguos,
    (select count(*) from hd_kanban.apontamentos where horario_status='INVALIDO') horarios_invalidos,
    (select count(*) from hd_kanban.integracao_pendencias where status in('PENDENTE','ERRO')) pendencias,
    (select to_jsonb(x) from (select origem,status,resumo,concluido_em from hd_kanban.integracao_auditorias order by concluido_em desc limit 1)x) ultima_reconciliacao,
    (select jsonb_build_object('existe',count(*)>0,'apontamentos',count(*),'ultima_operacao',max(operacao),'ultima_data',max(data_produtiva)) from hd_kanban.apontamentos where n_serie='3127' and not source_deleted) ns3127
)
select to_jsonb(base.*) from base
where coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA')='ADMIN'
$$;
revoke all on function hd_kanban.diagnostico_integracao_detalhado() from public,anon;
grant execute on function hd_kanban.diagnostico_integracao_detalhado() to authenticated;



