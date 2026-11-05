-- Expõe evidências produtivas explícitas para Kanban e PCP.
-- Não altera apontamentos nem dados operacionais.
create or replace view hd_kanban.kanban_fornos
with (security_invoker = true)
as
with validos as (
  select a.*,
    row_number() over(partition by a.n_serie order by coalesce(a.data_hora,a.hora_final,a.hora_inicial) desc nulls last,a.id desc) rn,
    count(*) over(partition by a.n_serie) total_validos,
    count(*) filter(where a.hora_inicial is not null and a.hora_final is null) over(partition by a.n_serie) abertos
  from hd_kanban.apontamentos a
  where not a.source_deleted
    and not a.orphan
    and nullif(trim(coalesce(a.operacao,'')),'') is not null
), ultimo as (
  select * from validos where rn=1
), evidencia as (
  select a.n_serie,
    count(*) as total_apontamentos_produtivos,
    max(coalesce(a.data_hora,a.hora_final,a.hora_inicial)) as ultima_movimentacao_produtiva,
    max(coalesce(a.data_hora,a.hora_final)) filter(
      where upper(trim(a.operacao)) like 'ACAB%'
        and a.hora_inicial is not null and a.hora_final is not null
    ) as data_finalizacao,
    bool_or(upper(trim(a.operacao)) like 'ACAB%' and a.hora_inicial is not null and a.hora_final is not null) as acabamento_concluido
  from validos a group by a.n_serie
)
select
  f.n_serie,f.cliente,f.modelo,f.data_venda,f.data_entrega,f.prazo,
  f.bancada,f.tensao,f.controlador,f.observacao,
  f.status_caixa::text status_caixa,f.status_forno::text status_forno,
  case
    when f.status_forno='FINALIZADO' then 'FINALIZADO'
    when coalesce(e.total_apontamentos_produtivos,0)=0 then 'A_PRODUZIR'
    else coalesce(u.operacao,'A_PRODUZIR')
  end operacao_atual,
  u.operacao ultima_operacao_concluida,
  e.ultima_movimentacao_produtiva ultima_movimentacao,
  coalesce(u.abertos,0)>0 apontamento_aberto,coalesce(u.abertos,0) apontamentos_abertos,
  u.operador operador_atual,u.hora_inicial hora_inicio_atual,
  case when f.data_entrega is null then null else f.data_entrega-current_date end dias_para_entrega,
  f.data_entrega<current_date and f.status_forno<>'FINALIZADO' atrasado,
  coalesce(p.prioridade,0) prioridade,coalesce(p.ordem_coluna,0) ordem_coluna,
  p.planejado_para,p.proxima_operacao_planejada,p.observacao_pcp,
  coalesce(p.bloqueado,false) bloqueado,p.motivo_bloqueio,
  greatest(f.updated_at,coalesce(u.updated_at,f.updated_at),coalesce(p.updated_at,f.updated_at)) updated_at,
  e.data_finalizacao,
  f.id as forno_id,
  coalesce(e.total_apontamentos_produtivos,0)>0 tem_apontamento_produtivo,
  coalesce(e.total_apontamentos_produtivos,0) total_apontamentos_produtivos,
  coalesce(e.acabamento_concluido,false) acabamento_concluido,
  case
    when f.status_forno='FINALIZADO' and coalesce(e.acabamento_concluido,false) then 'REGULAR'
    when f.status_forno='FINALIZADO' and coalesce(e.total_apontamentos_produtivos,0)=0 then 'DADOS_INSUFICIENTES'
    when f.status_forno='FINALIZADO' then 'INCONSISTENCIA_PRODUTIVA'
    when coalesce(e.acabamento_concluido,false) then 'INCONSISTENCIA_SINCRONIZACAO'
    else 'NAO_APLICAVEL'
  end situacao_finalizacao
from hd_kanban.fornos f
left join ultimo u on u.n_serie=f.n_serie
left join evidencia e on e.n_serie=f.n_serie
left join hd_kanban.planejamento_kanban p on p.n_serie=f.n_serie;

grant select on hd_kanban.kanban_fornos to authenticated;

