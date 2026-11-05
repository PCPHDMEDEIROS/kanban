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
export const hasProduction=card=>card.tem_apontamento_produtivo===true||(!('tem_apontamento_produtivo' in card)&&Boolean(card.ultima_movimentacao))
export function demandByModel(cards){
  const totals=new Map()
  for(const card of activeCards(cards)){const model=String(card.modelo||'Não informado').trim()||'Não informado';totals.set(model,(totals.get(model)||0)+1)}
  return [...totals].map(([modelo,total])=>({modelo,total})).sort((a,b)=>b.total-a.total||a.modelo.localeCompare(b.modelo))
}
export function pcpMetrics(cards,reference=new Date()){
  const active=activeCards(cards),periods=weeks(5,reference),thisWeek=periods[0]
  const deliveryThisWeek=active.filter(c=>{const d=dateOnly(c.data_entrega);return d&&d>=thisWeek.start&&d<=thisWeek.end}).length
  const in15=new Date(reference);in15.setHours(23,59,59,999);in15.setDate(in15.getDate()+15)
  return{total:active.length,fabricacao:active.filter(hasProduction).length,aProduzir:active.filter(c=>!hasProduction(c)).length,atrasados:active.filter(c=>c.atrasado).length,entregasSemana:deliveryThisWeek,entregas15:active.filter(c=>{const d=dateOnly(c.data_entrega);return d&&d>=reference&&d<=in15}).length,planejadosSemana:active.filter(c=>weekFor(c,[thisWeek])).length,planejados:active.filter(c=>c.planejado_para).length,semProgramacao:active.filter(c=>!c.planejado_para).length,bloqueados:active.filter(c=>c.bloqueado).length}
}
export function unplanned(cards){return activeCards(cards).filter(c=>!c.planejado_para).sort((a,b)=>Number(Boolean(b.atrasado))-Number(Boolean(a.atrasado))||String(a.data_entrega||'9999').localeCompare(String(b.data_entrega||'9999'))||Number(b.prioridade||0)-Number(a.prioridade||0))}
export function suggestLots(cards,minSize=2){
  const groups=new Map()
  for(const card of activeCards(cards)){const model=String(card.modelo||'').trim();if(!model)continue;if(!groups.has(model))groups.set(model,[]);groups.get(model).push(card)}
  return[...groups].filter(([,items])=>items.length>=minSize).map(([modelo,items])=>({modelo,series:items.map(x=>x.n_serie),quantidade:items.length,justificativa:`Mesmo modelo (${modelo}); compatibilidade entre modelos diferentes não presumida`})).sort((a,b)=>b.quantidade-a.quantidade)
}
export function deliveryRisk(card){
  if(card.status_forno==='FINALIZADO')return{level:'FINALIZADO',reason:'Produção concluída'}
  if(card.atrasado)return{level:'CRÍTICO',reason:'Data de entrega vencida'}
  if(card.data_entrega==null)return{level:'INDETERMINADO',reason:'Data de entrega não informada'}
  if(card.dias_para_entrega<=7&&!card.tem_apontamento_produtivo)return{level:'CRÍTICO',reason:'Entrega em até 7 dias e produção não iniciada'}
  if(card.dias_para_entrega<=15)return{level:'ATENÇÃO',reason:'Entrega prevista em até 15 dias'}
  return{level:'INDETERMINADO',reason:'Capacidade e tempos produtivos ainda não configurados'}
}
export function electricalCandidates(cards){return activeCards(cards).filter(c=>{const op=String(c.operacao_atual||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();return op.includes('MONT')&&op.includes('GERAL')||Boolean(c.planejado_para)}).sort((a,b)=>String(a.planejado_para||a.data_entrega||'9999').localeCompare(String(b.planejado_para||b.data_entrega||'9999')))}
export function simulateWeek(cards,changes){const map=new Map(changes.map(x=>[String(x.n_serie),x.planejado_para]));return cards.map(c=>map.has(String(c.n_serie))?{...c,planejado_para:map.get(String(c.n_serie)),simulado:true}:c)}

