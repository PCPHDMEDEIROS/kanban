import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'

const db=new PGlite()
const bootstrap=`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema hd_kanban;
create function auth.jwt() returns jsonb language sql stable as $$select '{"app_metadata":{"hd_role":"ADMIN"}}'::jsonb$$;
create type hd_kanban.status_caixa as enum('COMPRAR','ESTOQUE','COMPRADA');
create type hd_kanban.status_forno as enum('FABRICAÇÃO','FINALIZADO');
create table hd_kanban.fornos(id uuid primary key default gen_random_uuid(),n_serie text not null unique,cliente text,modelo text,data_venda date,data_entrega date,prazo integer,bancada text,tensao text,controlador text,observacao text,status_caixa hd_kanban.status_caixa not null default 'COMPRAR',status_forno hd_kanban.status_forno not null default 'FABRICAÇÃO',source_id text,source_updated_at timestamptz,synced_at timestamptz not null default now(),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table hd_kanban.apontamentos(id uuid primary key default gen_random_uuid(),id_origem text not null unique,n_serie text not null,modelo_origem text,cliente_origem text,operacao text,operador text,data_hora timestamptz,hora_inicial timestamptz,hora_final timestamptz,tempo_perdido text,parcial text,observacao text,tempo_total text,row_hash text,source_updated_at timestamptz,synced_at timestamptz not null default now(),source_deleted boolean not null default false,deleted_at timestamptz,orphan boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table hd_kanban.historico_troca_serie(id uuid primary key default gen_random_uuid(),apontamento_id_origem text not null,n_serie_anterior text,n_serie_nova text,usuario_origem text,origem text not null,data_hora timestamptz not null default now(),payload jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
create unique index historico_troca_unica_idx on hd_kanban.historico_troca_serie(apontamento_id_origem,n_serie_anterior,n_serie_nova,origem);
create table hd_kanban.sync_log(id uuid primary key default gen_random_uuid(),origem text,tipo text,status text,registros_lidos integer default 0,registros_inseridos integer default 0,registros_atualizados integer default 0,registros_ignorados integer default 0,erros integer default 0,mensagem text,detalhes jsonb not null default '{}'::jsonb,inicio timestamptz not null default now(),fim timestamptz,created_at timestamptz not null default now());
create table hd_kanban.alertas_pcp(id uuid primary key default gen_random_uuid(),forno_id uuid not null,tipo text not null,motivo text not null,status text not null default 'ABERTO',chave_evento text not null unique,created_at timestamptz not null default now(),resolved_at timestamptz);
alter table hd_kanban.sync_log enable row level security; create policy admin_le_sync_log on hd_kanban.sync_log for select to authenticated using(coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA')='ADMIN'); grant select on hd_kanban.sync_log to authenticated;
create function hd_kanban.status_apontamento() returns trigger language plpgsql security definer set search_path='' as $$declare v_forno uuid;begin select id into v_forno from hd_kanban.fornos where n_serie=new.n_serie;if regexp_replace(upper(coalesce(new.operacao,'')),'[^A-Z0-9]','','g')='MONTGERAL' then update hd_kanban.fornos set status_caixa='COMPRADA' where id=v_forno;insert into hd_kanban.alertas_pcp(forno_id,tipo,motivo,chave_evento)values(v_forno,'MONTAGEM','Teste','HML:'||new.id_origem)on conflict(chave_evento)do nothing;end if;if regexp_replace(upper(coalesce(new.operacao,'')),'[^A-Z0-9]','','g')='ACAB' and new.hora_inicial is not null and new.hora_final is not null then update hd_kanban.fornos set status_forno='FINALIZADO' where id=v_forno;end if;return new;end$$;
create trigger apontamento_status after insert or update on hd_kanban.apontamentos for each row execute function hd_kanban.status_apontamento();
`

await db.exec(bootstrap)
await db.exec(await readFile(new URL('../supabase/migrations/20261126170000_integracao_2_0.sql',import.meta.url),'utf8'))
await db.exec(await readFile(new URL('../supabase/migrations/20261126180000_corrige_tmp_integracao.sql',import.meta.url),'utf8'))
await db.exec(await readFile(new URL('../supabase/migrations/20261126190000_conclusao_integracao_2_0.sql',import.meta.url),'utf8'))
await db.exec(await readFile(new URL('./homologacao_integracao_2.sql',import.meta.url),'utf8'))
const result=await db.query(`select to_regprocedure('hd_kanban.sincronizar_integracao_lote(text,text,jsonb,text)') is not null rpc_ok,to_regprocedure('hd_kanban.saude_integracao()') is not null health_ok,to_regprocedure('hd_kanban.diagnostico_integracao_detalhado()') is not null diagnostic_ok,to_regprocedure('hd_kanban.registrar_auditoria_integracao(text,text,jsonb,timestamptz)') is not null audit_ok,has_table_privilege('service_role','hd_kanban.alertas_pcp','INSERT') alerta_grant,to_regclass('hd_kanban.auditoria_horarios') is not null time_audit_ok`)
const row=result.rows[0]
if(!row.rpc_ok||!row.health_ok||!row.diagnostic_ok||!row.audit_ok||!row.alerta_grant||!row.time_audit_ok)throw new Error(`Contrato incompleto: ${JSON.stringify(row)}`)
console.log(JSON.stringify({ok:true,...row}))
await db.close()


