-- Executar somente em branch/projeto de homologação após a migration 2.0.
begin;
do $$
declare
  v_suffix text:=substr(gen_random_uuid()::text,1,8);
  v_serie_a text:='HML-A-'||v_suffix;
  v_serie_b text:='HML-B-'||v_suffix;
  v_apont text:='HML-AP-'||v_suffix;
  v_id_antes uuid;
  v_id_depois uuid;
  v_result jsonb;
begin
  v_result:=hd_kanban.sincronizar_integracao_lote('FORNO','HOMOLOGACAO',jsonb_build_array(
    jsonb_build_object('n_serie',v_serie_a,'modelo','HD80','status_caixa','COMPRAR','status_forno','FABRICAÇÃO','row_hash',repeat('a',64)),
    jsonb_build_object('n_serie',v_serie_b,'modelo','HD80','status_caixa','COMPRAR','status_forno','FABRICAÇÃO','row_hash',repeat('b',64))
  ),'hml-fornos-'||v_suffix);
  if (v_result->>'inseridos')::integer<>2 then raise exception 'Esperados dois fornos inseridos: %',v_result; end if;

  v_result:=hd_kanban.sincronizar_integracao_lote('APONTAMENTO','HOMOLOGACAO',jsonb_build_array(
    jsonb_build_object('id_origem',v_apont,'n_serie',v_serie_a,'operacao','MONT.GERAL','hora_inicial','2026-11-26T10:00:00-03:00','row_hash',repeat('c',64))
  ),'hml-apont-1-'||v_suffix);
  select id into v_id_antes from hd_kanban.apontamentos where id_origem=v_apont;

  v_result:=hd_kanban.sincronizar_integracao_lote('APONTAMENTO','HOMOLOGACAO',jsonb_build_array(
    jsonb_build_object('id_origem',v_apont,'n_serie',v_serie_a,'operacao','MONT.GERAL','hora_inicial','2026-11-26T10:00:00-03:00','row_hash',repeat('c',64))
  ),'hml-apont-igual-'||v_suffix);
  if (v_result->>'ignorados')::integer<>1 then raise exception 'Segunda passagem deveria ser ignorada: %',v_result; end if;

  perform hd_kanban.sincronizar_integracao_lote('APONTAMENTO','HOMOLOGACAO',jsonb_build_array(
    jsonb_build_object('id_origem',v_apont,'n_serie',v_serie_b,'operacao','MONT.GERAL','hora_inicial','2026-11-26T10:00:00-03:00','row_hash',repeat('d',64))
  ),'hml-transferencia-'||v_suffix);
  select id into v_id_depois from hd_kanban.apontamentos where id_origem=v_apont;
  if v_id_antes is distinct from v_id_depois then raise exception 'UUID do apontamento foi alterado'; end if;
  if not exists(select 1 from hd_kanban.historico_troca_serie where apontamento_id_origem=v_apont and n_serie_anterior=v_serie_a and n_serie_nova=v_serie_b) then raise exception 'Histórico de transferência não foi gravado'; end if;
  if (select status_caixa::text from hd_kanban.fornos where n_serie=v_serie_b)<>'COMPRADA' then raise exception 'MONT.GERAL não atualizou a caixa'; end if;
  perform hd_kanban.sincronizar_integracao_lote('APONTAMENTO','HOMOLOGACAO',jsonb_build_array(
    jsonb_build_object('id_origem',v_apont||'-ACAB','n_serie',v_serie_b,'operacao','ACAB.','hora_inicial','2026-11-26T11:00:00-03:00','hora_final','2026-11-26T12:00:00-03:00','row_hash',repeat('e',64))
  ),'hml-acab-'||v_suffix);
  if (select status_forno::text from hd_kanban.fornos where n_serie=v_serie_b)<>'FINALIZADO' then raise exception 'ACAB concluído não finalizou o forno'; end if;
end $$;
rollback;

