const day=86400000
export const dateOnly=value=>value?new Date(`${String(value).slice(0,10)}T12:00:00`):null
export function mondayOf(value=new Date()){
  const d=new Date(value);d.setHours(12,0,0,0);const weekday=d.getDay()||7;d.setDate(d.getDate()-weekday+1);return d
}
export function weeks(count=5,reference=new Date()){
  const first=mondayOf(reference)
  return Array.from({length:count},(_,index)=>{const start=new Date(first.getTime()+index*7*day),end=new Date(start.getTime()+6*day);return{index,start,end,key:start.toISOString().slice(0,10),label:index===0?'Semana atual':`Semana +${index}`}})
}
export function weekFor(card,periods){const date=dateOnly(card.planejado_para);return date?periods.find(w=>date>=w.start&&date<=w.end):undefined}
export function activeCards(cards){return cards.filter(c=>c.status_forno!=='FINALIZADO')}
export function demandByModel(cards){
  const totals=new Map()
  for(const card of activeCards(cards)){const model=String(card.modelo||'Não informado').trim()||'Não informado';totals.set(model,(totals.get(model)||0)+1)}
  return [...totals].map(([modelo,total])=>({modelo,total})).sort((a,b)=>b.total-a.total||a.modelo.localeCompare(b.modelo))
}
export function pcpMetrics(cards,reference=new Date()){
  const active=activeCards(cards),periods=weeks(5,reference),thisWeek=periods[0]
  const deliveryThisWeek=active.filter(c=>{const d=dateOnly(c.data_entrega);return d&&d>=thisWeek.start&&d<=thisWeek.end}).length
  const in15=new Date(reference);in15.setHours(23,59,59,999);in15.setDate(in15.getDate()+15)
  return{total:active.length,fabricacao:active.filter(c=>c.ultima_movimentacao).length,naoIniciados:active.filter(c=>!c.ultima_movimentacao).length,atrasados:active.filter(c=>c.atrasado).length,entregasSemana:deliveryThisWeek,entregas15:active.filter(c=>{const d=dateOnly(c.data_entrega);return d&&d>=reference&&d<=in15}).length,planejadosSemana:active.filter(c=>weekFor(c,[thisWeek])).length,semProgramacao:active.filter(c=>!c.planejado_para).length,bloqueados:active.filter(c=>c.bloqueado).length}
}
export function unplanned(cards){return activeCards(cards).filter(c=>!c.planejado_para).sort((a,b)=>Number(Boolean(b.atrasado))-Number(Boolean(a.atrasado))||String(a.data_entrega||'9999').localeCompare(String(b.data_entrega||'9999'))||Number(b.prioridade||0)-Number(a.prioridade||0))}

