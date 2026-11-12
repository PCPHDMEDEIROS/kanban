-- Uma aprovação nunca deve reutilizar silenciosamente um código de lote existente.
-- A restrição UNIQUE passa a provocar rollback integral em caso de concorrência.
do $$
declare
  v_definition text;
  v_before constant text := 'on conflict(codigo) do update set semana_planejada=excluded.semana_planejada,prioridade=excluded.prioridade,updated_at=now()
      returning id into v_lote_id;';
  v_after constant text := 'returning id into v_lote_id;';
begin
  select pg_get_functiondef(
    'hd_kanban.aprovar_simulacao_pcp(uuid,integer,jsonb,text)'::regprocedure
  ) into v_definition;
  if position(v_before in v_definition)=0 then
    raise exception 'Trecho de conflito esperado não encontrado em aprovar_simulacao_pcp';
  end if;
  execute replace(v_definition,v_before,v_after);
end $$;

revoke all on function hd_kanban.aprovar_simulacao_pcp(uuid,integer,jsonb,text)
  from public,anon;
grant execute on function hd_kanban.aprovar_simulacao_pcp(uuid,integer,jsonb,text)
  to authenticated;

