-- Comparação somente leitura entre IDs existentes na origem e IDs conhecidos pela integração.
-- Não altera apontamentos, fornos, histórico ou programações.

create or replace function hd_kanban.comparar_ids_integracao(p_entidade text,p_ids jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_entidade text:=upper(trim(coalesce(p_entidade,'')));
  v_result jsonb;
begin
  if v_entidade not in ('FORNO','APONTAMENTO') then
    raise exception using errcode='22023',message='Entidade de comparação inválida.';
  end if;
  if jsonb_typeof(p_ids)<>'array' then
    raise exception using errcode='22023',message='A lista de IDs deve ser um array JSON.';
  end if;
  if jsonb_array_length(p_ids)>20000 then
    raise exception using errcode='22023',message='A comparação aceita no máximo 20000 IDs.';
  end if;

  with origem as(
    select distinct trim(value) id
    from jsonb_array_elements_text(p_ids)
    where nullif(trim(value),'') is not null
  ), sincronizados as(
    select id_origem id from hd_kanban.apontamentos where v_entidade='APONTAMENTO'
    union all
    select n_serie id from hd_kanban.fornos where v_entidade='FORNO'
  ), ausentes as(
    select o.id from origem o left join sincronizados s using(id) where s.id is null
  ), extras as(
    select s.id from sincronizados s left join origem o using(id) where o.id is null
  )
  select jsonb_build_object(
    'entidade',v_entidade,
    'ids_origem',(select count(*) from origem),
    'ids_sincronizados',(select count(*) from sincronizados),
    'nao_sincronizados',(select count(*) from ausentes),
    'nao_sincronizados_amostra',(select coalesce(jsonb_agg(id order by id),'[]'::jsonb) from (select id from ausentes order by id limit 100)x),
    'somente_supabase',(select count(*) from extras),
    'somente_supabase_amostra',(select coalesce(jsonb_agg(id order by id),'[]'::jsonb) from (select id from extras order by id limit 100)x),
    'comparado_em',now()
  ) into v_result;
  return v_result;
end $$;

revoke all on function hd_kanban.comparar_ids_integracao(text,jsonb) from public,anon,authenticated;
grant execute on function hd_kanban.comparar_ids_integracao(text,jsonb) to service_role;


