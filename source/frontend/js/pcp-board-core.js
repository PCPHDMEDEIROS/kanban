const pad=value=>String(value).padStart(2,'0')

export function parseLocalDate(value){
  if(!value)return null
  const match=String(value).slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if(!match)return null
  const date=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]),12)
  return Number.isNaN(date.getTime())?null:date
}

export function dateKey(date){return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`}

export function mondayKey(value){
  const date=parseLocalDate(value)||new Date()
  date.setHours(12,0,0,0)
  date.setDate(date.getDate()-((date.getDay()+6)%7))
  return dateKey(date)
}

export function weekInterval(key){
  const start=parseLocalDate(key),end=parseLocalDate(key)
  if(!start)return null
  end.setDate(end.getDate()+6)
  return{start,end,label:`${start.toLocaleDateString('pt-BR')} a ${end.toLocaleDateString('pt-BR')}`}
}

export function planningColumns(cards,reference=new Date(),span=4){
  const referenceKey=dateKey(new Date(reference.getFullYear(),reference.getMonth(),reference.getDate(),12))
  const current=mondayKey(referenceKey),start=parseLocalDate(current)
  const known=new Set(cards.map(card=>card.planejado_para&&mondayKey(card.planejado_para)).filter(Boolean))
  for(let index=0;index<=span;index++){const day=new Date(start);day.setDate(day.getDate()+index*7);known.add(dateKey(day))}
  const toColumn=key=>({key,label:key===current?'Semana atual':`Semana de ${parseLocalDate(key).toLocaleDateString('pt-BR')}`,interval:weekInterval(key),past:key<current})
  return[{key:'UNPLANNED',label:'Sem programação',interval:null,past:false},...[...known].sort().map(toColumn)]
}

export function cardsInColumn(cards,key){return cards.filter(card=>key==='UNPLANNED'?!card.planejado_para:mondayKey(card.planejado_para)===key)}

export function joinLots(lots,links,cards){
  const cardById=new Map(cards.map(card=>[card.forno_id,card]))
  const linksByLot=new Map
  for(const link of links.filter(link=>link.ativo!==false)){if(!linksByLot.has(link.lote_id))linksByLot.set(link.lote_id,[]);linksByLot.get(link.lote_id).push(link)}
  return lots.filter(lot=>lot.status!=='CANCELADO').map(lot=>summarizeLot({...lot,fornoIds:(linksByLot.get(lot.id)||[]).map(link=>link.forno_id)},cards,cardById))
}

export function summarizeLot(lot,cards,cardById=new Map(cards.map(card=>[card.forno_id,card]))){
  const participants=[...new Set(lot.fornoIds||[])].map(id=>cardById.get(id)).filter(Boolean)
  const deliveries=participants.map(card=>parseLocalDate(card.data_entrega)).filter(Boolean)
  return{...lot,participants,quantity:participants.length,notStarted:participants.filter(card=>!card.tem_apontamento_produtivo&&card.status_forno!=='FINALIZADO').length,inProduction:participants.filter(card=>card.tem_apontamento_produtivo&&card.status_forno!=='FINALIZADO').length,finished:participants.filter(card=>card.status_forno==='FINALIZADO').length,delayed:participants.filter(card=>card.atrasado).length,critical:participants.filter(card=>Number(card.dias_para_entrega)>=0&&Number(card.dias_para_entrega)<=7&&card.status_forno!=='FINALIZADO').length,nearestDelivery:deliveries.length?new Date(Math.min(...deliveries)):null,latestDelivery:deliveries.length?new Date(Math.max(...deliveries)):null,materialIssues:participants.filter(card=>card.status_caixa==='COMPRAR').length}
}

export function unassignedPlanned(cards,links){
  const assigned=new Set(links.filter(link=>link.ativo!==false).map(link=>link.forno_id))
  return cards.filter(card=>card.planejado_para&&!assigned.has(card.forno_id))
}

export function paginate(items,visible=30){return{visible:items.slice(0,Math.max(0,visible)),total:items.length,hasMore:items.length>visible}}

export function sortBoardItems(items,order='DELIVERY'){
  const copy=[...items],serial=item=>String(item.n_serie||item.codigo||'')
  if(order==='PRIORITY')return copy.sort((a,b)=>Number(b.prioridade||0)-Number(a.prioridade||0)||String(a.data_entrega||'9999').localeCompare(String(b.data_entrega||'9999')))
  if(order==='SERIAL')return copy.sort((a,b)=>serial(a).localeCompare(serial(b),'pt-BR',{numeric:true}))
  if(order==='MODEL')return copy.sort((a,b)=>String(a.modelo||'').localeCompare(String(b.modelo||''),'pt-BR')||serial(a).localeCompare(serial(b),'pt-BR',{numeric:true}))
  return copy.sort((a,b)=>String(a.data_entrega||'9999').localeCompare(String(b.data_entrega||'9999')))
}

