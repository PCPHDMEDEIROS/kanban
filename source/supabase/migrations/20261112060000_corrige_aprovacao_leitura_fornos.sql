-- A função apenas valida o forno; ela não o altera. O bloqueio FOR UPDATE
-- exigia privilégio UPDATE desnecessário e causava erro 42501 no cliente.
do $$
declare
  v_definition text;
  v_before constant text := 'from hd_kanban.fornos where id=(v_item->>''forno_id'')::uuid for update;';
  v_after constant text := 'from hd_kanban.fornos where id=(v_item->>''forno_id'')::uuid;';
begin
  select pg_get_functiondef(
    'hd_kanban.aprovar_simulacao_pcp(uuid,integer,jsonb,text)'::regprocedure
  ) into v_definition;

  if position(v_before in v_definition) = 0 then
    raise exception 'Trecho esperado não encontrado em aprovar_simulacao_pcp';
  end if;

  execute replace(v_definition, v_before, v_after);
end $$;

revoke all on function hd_kanban.aprovar_simulacao_pcp(uuid,integer,jsonb,text)
  from public, anon;
grant execute on function hd_kanban.aprovar_simulacao_pcp(uuid,integer,jsonb,text)
  to authenticated;

