-- Integração 2.0: lote SQL, hash estável, fila seletiva e saúde administrativa.
-- Não altera apontamentos existentes nem programações PCP durante a instalação.

alter table hd_kanban.fornos add column if not exists row_hash text;

create table if not exists hd_kanban.integracao_registros(
  entidade text not null check(entidade in ('FORNO','APONTAMENTO')),
  chave_origem text not null,
  row_hash text not null,
  origem text not null,
  linha_origem integer,
  primeira_sincronizacao timestamptz not null default now(),
  ultima_sincronizacao timestamptz not null default now(),
  primary key(entidade,chave_origem)
);

create table if not exists hd_kanban.integracao_pendencias(
  id uuid primary key default gen_random_uuid(),
  chave_idempotencia text not null unique,
  entidade text not null check(entidade in ('FORNO','APONTAMENTO')),
  chave_origem text,
  origem text not null,
  payload jsonb not null,
  row_hash text,
  status text not null default 'PENDENTE' check(status in ('PENDENTE','PROCESSANDO','CONCLUIDO','ERRO')),
  tentativas integer not null default 0 check(tentativas>=0),
  proxima_tentativa timestamptz not null default now(),
  bloqueado_ate timestamptz,
  ultimo_erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  concluido_em timestamptz
);

create index if not exists integracao_pendencias_processamento_idx
  on hd_kanban.integracao_pendencias(status,proxima_tentativa,created_at)
  where status in ('PENDENTE','ERRO');
create index if not exists integracao_registros_hash_idx
  on hd_kanban.integracao_registros(entidade,row_hash);

alter table hd_kanban.integracao_registros enable row level security;
alter table hd_kanban.integracao_pendencias enable row level security;
revoke all on hd_kanban.integracao_registros,hd_kanban.integracao_pendencias from public,anon,authenticated;
grant all on hd_kanban.integracao_registros,hd_kanban.integracao_pendencias to service_role;
grant select on hd_kanban.integracao_pendencias to authenticated;

create policy admin_le_integracao_pendencias on hd_kanban.integracao_pendencias
  for select to authenticated using(
    coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA')='ADMIN'
  );

-- Causa raiz de permission denied: os triggers de alertas executam como o chamador
-- e a Edge Function opera com service_role. Grant mínimo, sem ampliar acesso do frontend.
grant select,insert on hd_kanban.alertas_pcp to service_role;

-- Permite registrar toda transferência efetiva, inclusive uma futura volta A -> B.
drop index if exists hd_kanban.historico_troca_unica_idx;
create index if not exists historico_troca_apontamento_idx
  on hd_kanban.historico_troca_serie(apontamento_id_origem,data_hora desc);

create or replace function hd_kanban.sincronizar_integracao_lote(
  p_entidade text,
  p_origem text,
  p_itens jsonb,
  p_chave_idempotencia text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_entidade text:=upper(trim(coalesce(p_entidade,'')));
  v_lidos integer:=0;
  v_inseridos integer:=0;
  v_atualizados integer:=0;
  v_ignorados integer:=0;
  v_resultado jsonb;
begin
  if jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens)=0 then
    raise exception using errcode='22023',message='O lote de integração deve conter itens.';
  end if;
  if v_entidade not in ('FORNO','APONTAMENTO') then
    raise exception using errcode='22023',message='Entidade de integração inválida.';
  end if;
  if nullif(trim(coalesce(p_chave_idempotencia,'')),'') is null then
    raise exception using errcode='22023',message='Chave de idempotência obrigatória.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('HDK:'||p_chave_idempotencia,0));
  select detalhes into v_resultado from hd_kanban.sync_log
  where detalhes->>'chave_idempotencia'=p_chave_idempotencia and status='SUCESSO'
  order by inicio desc limit 1;
  if v_resultado is not null then return v_resultado||jsonb_build_object('repetido',true); end if;

  create temp table if not exists tmp_integracao(item jsonb,chave text,row_hash text) on commit drop;
  delete from tmp_integracao where true;
  insert into tmp_integracao(item,chave,row_hash)
  select value,
    trim(case when v_entidade='FORNO' then value->>'n_serie' else value->>'id_origem' end),
    trim(value->>'row_hash')
  from jsonb_array_elements(p_itens);
  get diagnostics v_lidos=row_count;

  if exists(select 1 from tmp_integracao where nullif(chave,'') is null or nullif(row_hash,'') is null) then
    raise exception using errcode='22023',message='Lote contém chave ou hash vazio.';
  end if;
  if exists(select 1 from tmp_integracao group by chave having count(*)>1) then
    raise exception using errcode='22023',message='Lote contém chaves de origem duplicadas.';
  end if;

  if v_entidade='FORNO' then
    select count(*) filter(where f.id is null),count(*) filter(where f.id is not null and f.row_hash is distinct from t.row_hash)
      into v_inseridos,v_atualizados
    from tmp_integracao t left join hd_kanban.fornos f on f.n_serie=t.chave;

    insert into hd_kanban.fornos(
      source_id,n_serie,cliente,modelo,data_venda,data_entrega,prazo,bancada,tensao,
      controlador,observacao,status_caixa,status_forno,source_updated_at,synced_at,row_hash
    ) select
      nullif(item->>'source_id',''),chave,nullif(item->>'cliente',''),nullif(item->>'modelo',''),
      nullif(item->>'data_venda','')::date,nullif(item->>'data_entrega','')::date,
      nullif(item->>'prazo','')::integer,nullif(item->>'bancada',''),nullif(item->>'tensao',''),
      nullif(item->>'controlador',''),nullif(item->>'observacao',''),
      case upper(coalesce(item->>'status_caixa','COMPRAR')) when 'COMPRADO' then 'COMPRADA' else upper(coalesce(item->>'status_caixa','COMPRAR')) end::hd_kanban.status_caixa,
      upper(coalesce(item->>'status_forno','FABRICAÇÃO'))::hd_kanban.status_forno,
      nullif(item->>'source_updated_at','')::timestamptz,now(),row_hash
    from tmp_integracao
    on conflict(n_serie) do update set
      source_id=excluded.source_id,cliente=excluded.cliente,modelo=excluded.modelo,
      data_venda=excluded.data_venda,data_entrega=excluded.data_entrega,prazo=excluded.prazo,
      bancada=excluded.bancada,tensao=excluded.tensao,controlador=excluded.controlador,
      observacao=excluded.observacao,status_caixa=excluded.status_caixa,status_forno=excluded.status_forno,
      source_updated_at=excluded.source_updated_at,synced_at=now(),row_hash=excluded.row_hash
    where hd_kanban.fornos.row_hash is distinct from excluded.row_hash;
  else
    select count(*) filter(where a.id is null),count(*) filter(where a.id is not null and a.row_hash is distinct from t.row_hash)
      into v_inseridos,v_atualizados
    from tmp_integracao t left join hd_kanban.apontamentos a on a.id_origem=t.chave;

    insert into hd_kanban.historico_troca_serie(
      apontamento_id_origem,n_serie_anterior,n_serie_nova,usuario_origem,origem,payload
    )
    select a.id_origem,a.n_serie,t.item->>'n_serie',nullif(t.item->>'usuario_origem',''),p_origem,t.item
    from tmp_integracao t join hd_kanban.apontamentos a on a.id_origem=t.chave
    where a.row_hash is distinct from t.row_hash and a.n_serie is distinct from t.item->>'n_serie';

    insert into hd_kanban.apontamentos(
      id_origem,n_serie,modelo_origem,cliente_origem,operacao,operador,data_hora,
      hora_inicial,hora_final,tempo_perdido,parcial,observacao,tempo_total,row_hash,
      source_updated_at,synced_at,source_deleted,deleted_at
    ) select
      chave,coalesce(nullif(item->>'n_serie',''),''),nullif(item->>'modelo_origem',''),
      nullif(item->>'cliente_origem',''),nullif(item->>'operacao',''),nullif(item->>'operador',''),
      nullif(item->>'data_hora','')::timestamptz,nullif(item->>'hora_inicial','')::timestamptz,
      nullif(item->>'hora_final','')::timestamptz,nullif(item->>'tempo_perdido',''),
      nullif(item->>'parcial',''),nullif(item->>'observacao',''),nullif(item->>'tempo_total',''),
      row_hash,nullif(item->>'source_updated_at','')::timestamptz,now(),
      coalesce((item->>'source_deleted')::boolean,false),
      case when coalesce((item->>'source_deleted')::boolean,false) then now() else null end
    from tmp_integracao
    on conflict(id_origem) do update set
      n_serie=excluded.n_serie,modelo_origem=excluded.modelo_origem,
      cliente_origem=excluded.cliente_origem,operacao=excluded.operacao,operador=excluded.operador,
      data_hora=excluded.data_hora,hora_inicial=excluded.hora_inicial,hora_final=excluded.hora_final,
      tempo_perdido=excluded.tempo_perdido,parcial=excluded.parcial,observacao=excluded.observacao,
      tempo_total=excluded.tempo_total,row_hash=excluded.row_hash,
      source_updated_at=excluded.source_updated_at,synced_at=now(),
      source_deleted=excluded.source_deleted,deleted_at=excluded.deleted_at
    where hd_kanban.apontamentos.row_hash is distinct from excluded.row_hash;
  end if;

  v_ignorados:=v_lidos-v_inseridos-v_atualizados;
  insert into hd_kanban.integracao_registros(entidade,chave_origem,row_hash,origem,linha_origem)
  select v_entidade,chave,row_hash,p_origem,nullif(item->>'linha_origem','')::integer from tmp_integracao
  on conflict(entidade,chave_origem) do update set
    row_hash=excluded.row_hash,origem=excluded.origem,linha_origem=excluded.linha_origem,
    ultima_sincronizacao=now()
  where hd_kanban.integracao_registros.row_hash is distinct from excluded.row_hash;

  v_resultado:=jsonb_build_object('ok',true,'entidade',v_entidade,'lidos',v_lidos,
    'inseridos',v_inseridos,'atualizados',v_atualizados,'ignorados',v_ignorados,
    'chave_idempotencia',p_chave_idempotencia,'repetido',false);
  insert into hd_kanban.sync_log(origem,tipo,status,registros_lidos,registros_inseridos,
    registros_atualizados,registros_ignorados,detalhes,fim)
  values(p_origem,'INTEGRACAO_2_LOTE','SUCESSO',v_lidos,v_inseridos,v_atualizados,
    v_ignorados,v_resultado,now());
  return v_resultado;
end $$;

revoke all on function hd_kanban.sincronizar_integracao_lote(text,text,jsonb,text) from public,anon,authenticated;
grant execute on function hd_kanban.sincronizar_integracao_lote(text,text,jsonb,text) to service_role;

create or replace function hd_kanban.saude_integracao()
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'ultima_sincronizacao',(select max(inicio) from hd_kanban.sync_log where status='SUCESSO'),
    'ultima_falha',(select max(inicio) from hd_kanban.sync_log where status='ERRO'),
    'pendentes',(select count(*) from hd_kanban.integracao_pendencias where status in ('PENDENTE','ERRO')),
    'processando',(select count(*) from hd_kanban.integracao_pendencias where status='PROCESSANDO'),
    'falhas_24h',(select count(*) from hd_kanban.sync_log where status='ERRO' and inicio>=now()-interval '24 hours'),
    'lidos_24h',(select coalesce(sum(registros_lidos),0) from hd_kanban.sync_log where inicio>=now()-interval '24 hours'),
    'gravados_24h',(select coalesce(sum(registros_inseridos+registros_atualizados),0) from hd_kanban.sync_log where inicio>=now()-interval '24 hours'),
    'ignorados_24h',(select coalesce(sum(registros_ignorados),0) from hd_kanban.sync_log where inicio>=now()-interval '24 hours'),
    'ultimos_lotes',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select inicio,origem,status,registros_lidos,registros_inseridos,registros_atualizados,registros_ignorados,erros,mensagem from hd_kanban.sync_log order by inicio desc limit 20)x)
  ) where coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA')='ADMIN'
$$;

revoke all on function hd_kanban.saude_integracao() from public,anon;
grant execute on function hd_kanban.saude_integracao() to authenticated;

