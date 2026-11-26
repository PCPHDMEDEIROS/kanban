-- Reprogramação do PCP. Não altera fornos, apontamentos ou execução produtiva.
alter table hd_kanban.lotes_producao
  add column if not exists versao integer not null default 1 check (versao > 0);

create table if not exists hd_kanban.auditoria_pcp(
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  objeto_tipo text not null,
  objeto_id uuid not null,
  valores_anteriores jsonb not null default '{}'::jsonb,
  valores_novos jsonb not null default '{}'::jsonb,
  justificativa text,
  usuario uuid not null references auth.users(id),
  criado_em timestamptz not null default now()
);

create index if not exists auditoria_pcp_objeto_idx
  on hd_kanban.auditoria_pcp(objeto_tipo,objeto_id,criado_em desc);
create index if not exists auditoria_pcp_usuario_idx
  on hd_kanban.auditoria_pcp(usuario,criado_em desc);

alter table hd_kanban.auditoria_pcp enable row level security;
grant select,insert on hd_kanban.auditoria_pcp to authenticated;
drop policy if exists leitura_auditoria_pcp on hd_kanban.auditoria_pcp;
create policy leitura_auditoria_pcp on hd_kanban.auditoria_pcp
  for select to authenticated using(true);
drop policy if exists grava_auditoria_pcp on hd_kanban.auditoria_pcp;
create policy grava_auditoria_pcp on hd_kanban.auditoria_pcp
  for insert to authenticated with check(
    usuario=(select auth.uid())
    and coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA') in ('ADMIN','PCP')
  );

create or replace function hd_kanban.reprogramar_pcp(
  p_tipo text,
  p_objeto_id uuid,
  p_nova_semana date,
  p_versoes jsonb,
  p_justificativa text,
  p_lote_destino uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_role text := coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA');
  v_tipo text := upper(trim(coalesce(p_tipo,'')));
  v_justificativa text := nullif(trim(coalesce(p_justificativa,'')),'');
  v_lote hd_kanban.lotes_producao%rowtype;
  v_destino hd_kanban.lotes_producao%rowtype;
  v_planejamento hd_kanban.planejamento_kanban%rowtype;
  v_forno hd_kanban.fornos%rowtype;
  v_vinculo hd_kanban.lote_fornos%rowtype;
  v_item record;
  v_esperada integer;
  v_afetados integer := 0;
  v_antes jsonb;
  v_depois jsonb;
begin
  if v_usuario is null or v_role not in ('ADMIN','PCP') then
    raise exception using errcode='42501',message='Usuário sem permissão para reprogramar.';
  end if;
  if v_tipo not in ('FORNO','LOTE') then
    raise exception using errcode='22023',message='Tipo de movimentação inválido.';
  end if;
  if v_justificativa is null then
    raise exception using errcode='22023',message='Informe a justificativa da reprogramação.';
  end if;
  if p_nova_semana is not null and extract(isodow from p_nova_semana)<>1 then
    raise exception using errcode='22023',message='A semana planejada deve iniciar em uma segunda-feira.';
  end if;

  if v_tipo='LOTE' then
    select * into v_lote from hd_kanban.lotes_producao
      where id=p_objeto_id for update;
    if not found or v_lote.status='CANCELADO' then
      raise exception using errcode='P0002',message='Lote ativo não encontrado.';
    end if;
    v_esperada:=coalesce((p_versoes->>'lote')::integer,0);
    if v_lote.versao<>v_esperada then
      raise exception using errcode='40001',message='O lote foi alterado por outro usuário. Recarregue o quadro.';
    end if;

    for v_item in
      select p.* from hd_kanban.lote_fornos lf
      join hd_kanban.planejamento_kanban p on p.forno_id=lf.forno_id
      where lf.lote_id=v_lote.id and lf.ativo
      order by p.id for update of p
    loop
      v_esperada:=coalesce((p_versoes->>v_item.forno_id::text)::integer,0);
      if v_item.versao<>v_esperada then
        raise exception using errcode='40001',message=format('O planejamento da série %s foi alterado. Recarregue o quadro.',v_item.n_serie);
      end if;
      v_afetados:=v_afetados+1;
    end loop;
    if v_afetados=0 then
      raise exception using errcode='P0002',message='O lote não possui participantes ativos planejados.';
    end if;

    v_antes:=jsonb_build_object('semana',v_lote.semana_planejada,'versao',v_lote.versao,'fornos',v_afetados);
    update hd_kanban.lotes_producao
      set semana_planejada=p_nova_semana,justificativa=v_justificativa,
          versao=versao+1,updated_at=now()
      where id=v_lote.id;
    update hd_kanban.planejamento_kanban p
      set planejado_para=p_nova_semana,observacao_pcp=v_justificativa,
          updated_by=v_usuario,origem='REPROGRAMACAO',versao=p.versao+1,updated_at=now()
      from hd_kanban.lote_fornos lf
      where lf.lote_id=v_lote.id and lf.ativo and p.forno_id=lf.forno_id;
    v_depois:=jsonb_build_object('semana',p_nova_semana,'versao',v_lote.versao+1,'fornos',v_afetados);

  else
    select * into v_forno from hd_kanban.fornos where id=p_objeto_id;
    if not found or v_forno.status_forno='FINALIZADO'::hd_kanban.status_forno then
      raise exception using errcode='P0002',message='Forno pendente não encontrado.';
    end if;
    select * into v_planejamento from hd_kanban.planejamento_kanban
      where forno_id=v_forno.id for update;
    v_esperada:=coalesce((p_versoes->>v_forno.id::text)::integer,0);
    if found and v_planejamento.versao<>v_esperada then
      raise exception using errcode='40001',message='O planejamento foi alterado por outro usuário. Recarregue o quadro.';
    end if;
    if not found and v_esperada<>0 then
      raise exception using errcode='40001',message='O estado do planejamento mudou. Recarregue o quadro.';
    end if;
    select * into v_vinculo from hd_kanban.lote_fornos
      where forno_id=v_forno.id and ativo for update;

    if p_lote_destino is not null then
      select * into v_destino from hd_kanban.lotes_producao
        where id=p_lote_destino for update;
      if not found or v_destino.status='CANCELADO'
         or v_destino.modelo is distinct from v_forno.modelo
         or v_destino.semana_planejada is distinct from p_nova_semana then
        raise exception using errcode='22023',message='O lote de destino é incompatível com o forno ou a semana.';
      end if;
    end if;

    v_antes:=jsonb_build_object(
      'semana',v_planejamento.planejado_para,
      'versao',coalesce(v_planejamento.versao,0),
      'lote_id',v_vinculo.lote_id
    );
    if v_planejamento.id is null then
      insert into hd_kanban.planejamento_kanban(
        forno_id,n_serie,planejado_para,planejamento_original_para,
        observacao_pcp,updated_by,origem,versao
      ) values (
        v_forno.id,v_forno.n_serie,p_nova_semana,p_nova_semana,
        v_justificativa,v_usuario,'MANUAL',1
      );
    else
      update hd_kanban.planejamento_kanban
        set planejado_para=p_nova_semana,observacao_pcp=v_justificativa,
            updated_by=v_usuario,origem='REPROGRAMACAO',versao=versao+1,updated_at=now()
        where id=v_planejamento.id;
    end if;

    if v_vinculo.lote_id is not null and v_vinculo.lote_id is distinct from p_lote_destino then
      update hd_kanban.lote_fornos set ativo=false
        where lote_id=v_vinculo.lote_id and forno_id=v_forno.id and ativo;
    end if;
    if p_lote_destino is not null then
      insert into hd_kanban.lote_fornos(lote_id,forno_id,adicionado_por,ativo)
      values(p_lote_destino,v_forno.id,v_usuario,true)
      on conflict(lote_id,forno_id) do update
        set ativo=true,adicionado_por=excluded.adicionado_por,adicionado_em=now();
    end if;
    v_afetados:=1;
    v_depois:=jsonb_build_object(
      'semana',p_nova_semana,
      'versao',coalesce(v_planejamento.versao,0)+1,
      'lote_id',p_lote_destino
    );
  end if;

  insert into hd_kanban.auditoria_pcp(
    tipo,objeto_tipo,objeto_id,valores_anteriores,valores_novos,justificativa,usuario
  ) values (
    'REPROGRAMACAO',v_tipo,p_objeto_id,v_antes,v_depois,v_justificativa,v_usuario
  );
  return jsonb_build_object('tipo',v_tipo,'objeto_id',p_objeto_id,'afetados',v_afetados,'semana',p_nova_semana);
end $$;

revoke all on function hd_kanban.reprogramar_pcp(text,uuid,date,jsonb,text,uuid)
  from public,anon;
grant execute on function hd_kanban.reprogramar_pcp(text,uuid,date,jsonb,text,uuid)
  to authenticated;

