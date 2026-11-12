-- Estrutura de homologação: não altera apontamentos nem execução produtiva.
alter table hd_kanban.planejamento_kanban
  add column if not exists forno_id uuid references hd_kanban.fornos(id),
  add column if not exists versao integer not null default 1 check (versao > 0),
  add column if not exists origem text not null default 'MANUAL'
    check (origem in ('MANUAL','SUGESTAO_AUTOMATICA','REPROGRAMACAO')),
  add column if not exists simulacao_id uuid references hd_kanban.cenarios_simulacao(id),
  add column if not exists planejamento_original_para date;

update hd_kanban.planejamento_kanban p
set forno_id=f.id
from hd_kanban.fornos f
where p.forno_id is null and f.n_serie=p.n_serie;

create unique index if not exists planejamento_forno_id_uniq
  on hd_kanban.planejamento_kanban(forno_id) where forno_id is not null;

alter table hd_kanban.lotes_producao
  add column if not exists configuracao jsonb not null default '{}'::jsonb,
  add column if not exists prioridade integer not null default 0 check (prioridade between 0 and 3),
  add column if not exists aprovado_por uuid references auth.users(id),
  add column if not exists aprovado_em timestamptz;

alter table hd_kanban.lote_fornos
  add column if not exists ativo boolean not null default true;

create unique index if not exists lote_forno_ativo_uniq
  on hd_kanban.lote_fornos(forno_id) where ativo;

alter table hd_kanban.cenarios_simulacao
  add column if not exists base_atualizada_em timestamptz not null default now(),
  add column if not exists versao integer not null default 1 check (versao > 0),
  add column if not exists aprovado_em timestamptz;

create table if not exists hd_kanban.aprovacoes_planejamento(
  id uuid primary key default gen_random_uuid(),
  simulacao_id uuid not null references hd_kanban.cenarios_simulacao(id),
  tipo text not null check (tipo in ('TOTAL','PARCIAL')),
  snapshot jsonb not null,
  justificativa text,
  aprovado_por uuid not null references auth.users(id),
  aprovado_em timestamptz not null default now()
);

alter table hd_kanban.aprovacoes_planejamento enable row level security;
grant select,insert on hd_kanban.aprovacoes_planejamento to authenticated;
create policy leitura_aprovacoes_planejamento
  on hd_kanban.aprovacoes_planejamento for select to authenticated using (true);
create policy insere_aprovacoes_planejamento
  on hd_kanban.aprovacoes_planejamento for insert to authenticated
  with check (
    aprovado_por=(select auth.uid()) and
    coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA') in ('ADMIN','PCP')
  );

grant update on hd_kanban.lote_fornos to authenticated;
create policy atualiza_lote_fornos
  on hd_kanban.lote_fornos for update to authenticated
  using (coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA') in ('ADMIN','PCP'))
  with check (coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA') in ('ADMIN','PCP'));

create index if not exists aprovacoes_simulacao_idx
  on hd_kanban.aprovacoes_planejamento(simulacao_id,aprovado_em desc);
create index if not exists aprovacoes_usuario_idx
  on hd_kanban.aprovacoes_planejamento(aprovado_por);

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
  v_lote_id uuid;
  v_aprovacao_id uuid := gen_random_uuid();
begin
  if v_usuario is null or v_role not in ('ADMIN','PCP') then
    raise exception using errcode='42501',message='Usuário sem permissão para aprovar programação.';
  end if;
  if jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens)=0 then
    raise exception using errcode='22023',message='Selecione ao menos um item para aprovação.';
  end if;

  select * into v_simulacao from hd_kanban.cenarios_simulacao
  where id=p_simulacao_id and created_by=v_usuario for update;
  if not found then raise exception using errcode='P0002',message='Simulação não encontrada ou não pertence ao usuário.'; end if;
  if v_simulacao.status<>'RASCUNHO' then raise exception using errcode='P0001',message='A simulação não está disponível para aprovação.'; end if;
  if v_simulacao.versao<>p_versao_esperada then raise exception using errcode='40001',message='A simulação foi alterada. Recarregue antes de aprovar.'; end if;

  insert into hd_kanban.aprovacoes_planejamento(id,simulacao_id,tipo,snapshot,justificativa,aprovado_por)
  values(v_aprovacao_id,p_simulacao_id,case when jsonb_array_length(p_itens)=jsonb_array_length(coalesce(v_simulacao.dados->'itens','[]'::jsonb)) then 'TOTAL' else 'PARCIAL' end,p_itens,nullif(trim(p_justificativa),''),v_usuario);

  for v_item in select value from jsonb_array_elements(p_itens) loop
    select * into v_forno from hd_kanban.fornos where id=(v_item->>'forno_id')::uuid for update;
    if not found or v_forno.status_forno='FINALIZADO'::hd_kanban.status_forno then
      raise exception using errcode='P0001',message='Forno inelegível ou inexistente na aprovação.';
    end if;

    select * into v_planejamento from hd_kanban.planejamento_kanban where forno_id=v_forno.id for update;
    if found and coalesce((v_item->>'versao_esperada')::integer,0)<>v_planejamento.versao then
      raise exception using errcode='40001',message=format('Conflito de planejamento no forno %s.',v_forno.n_serie);
    end if;

    if nullif(v_item->>'lote_codigo','') is not null then
      insert into hd_kanban.lotes_producao(codigo,modelo,semana_planejada,status,configuracao,prioridade,justificativa,created_by,aprovado_por,aprovado_em)
      values(v_item->>'lote_codigo',coalesce(v_item->>'modelo',v_forno.modelo),(v_item->>'semana_planejada')::date,'PLANEJADO',coalesce(v_item->'configuracao','{}'::jsonb),coalesce((v_item->>'prioridade')::integer,0),nullif(trim(p_justificativa),''),v_usuario,v_usuario,now())
      on conflict(codigo) do update set semana_planejada=excluded.semana_planejada,prioridade=excluded.prioridade,updated_at=now()
      returning id into v_lote_id;
      update hd_kanban.lote_fornos set ativo=false where forno_id=v_forno.id and ativo and lote_id<>v_lote_id;
      insert into hd_kanban.lote_fornos(lote_id,forno_id,adicionado_por,ativo)
      values(v_lote_id,v_forno.id,v_usuario,true)
      on conflict(lote_id,forno_id) do update set ativo=true,adicionado_por=excluded.adicionado_por,adicionado_em=now();
    end if;

    insert into hd_kanban.planejamento_kanban(forno_id,n_serie,planejado_para,planejamento_original_para,prioridade,prioridade_manual,observacao_pcp,updated_by,origem,simulacao_id,versao)
    values(v_forno.id,v_forno.n_serie,(v_item->>'semana_planejada')::date,(v_item->>'semana_planejada')::date,coalesce((v_item->>'prioridade')::integer,0),false,nullif(trim(p_justificativa),''),v_usuario,'SUGESTAO_AUTOMATICA',p_simulacao_id,1)
    on conflict(n_serie) do update set forno_id=excluded.forno_id,planejado_para=excluded.planejado_para,prioridade=excluded.prioridade,observacao_pcp=excluded.observacao_pcp,updated_by=excluded.updated_by,origem=case when hd_kanban.planejamento_kanban.planejado_para is distinct from excluded.planejado_para then 'REPROGRAMACAO' else excluded.origem end,simulacao_id=excluded.simulacao_id,versao=hd_kanban.planejamento_kanban.versao+1,planejamento_original_para=coalesce(hd_kanban.planejamento_kanban.planejamento_original_para,excluded.planejamento_original_para),updated_at=now();
  end loop;

  update hd_kanban.cenarios_simulacao set status='PUBLICADO',aprovado_em=now(),updated_at=now(),versao=versao+1 where id=p_simulacao_id;
  return v_aprovacao_id;
end $$;

revoke all on function hd_kanban.aprovar_simulacao_pcp(uuid,integer,jsonb,text) from public,anon;
grant execute on function hd_kanban.aprovar_simulacao_pcp(uuid,integer,jsonb,text) to authenticated;

