-- Reinício e restauração auditável do PCP. Não remove fornos, apontamentos ou históricos.
create table if not exists hd_kanban.snapshots_programacao_pcp(
  id uuid primary key default gen_random_uuid(),
  tipo text not null check(tipo in ('TOTAL','PERIODO','LOTES')),
  periodo_inicio date,
  periodo_fim date,
  lote_ids uuid[] not null default '{}',
  justificativa text not null,
  snapshot jsonb not null,
  total_fornos integer not null check(total_fornos>=0),
  total_lotes integer not null check(total_lotes>=0),
  semanas date[] not null default '{}',
  status text not null default 'DISPONIVEL' check(status in ('DISPONIVEL','RESTAURADO','RESTAURADO_PARCIAL')),
  criado_por uuid not null references auth.users(id),
  criado_em timestamptz not null default now(),
  restaurado_por uuid references auth.users(id),
  restaurado_em timestamptz
);

create index if not exists snapshots_programacao_pcp_criado_idx
  on hd_kanban.snapshots_programacao_pcp(criado_em desc);
alter table hd_kanban.snapshots_programacao_pcp enable row level security;
grant select,insert,update on hd_kanban.snapshots_programacao_pcp to authenticated;
drop policy if exists leitura_snapshots_programacao_pcp on hd_kanban.snapshots_programacao_pcp;
create policy leitura_snapshots_programacao_pcp on hd_kanban.snapshots_programacao_pcp
  for select to authenticated using(true);
drop policy if exists grava_snapshots_programacao_pcp on hd_kanban.snapshots_programacao_pcp;
create policy grava_snapshots_programacao_pcp on hd_kanban.snapshots_programacao_pcp
  for insert to authenticated with check(
    criado_por=(select auth.uid())
    and coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA') in ('ADMIN','PCP')
  );
drop policy if exists atualiza_snapshots_programacao_pcp on hd_kanban.snapshots_programacao_pcp;
create policy atualiza_snapshots_programacao_pcp on hd_kanban.snapshots_programacao_pcp
  for update to authenticated using(
    coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA') in ('ADMIN','PCP')
  ) with check(
    coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA') in ('ADMIN','PCP')
  );

create or replace function hd_kanban.prever_reinicio_pcp(
  p_tipo text,
  p_periodo_inicio date default null,
  p_periodo_fim date default null,
  p_lote_ids uuid[] default '{}'
) returns jsonb
language plpgsql security invoker stable set search_path=''
as $$
declare
  v_role text := coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA');
  v_tipo text := upper(trim(coalesce(p_tipo,'')));
  v_result jsonb;
begin
  if (select auth.uid()) is null or v_role not in ('ADMIN','PCP') then
    raise exception using errcode='42501',message='Usuário sem permissão para reiniciar o PCP.';
  end if;
  if v_tipo not in ('TOTAL','PERIODO','LOTES') then
    raise exception using errcode='22023',message='Escopo de reinicialização inválido.';
  end if;
  if v_tipo='PERIODO' and (p_periodo_inicio is null or p_periodo_fim is null or p_periodo_inicio>p_periodo_fim) then
    raise exception using errcode='22023',message='Informe um período válido.';
  end if;
  if v_tipo='LOTES' and cardinality(coalesce(p_lote_ids,'{}'))=0 then
    raise exception using errcode='22023',message='Selecione ao menos um lote.';
  end if;

  with selecionados as (
    select distinct p.id planejamento_id,p.forno_id,p.n_serie,p.planejado_para,p.prioridade,p.ordem_coluna,
      p.prioridade_manual,p.proxima_operacao_planejada,p.observacao_pcp,p.bloqueado,p.motivo_bloqueio,
      p.versao,p.origem,p.simulacao_id,p.planejamento_original_para,
      f.modelo,f.cliente,f.data_entrega,f.status_forno,
      k.operacao_atual,k.tem_apontamento_produtivo,k.atrasado,
      lf.lote_id,l.codigo lote_codigo,l.semana_planejada lote_semana,l.status lote_status,l.versao lote_versao
    from hd_kanban.planejamento_kanban p
    join hd_kanban.fornos f on f.id=p.forno_id
    left join hd_kanban.kanban_fornos k on k.forno_id=f.id
    left join hd_kanban.lote_fornos lf on lf.forno_id=f.id and lf.ativo
    left join hd_kanban.lotes_producao l on l.id=lf.lote_id
    where p.planejado_para is not null and (
      v_tipo='TOTAL'
      or (v_tipo='PERIODO' and p.planejado_para between p_periodo_inicio and p_periodo_fim)
      or (v_tipo='LOTES' and lf.lote_id=any(coalesce(p_lote_ids,'{}')))
    )
  )
  select jsonb_build_object(
    'tipo',v_tipo,
    'fornos',count(*),
    'lotes',count(distinct lote_id) filter(where lote_id is not null),
    'semanas',count(distinct planejado_para),
    'em_fabricacao',count(*) filter(where tem_apontamento_produtivo and status_forno<>'FINALIZADO'),
    'nao_iniciados',count(*) filter(where not coalesce(tem_apontamento_produtivo,false) and status_forno<>'FINALIZADO'),
    'finalizados',count(*) filter(where status_forno='FINALIZADO'),
    'atrasados',count(*) filter(where atrasado),
    'individuais',count(*) filter(where lote_id is null),
    'versoes',coalesce(jsonb_object_agg(forno_id::text,versao),'{}'::jsonb),
    'registros',coalesce(jsonb_agg(jsonb_build_object(
      'forno_id',forno_id,'n_serie',n_serie,'modelo',modelo,'cliente',cliente,
      'semana',planejado_para,'lote_id',lote_id,'lote',lote_codigo,
      'operacao_real',operacao_atual,'status_forno',status_forno
    ) order by planejado_para,n_serie),'[]'::jsonb)
  ) into v_result from selecionados;
  return v_result;
end $$;

create or replace function hd_kanban.reiniciar_programacao_pcp(
  p_tipo text,
  p_periodo_inicio date,
  p_periodo_fim date,
  p_lote_ids uuid[],
  p_justificativa text,
  p_confirmacao text,
  p_versoes jsonb
) returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_role text := coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA');
  v_tipo text := upper(trim(coalesce(p_tipo,'')));
  v_justificativa text := nullif(trim(coalesce(p_justificativa,'')),'');
  v_snapshot_id uuid;
  v_snapshot jsonb;
  v_total integer;
  v_lotes integer;
  v_semanas date[];
  v_item record;
begin
  if v_usuario is null or v_role not in ('ADMIN','PCP') then raise exception using errcode='42501',message='Usuário sem permissão para reiniciar o PCP.'; end if;
  if v_justificativa is null then raise exception using errcode='22023',message='Informe a justificativa.'; end if;
  if v_tipo='TOTAL' and trim(coalesce(p_confirmacao,''))<>'REINICIAR PCP' then raise exception using errcode='22023',message='Digite REINICIAR PCP para confirmar.'; end if;
  perform pg_advisory_xact_lock(hashtext('hd_kanban.reiniciar_programacao_pcp'));
  perform hd_kanban.prever_reinicio_pcp(v_tipo,p_periodo_inicio,p_periodo_fim,p_lote_ids);

  create temporary table tmp_reinicio_pcp on commit drop as
  select distinct p.*,lf.lote_id,l.codigo lote_codigo,l.modelo lote_modelo,l.semana_planejada lote_semana,
    l.status lote_status,l.justificativa lote_justificativa,l.configuracao lote_configuracao,
    l.prioridade lote_prioridade,l.versao lote_versao,lf.adicionado_por,lf.adicionado_em
  from hd_kanban.planejamento_kanban p
  left join hd_kanban.lote_fornos lf on lf.forno_id=p.forno_id and lf.ativo
  left join hd_kanban.lotes_producao l on l.id=lf.lote_id
  where p.planejado_para is not null and (
    v_tipo='TOTAL'
    or (v_tipo='PERIODO' and p.planejado_para between p_periodo_inicio and p_periodo_fim)
    or (v_tipo='LOTES' and lf.lote_id=any(coalesce(p_lote_ids,'{}')))
  );
  select count(*),count(distinct lote_id),array_agg(distinct planejado_para order by planejado_para)
    into v_total,v_lotes,v_semanas from tmp_reinicio_pcp;
  if v_total=0 then raise exception using errcode='P0002',message='Nenhum planejamento ativo encontrado no escopo.'; end if;

  for v_item in select p.forno_id,p.n_serie,p.versao from hd_kanban.planejamento_kanban p
    join tmp_reinicio_pcp t on t.id=p.id order by p.forno_id for update of p loop
    if coalesce((p_versoes->>v_item.forno_id::text)::integer,-1)<>v_item.versao then
      raise exception using errcode='40001',message=format('O planejamento da série %s mudou. Recarregue a prévia.',v_item.n_serie);
    end if;
  end loop;
  select jsonb_agg(to_jsonb(t) order by t.planejado_para,t.n_serie) into v_snapshot from tmp_reinicio_pcp t;
  insert into hd_kanban.snapshots_programacao_pcp(tipo,periodo_inicio,periodo_fim,lote_ids,justificativa,snapshot,total_fornos,total_lotes,semanas,criado_por)
  values(v_tipo,p_periodo_inicio,p_periodo_fim,coalesce(p_lote_ids,'{}'),v_justificativa,v_snapshot,v_total,v_lotes,coalesce(v_semanas,'{}'),v_usuario)
  returning id into v_snapshot_id;

  update hd_kanban.lote_fornos lf set ativo=false
    where lf.ativo and exists(select 1 from tmp_reinicio_pcp t where t.forno_id=lf.forno_id and t.lote_id=lf.lote_id);
  update hd_kanban.planejamento_kanban p set planejado_para=null,observacao_pcp=v_justificativa,
    updated_by=v_usuario,origem='REPROGRAMACAO',versao=p.versao+1,updated_at=now()
    where exists(select 1 from tmp_reinicio_pcp t where t.id=p.id);
  update hd_kanban.lotes_producao l set status='CANCELADO',justificativa=v_justificativa,
    versao=l.versao+1,updated_at=now()
    where exists(select 1 from tmp_reinicio_pcp t where t.lote_id=l.id)
      and not exists(select 1 from hd_kanban.lote_fornos lf where lf.lote_id=l.id and lf.ativo);
  insert into hd_kanban.auditoria_pcp(tipo,objeto_tipo,objeto_id,valores_anteriores,valores_novos,justificativa,usuario)
    values('REINICIO_PCP','SNAPSHOT',v_snapshot_id,jsonb_build_object('fornos',v_total,'lotes',v_lotes,'semanas',v_semanas),jsonb_build_object('planejamentos_ativos',0),v_justificativa,v_usuario);
  return jsonb_build_object('snapshot_id',v_snapshot_id,'fornos',v_total,'lotes',v_lotes,'semanas',cardinality(v_semanas));
end $$;

create or replace function hd_kanban.prever_restauracao_pcp(p_snapshot_id uuid) returns jsonb
language plpgsql security invoker stable set search_path=''
as $$
declare v_role text:=coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA');v_result jsonb;
begin
  if (select auth.uid()) is null or v_role not in ('ADMIN','PCP') then raise exception using errcode='42501',message='Usuário sem permissão para restaurar o PCP.'; end if;
  with s as (select jsonb_array_elements(snapshot) item from hd_kanban.snapshots_programacao_pcp where id=p_snapshot_id),
  c as (select item,(item->>'forno_id')::uuid forno_id,(item->>'versao')::integer versao_anterior from s),
  r as (select c.*,f.n_serie,f.status_forno,p.planejado_para,p.versao versao_atual,
    case when f.id is null then 'FORNO_INEXISTENTE' when f.status_forno='FINALIZADO' then 'FORNO_FINALIZADO'
      when p.planejado_para is not null then 'PROGRAMACAO_POSTERIOR'
      when p.versao<>c.versao_anterior+1 then 'VERSAO_ALTERADA' else null end conflito
    from c left join hd_kanban.fornos f on f.id=c.forno_id left join hd_kanban.planejamento_kanban p on p.forno_id=c.forno_id)
  select jsonb_build_object('elegiveis',count(*) filter(where conflito is null),'conflitos',count(*) filter(where conflito is not null),
    'registros',coalesce(jsonb_agg(jsonb_build_object('forno_id',forno_id,'n_serie',coalesce(n_serie,item->>'n_serie'),'semana',item->>'planejado_para','lote',item->>'lote_codigo','conflito',conflito) order by coalesce(n_serie,item->>'n_serie')),'[]'::jsonb))
  into v_result from r;return v_result;
end $$;

create or replace function hd_kanban.restaurar_programacao_pcp(p_snapshot_id uuid,p_forno_ids uuid[],p_justificativa text) returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare v_usuario uuid:=(select auth.uid());v_role text:=coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA');v_item record;v_total int:=0;v_snapshot hd_kanban.snapshots_programacao_pcp%rowtype;
begin
  if v_usuario is null or v_role not in ('ADMIN','PCP') then raise exception using errcode='42501',message='Usuário sem permissão para restaurar o PCP.'; end if;
  if nullif(trim(coalesce(p_justificativa,'')),'') is null then raise exception using errcode='22023',message='Informe a justificativa da restauração.'; end if;
  perform pg_advisory_xact_lock(hashtext('hd_kanban.reiniciar_programacao_pcp'));
  select * into v_snapshot from hd_kanban.snapshots_programacao_pcp where id=p_snapshot_id for update;
  if not found then raise exception using errcode='P0002',message='Snapshot não encontrado.'; end if;
  for v_item in select x.* from jsonb_to_recordset(v_snapshot.snapshot) as x(forno_id uuid,n_serie text,planejado_para date,prioridade int,ordem_coluna numeric,prioridade_manual boolean,proxima_operacao_planejada text,observacao_pcp text,bloqueado boolean,motivo_bloqueio text,versao int,origem text,simulacao_id uuid,planejamento_original_para date,lote_id uuid,lote_codigo text,lote_modelo text,lote_semana date,lote_status text,lote_justificativa text,lote_configuracao jsonb,lote_prioridade int,lote_versao int,adicionado_por uuid,adicionado_em timestamptz)
    where x.forno_id=any(coalesce(p_forno_ids,'{}')) order by x.forno_id
  loop
    if exists(select 1 from hd_kanban.fornos f where f.id=v_item.forno_id and f.status_forno='FINALIZADO')
      or not exists(select 1 from hd_kanban.planejamento_kanban p where p.forno_id=v_item.forno_id and p.planejado_para is null and p.versao=v_item.versao+1) then
      raise exception using errcode='40001',message=format('Conflito ao restaurar a série %s. Atualize a prévia.',v_item.n_serie);
    end if;
    update hd_kanban.planejamento_kanban set planejado_para=v_item.planejado_para,prioridade=v_item.prioridade,ordem_coluna=v_item.ordem_coluna,
      prioridade_manual=v_item.prioridade_manual,proxima_operacao_planejada=v_item.proxima_operacao_planejada,observacao_pcp=p_justificativa,
      bloqueado=v_item.bloqueado,motivo_bloqueio=v_item.motivo_bloqueio,updated_by=v_usuario,origem='REPROGRAMACAO',versao=versao+1,updated_at=now()
      where forno_id=v_item.forno_id;
    if v_item.lote_id is not null then
      update hd_kanban.lotes_producao set status='PLANEJADO',semana_planejada=v_item.lote_semana,justificativa=p_justificativa,versao=versao+1,updated_at=now() where id=v_item.lote_id;
      insert into hd_kanban.lote_fornos(lote_id,forno_id,adicionado_por,ativo) values(v_item.lote_id,v_item.forno_id,v_usuario,true)
      on conflict(lote_id,forno_id) do update set ativo=true,adicionado_por=excluded.adicionado_por,adicionado_em=now();
    end if;
    v_total:=v_total+1;
  end loop;
  if v_total=0 then raise exception using errcode='22023',message='Selecione ao menos um forno elegível.'; end if;
  update hd_kanban.snapshots_programacao_pcp set status=case when v_total=total_fornos then 'RESTAURADO' else 'RESTAURADO_PARCIAL' end,restaurado_por=v_usuario,restaurado_em=now() where id=p_snapshot_id;
  insert into hd_kanban.auditoria_pcp(tipo,objeto_tipo,objeto_id,valores_anteriores,valores_novos,justificativa,usuario)
    values('RESTAURACAO_PCP','SNAPSHOT',p_snapshot_id,'{}',jsonb_build_object('fornos',v_total),p_justificativa,v_usuario);
  return jsonb_build_object('snapshot_id',p_snapshot_id,'restaurados',v_total);
end $$;

revoke all on function hd_kanban.prever_reinicio_pcp(text,date,date,uuid[]) from public,anon;
revoke all on function hd_kanban.reiniciar_programacao_pcp(text,date,date,uuid[],text,text,jsonb) from public,anon;
revoke all on function hd_kanban.prever_restauracao_pcp(uuid) from public,anon;
revoke all on function hd_kanban.restaurar_programacao_pcp(uuid,uuid[],text) from public,anon;
grant execute on function hd_kanban.prever_reinicio_pcp(text,date,date,uuid[]) to authenticated;
grant execute on function hd_kanban.reiniciar_programacao_pcp(text,date,date,uuid[],text,text,jsonb) to authenticated;
grant execute on function hd_kanban.prever_restauracao_pcp(uuid) to authenticated;
grant execute on function hd_kanban.restaurar_programacao_pcp(uuid,uuid[],text) to authenticated;
