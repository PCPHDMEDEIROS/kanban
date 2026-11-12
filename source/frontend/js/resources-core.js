const number=value=>value==null||value===''?null:Number(value)

export function availableCapacity(record){
  const hours=number(record.horas_semanais),efficiency=number(record.eficiencia),operators=number(record.quantidade_operadores)
  if(hours==null||efficiency==null||operators==null)return null
  return Math.round(hours*efficiency*operators*100)/100
}

export function capacityStatus(load,capacity){
  if(capacity==null||capacity<=0)return{occupancy:null,label:'Capacidade não validada',level:'unknown'}
  const occupancy=load/capacity*100
  return{occupancy,label:occupancy>100?'Sobrecarga':occupancy>=85?'Atenção':'Disponível',level:occupancy>100?'overload':occupancy>=85?'warning':'ok'}
}

export function capacityForDate(records,operationId,date){
  const key=String(date||'').slice(0,10)
  return records.filter(row=>row.operacao_id===operationId&&row.vigencia_inicio<=key&&(!row.vigencia_fim||row.vigencia_fim>=key)).sort((a,b)=>b.vigencia_inicio.localeCompare(a.vigencia_inicio))[0]||null
}

export function electricalCandidatesWithState(cards,preparations=[]){
  const state=new Map(preparations.map(row=>[row.forno_id,row]))
  return cards.filter(card=>card.status_forno!=='FINALIZADO').filter(card=>{
    const operation=String(card.operacao_atual||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
    return Boolean(card.planejado_para)||operation.includes('MONT')&&operation.includes('GERAL')||state.has(card.forno_id)
  }).map(card=>({...card,preparacao:state.get(card.forno_id)||null})).sort((a,b)=>String(a.planejado_para||a.data_entrega||'9999').localeCompare(String(b.planejado_para||b.data_entrega||'9999')))
}

export const ELECTRICAL_STATUSES=['AGUARDANDO_PROGRAMACAO','PREPARACAO_NECESSARIA','MATERIAIS_EM_SEPARACAO','MATERIAIS_PRONTOS','MATERIAIS_INDISPONIVEIS','PREPARACAO_CONCLUIDA']

