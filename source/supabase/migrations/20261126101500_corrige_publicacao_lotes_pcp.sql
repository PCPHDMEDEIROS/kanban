-- Corrige a publicação PCP para criar um lote por agrupamento lógico.
-- A função continua sendo uma única transação e não altera apontamentos produtivos.

create sequence if not exists hd_kanban.lote_codigo_seq;
grant usage,select on sequence hd_kanban.lote_codigo_seq to authenticated;

alter table hd_kanban.aprovacoes_planejamento
  add column if not exists fingerprint text;

create unique index if not exists aprovacoes_simulacao_fingerprint_uniq
  on hd_kanban.aprovacoes_planejamento(simulacao_id,fingerprint)
  where fingerprint is not null;

create or replace function hd_kanban.aprovar_simulacao_pcp(
  p_simulacao_id uuid,
  p_versao_esperada integer,
  p_itens jsonb,
  p_justificativa text default null
) returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_role text := coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA');
  v_simulacao hd_kanban.cenarios_simulacao%rowtype;
  v_item jsonb;
  v_forno hd_kanban.fornos%rowtype;
  v_planejamento hd_kanban.planejamento_kanban%rowtype;
  v_vinculo hd_kanban.lote_fornos%rowtype;
  v_lote_id uuid;
  v_lote_codigo text;
  v_lote_logico_id text;
  v_grupo record;
  v_grupos jsonb := '{}'::jsonb;
  v_lotes jsonb := '{}'::jsonb;
  v_forno_ids uuid[] := '{}'::uuid[];
  v_series text[] := '{}'::text[];
  v_aprovacao_id uuid := gen_random_uuid();
  v_fingerprint text := md5(coalesce(p_itens,'null'::jsonb)::text);
  v_existente uuid;
  v_total_cenario integer;
begin
  if v_usuario is null or v_role not in ('ADMIN','PCP') then
    raise exception using errcode='42501',message='Usuário sem permissão para aprovar programação.';
  end if;
  if jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens)=0 then
    raise exception using errcode='22023',message='Selecione ao menos um item para aprovação.';
  end if;

  select * into v_simulacao
  from hd_kanban.cenarios_simulacao
  where id=p_simulacao_id and created_by=v_usuario
  for update;
  if not found then
    raise exception using errcode='P0002',message='Simulação não encontrada ou não pertence ao usuário.';
  end if;

  -- Uma repetição byte-a-byte da solicitação retorna a aprovação já concluída.
  select id into v_existente
  from hd_kanban.aprovacoes_planejamento
  where simulacao_id=p_simulacao_id and fingerprint=v_fingerprint
  order by aprovado_em desc limit 1;
  if v_existente is not null and v_simulacao.status='PUBLICADO' then
    return v_existente;
  end if;
  if v_simulacao.status<>'RASCUNHO' then
    raise exception using errcode='P0001',message='A simulação não está disponível para aprovação.';
  end if;
  if v_simulacao.versao<>p_versao_esperada then
    raise exception using errcode='40001',message='A simulação foi alterada. Recarregue antes de aprovar.';
  end if;

  -- Fase 1: valida integralmente e monta os agrupamentos sem gravar lotes.
  for v_item in select value from jsonb_array_elements(p_itens) loop
    if nullif(trim(v_item->>'forno_id'),'') is null
       or nullif(trim(v_item->>'n_serie'),'') is null
       or nullif(trim(v_item->>'lote_logico_id'),'') is null
       or nullif(trim(v_item->>'semana_planejada'),'') is null then
      raise exception using errcode='22023',message='Item sem forno, série, lote lógico ou semana planejada.';
    end if;
    begin
      v_lote_logico_id := trim(v_item->>'lote_logico_id');
      select * into v_forno from hd_kanban.fornos
      where id=(v_item->>'forno_id')::uuid for update;
    exception when invalid_text_representation then
      raise exception using errcode='22023',message='Identificador de forno inválido.';
    end;
    if not found or v_forno.status_forno='FINALIZADO'::hd_kanban.status_forno then
      raise exception using errcode='P0001',message='Forno inelegível ou inexistente na aprovação.';
    end if;
    if v_forno.id=any(v_forno_ids) then
      raise exception using errcode='22023',message=format('Forno %s duplicado na aprovação.',v_forno.n_serie);
    end if;
    if upper(trim(v_forno.n_serie))=any(v_series) then
      raise exception using errcode='22023',message=format('Número de série %s duplicado na aprovação.',v_forno.n_serie);
    end if;
    v_forno_ids:=array_append(v_forno_ids,v_forno.id);
    v_series:=array_append(v_series,upper(trim(v_forno.n_serie)));

    select * into v_planejamento from hd_kanban.planejamento_kanban
    where forno_id=v_forno.id for update;
    if found and coalesce((v_item->>'versao_esperada')::integer,0)<>v_planejamento.versao then
      raise exception using errcode='40001',message=format('Conflito de planejamento no forno %s.',v_forno.n_serie);
    end if;
    if not found and coalesce((v_item->>'versao_esperada')::integer,0)<>0 then
      raise exception using errcode='40001',message=format('O estado do planejamento do forno %s mudou.',v_forno.n_serie);
    end if;

    select * into v_vinculo from hd_kanban.lote_fornos
    where forno_id=v_forno.id and ativo for update;
    if found then
      raise exception using errcode='P0001',message=format('O forno %s já pertence a um lote ativo.',v_forno.n_serie);
    end if;

    if v_grupos ? v_lote_logico_id then
      if v_grupos->v_lote_logico_id->>'modelo' is distinct from coalesce(v_item->>'modelo',v_forno.modelo)
         or v_grupos->v_lote_logico_id->>'semana_planejada' is distinct from v_item->>'semana_planejada'
         or (v_grupos->v_lote_logico_id->'configuracao') is distinct from coalesce(v_item->'configuracao','{}'::jsonb) then
        raise exception using errcode='22023',message='Um lote lógico contém modelo, semana ou configuração incompatível.';
      end if;
    else
      v_grupos:=v_grupos||jsonb_build_object(v_lote_logico_id,jsonb_build_object(
        'modelo',coalesce(v_item->>'modelo',v_forno.modelo),
        'semana_planejada',v_item->>'semana_planejada',
        'configuracao',coalesce(v_item->'configuracao','{}'::jsonb),
        'prioridade',coalesce((v_item->>'prioridade')::integer,0),
        'codigo_sugerido',nullif(trim(v_item->>'lote_codigo_sugerido'),'')
      ));
    end if;
  end loop;

  -- Fase 2: cria exatamente um lote físico para cada lote lógico validado.
  for v_grupo in select key,value from jsonb_each(v_grupos) order by key loop
    v_lote_codigo:=format('PCP-%s-%s',to_char(current_date,'YYYY'),lpad(nextval('hd_kanban.lote_codigo_seq')::text,6,'0'));
    insert into hd_kanban.lotes_producao(
      codigo,modelo,semana_planejada,status,configuracao,prioridade,
      justificativa,created_by,aprovado_por,aprovado_em
    ) values (
      v_lote_codigo,v_grupo.value->>'modelo',(v_grupo.value->>'semana_planejada')::date,
      'PLANEJADO',v_grupo.value->'configuracao',coalesce((v_grupo.value->>'prioridade')::integer,0),
      nullif(trim(p_justificativa),''),v_usuario,v_usuario,now()
    ) returning id into v_lote_id;
    v_lotes:=v_lotes||jsonb_build_object(v_grupo.key,jsonb_build_object('id',v_lote_id,'codigo',v_lote_codigo));
  end loop;

  -- Fase 3: cria os vínculos e planejamentos usando o mapa lógico/físico.
  for v_item in select value from jsonb_array_elements(p_itens) loop
    v_lote_logico_id:=trim(v_item->>'lote_logico_id');
    v_lote_id:=(v_lotes->v_lote_logico_id->>'id')::uuid;
    select * into v_forno from hd_kanban.fornos where id=(v_item->>'forno_id')::uuid;

    insert into hd_kanban.lote_fornos(lote_id,forno_id,adicionado_por,ativo)
    values(v_lote_id,v_forno.id,v_usuario,true);

    insert into hd_kanban.planejamento_kanban(
      forno_id,n_serie,planejado_para,planejamento_original_para,prioridade,
      prioridade_manual,observacao_pcp,updated_by,origem,simulacao_id,versao
    ) values (
      v_forno.id,v_forno.n_serie,(v_item->>'semana_planejada')::date,
      (v_item->>'semana_planejada')::date,coalesce((v_item->>'prioridade')::integer,0),
      false,nullif(trim(p_justificativa),''),v_usuario,'SUGESTAO_AUTOMATICA',p_simulacao_id,1
    )
    on conflict(n_serie) do update set
      forno_id=excluded.forno_id,planejado_para=excluded.planejado_para,
      prioridade=excluded.prioridade,observacao_pcp=excluded.observacao_pcp,
      updated_by=excluded.updated_by,
      origem=case when hd_kanban.planejamento_kanban.planejado_para is distinct from excluded.planejado_para then 'REPROGRAMACAO' else excluded.origem end,
      simulacao_id=excluded.simulacao_id,versao=hd_kanban.planejamento_kanban.versao+1,
      planejamento_original_para=coalesce(hd_kanban.planejamento_kanban.planejamento_original_para,excluded.planejamento_original_para),
      updated_at=now();
  end loop;

  v_total_cenario:=jsonb_array_length(coalesce(v_simulacao.dados->'itens','[]'::jsonb));
  insert into hd_kanban.aprovacoes_planejamento(
    id,simulacao_id,tipo,snapshot,justificativa,aprovado_por,fingerprint
  ) values (
    v_aprovacao_id,p_simulacao_id,
    case when jsonb_array_length(p_itens)=v_total_cenario then 'TOTAL' else 'PARCIAL' end,
    jsonb_build_object('itens',p_itens,'lotes_criados',v_lotes),
    nullif(trim(p_justificativa),''),v_usuario,v_fingerprint
  );

  insert into hd_kanban.auditoria_pcp(
    tipo,objeto_tipo,objeto_id,valores_anteriores,valores_novos,justificativa,usuario
  ) values (
    'APROVACAO','SIMULACAO',p_simulacao_id,
    jsonb_build_object('status',v_simulacao.status,'versao',v_simulacao.versao),
    jsonb_build_object('status','PUBLICADO','fornos',jsonb_array_length(p_itens),'lotes',jsonb_object_length(v_lotes),'aprovacao_id',v_aprovacao_id),
    nullif(trim(p_justificativa),''),v_usuario
  );

  update hd_kanban.cenarios_simulacao
  set status='PUBLICADO',aprovado_em=now(),updated_at=now(),versao=versao+1
  where id=p_simulacao_id;
  return v_aprovacao_id;
end $$;

revoke all on function hd_kanban.aprovar_simulacao_pcp(uuid,integer,jsonb,text) from public,anon;
grant execute on function hd_kanban.aprovar_simulacao_pcp(uuid,integer,jsonb,text) to authenticated;
