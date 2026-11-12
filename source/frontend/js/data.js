export const KANBAN_FIELDS='forno_id,n_serie,cliente,modelo,tensao,controlador,data_entrega,status_caixa,status_forno,operacao_atual,ultima_operacao_concluida,ultima_movimentacao,apontamento_aberto,apontamentos_abertos,tem_apontamento_produtivo,total_apontamentos_produtivos,acabamento_concluido,situacao_finalizacao,operador_atual,hora_inicio_atual,dias_para_entrega,atrasado,prioridade,ordem_coluna,planejado_para,proxima_operacao_planejada,observacao_pcp,bloqueado,motivo_bloqueio,updated_at,data_finalizacao'

export async function fetchAllCards(supabase,{pageSize=500}={}){
  const rows=[];let from=0,total=null
  while(total===null||from<total){
    const query=supabase.schema('hd_kanban').from('kanban_fornos').select(KANBAN_FIELDS,{count:from===0?'exact':undefined}).order('ordem_coluna').range(from,from+pageSize-1)
    const {data,error,count}=await query
    if(error)throw error
    if(total===null)total=count??data.length
    rows.push(...(data??[]))
    if(!data?.length||data.length<pageSize)break
    from+=pageSize
  }
  return{rows,total:total??rows.length,complete:rows.length===(total??rows.length)}
}

