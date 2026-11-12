-- Proteção do limite gerencial no banco. Não altera programações existentes.
insert into hd_kanban.configuracoes(chave,valor,descricao)
values('meta_mensal_pcp','100'::jsonb,'Limite gerencial inicial de fornos programados por mês')
on conflict(chave) do nothing;

grant update on hd_kanban.configuracoes to authenticated;
create policy admin_atualiza_configuracoes on hd_kanban.configuracoes
for update to authenticated
using(coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA')='ADMIN')
with check(coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA')='ADMIN');

create or replace function hd_kanban.validar_limite_mensal_planejamento()
returns trigger language plpgsql security invoker set search_path=hd_kanban,pg_temp as $$
declare
  v_role text:=coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA');
  v_limite integer:=100;
  v_ocupacao integer;
begin
  if new.planejado_para is null or v_role='ADMIN' then return new; end if;
  select greatest(1,coalesce((valor #>> '{}')::integer,100)) into v_limite
  from hd_kanban.configuracoes where chave='meta_mensal_pcp';
  v_limite:=coalesce(v_limite,100);
  select count(*) into v_ocupacao from hd_kanban.planejamento_kanban p
  where p.planejado_para>=date_trunc('month',new.planejado_para)::date
    and p.planejado_para<(date_trunc('month',new.planejado_para)+interval '1 month')::date
    and p.id is distinct from new.id;
  if v_ocupacao>=v_limite then
    raise exception using errcode='P0001',message=format('Limite gerencial de %s fornos atingido em %s.',v_limite,to_char(new.planejado_para,'MM/YYYY'));
  end if;
  return new;
end $$;

drop trigger if exists planejamento_limite_mensal on hd_kanban.planejamento_kanban;
create trigger planejamento_limite_mensal before insert or update of planejado_para on hd_kanban.planejamento_kanban
for each row execute function hd_kanban.validar_limite_mensal_planejamento();

revoke execute on function hd_kanban.validar_limite_mensal_planejamento() from public,anon,authenticated;
