import {dateKey,mondayKey,parseLocalDate} from './pcp-board-core.js'

const configKey=card=>[card.modelo,card.tensao,card.controlador].map(value=>String(value||'NÃO INFORMADO').trim().toUpperCase()).join(' | ')
const pending=card=>!['FINALIZADO','CANCELADO'].includes(String(card.status_forno||'').toUpperCase())
const addDays=(date,days)=>{const result=new Date(date);result.setDate(result.getDate()+days);return result}

export function validatePeriod(from,to){const start=parseLocalDate(from),end=parseLocalDate(to);if(!start||!end)return{valid:false,error:'Informe as datas inicial e final.'};if(end<start)return{valid:false,error:'A data final não pode ser anterior à inicial.'};return{valid:true,from:start,to:end}}

export function filterPortfolio(cards,filters={}){
  const period=validatePeriod(filters.from,filters.to);if(!period.valid)return{cards:[],excludedLate:0,error:period.error}
  const active=cards.filter(pending),before=active.filter(card=>{const delivery=parseLocalDate(card.data_entrega);return delivery&&delivery<period.from}).length
  const list=active.filter(card=>{
    const delivery=parseLocalDate(card.data_entrega),inPeriod=delivery&&delivery>=period.from&&delivery<=period.to,includeLate=filters.includeLate&&delivery&&delivery<period.from,started=card.tem_apontamento_produtivo===true,production=filters.production||'ALL'
    return(inPeriod||includeLate)&&(!filters.model||card.modelo===filters.model)&&(!filters.client||String(card.cliente||'').toLowerCase().includes(String(filters.client).toLowerCase()))&&(!filters.box||card.status_caixa===filters.box)&&(production==='ALL'||production==='NOT_STARTED'&&!started||production==='STARTED'&&started)&&(filters.scheduling!=='UNPLANNED'||!card.planejado_para)&&(filters.scheduling!=='PLANNED'||Boolean(card.planejado_para))
  })
  return{cards:list,excludedLate:filters.includeLate?0:before,error:null}
}

export function portfolioSummary(cards){
  const dates=cards.map(card=>parseLocalDate(card.data_entrega)).filter(Boolean),groups=new Map
  for(const card of cards){const key=configKey(card);if(!groups.has(key))groups.set(key,{key,modelo:card.modelo||'Não informado',tensao:card.tensao||'Não informada',controlador:card.controlador||'Não informado',quantidade:0,naoIniciados:0,fabricacao:0,prazos:[]});const group=groups.get(key);group.quantidade++;card.tem_apontamento_produtivo?group.fabricacao++:group.naoIniciados++;const delivery=parseLocalDate(card.data_entrega);if(delivery)group.prazos.push(delivery)}
  return{total:cards.length,naoIniciados:cards.filter(card=>!card.tem_apontamento_produtivo).length,fabricacao:cards.filter(card=>card.tem_apontamento_produtivo).length,programados:cards.filter(card=>card.planejado_para).length,semProgramacao:cards.filter(card=>!card.planejado_para).length,atrasados:cards.filter(card=>card.atrasado).length,prioridadeAlta:cards.filter(card=>Number(card.prioridade)>=2).length,primeiroPrazo:dates.length?new Date(Math.min(...dates)):null,ultimoPrazo:dates.length?new Date(Math.max(...dates)):null,groups:[...groups.values()].map(group=>({...group,primeiroPrazo:group.prazos.length?new Date(Math.min(...group.prazos)):null,ultimoPrazo:group.prazos.length?new Date(Math.max(...group.prazos)):null})).sort((a,b)=>b.quantidade-a.quantidade||a.key.localeCompare(b.key))}
}

export function productiveDays(from,to,exceptions=[]){const blocked=new Set(exceptions.filter(item=>item.working===false).map(item=>item.date)),extra=new Set(exceptions.filter(item=>item.working===true).map(item=>item.date));let total=0;for(const cursor=new Date(from);cursor<=to;cursor.setDate(cursor.getDate()+1)){const key=dateKey(cursor),weekday=cursor.getDay()>=1&&cursor.getDay()<=5;if((weekday&&!blocked.has(key))||extra.has(key))total++}return total}

export function shiftProductiveDays(value,amount,exceptions=[]){const date=new Date(value),direction=amount<0?-1:1;let remaining=Math.abs(amount);while(remaining){date.setDate(date.getDate()+direction);if(productiveDays(date,date,exceptions))remaining--}return date}

export function weeklyTargets(month,monthlyTarget=100,exceptions=[]){const start=parseLocalDate(`${month}-01`),end=new Date(start.getFullYear(),start.getMonth()+1,0,12),days=productiveDays(start,end,exceptions);if(!days)return[];const result=[];for(let cursor=parseLocalDate(mondayKey(dateKey(start)));cursor<=end;cursor=addDays(cursor,7)){const from=cursor<start?start:cursor,to=addDays(cursor,6)>end?end:addDays(cursor,6),weekDays=productiveDays(from,to,exceptions);if(weekDays)result.push({week:dateKey(cursor),days:weekDays,target:Number((monthlyTarget*weekDays/days).toFixed(2))})}return result}

export function weeklyReference(week,monthlyTarget=100,exceptions=[]){const start=parseLocalDate(mondayKey(week));let total=0;for(let offset=0;offset<7;offset++){const day=addDays(start,offset);if(!productiveDays(day,day,exceptions))continue;const month=dateKey(day).slice(0,7),monthStart=parseLocalDate(`${month}-01`),monthEnd=new Date(day.getFullYear(),day.getMonth()+1,0,12),monthDays=productiveDays(monthStart,monthEnd,exceptions);if(monthDays)total+=monthlyTarget/monthDays}return Number(total.toFixed(2))}

export function existingOccupancy(commitments,excludedIds=new Set){const result=new Map;for(const card of commitments){if(!pending(card)||!card.planejado_para||excludedIds.has(card.forno_id))continue;const week=mondayKey(card.planejado_para);result.set(week,(result.get(week)||0)+1)}return result}

function uniqueLotCode(week,cards,used){const token=String(cards[0]?.forno_id||cards[0]?.n_serie||'LOTE').replace(/[^A-Z0-9]/gi,'').slice(0,8).toUpperCase()||'LOTE',base=`${week.slice(0,4)}-S${String(weekNumber(parseLocalDate(week))).padStart(2,'0')}-${token}`;let code=base,index=2;while(used.has(code)){code=`${base}-${index++}`}used.add(code);return code}

const compatibleKey=card=>{const model=String(card.modelo||'').trim().toUpperCase(),voltage=String(card.tensao||'').trim().toUpperCase(),controller=String(card.controlador||'').trim().toUpperCase();return model&&voltage&&controller?`${model} | ${voltage} | ${controller}`:null}

export function simpleMonthlySchedule(cards,options={}){
  const{monthlyTarget=100,maxLot=6,commitments=[],existingCodes=[],exceptions=[],today=new Date()}=options,usedCodes=new Set(existingCodes),lots=[],unscheduled=[],preserved=[],monthLoads=new Map,weekLoads=existingOccupancy(commitments)
  for(const card of commitments){if(!pending(card)||!card.planejado_para)continue;const month=String(card.planejado_para).slice(0,7);monthLoads.set(month,(monthLoads.get(month)||0)+1)}
  const sorted=[...cards].sort((a,b)=>Number(Boolean(b.atrasado))-Number(Boolean(a.atrasado))||String(a.data_entrega||'9999').localeCompare(String(b.data_entrega||'9999'))||Number(b.prioridade||0)-Number(a.prioridade||0)||String(a.n_serie).localeCompare(String(b.n_serie),undefined,{numeric:true}))
  for(const card of sorted){
    if(card.planejado_para){preserved.push(card);continue}
    const delivery=parseLocalDate(card.data_entrega);if(!delivery){unscheduled.push({card,reason:'Data de entrega ausente ou inválida.'});continue}
    const month=dateKey(delivery).slice(0,7),existing=monthLoads.get(month)||0
    if(existing>=monthlyTarget){unscheduled.push({card,reason:`Sem encaixe no limite mensal de ${monthlyTarget} fornos em ${month}.`});continue}
    const targets=weeklyTargets(month,monthlyTarget,exceptions),first=parseLocalDate(`${month}-01`),latest=parseLocalDate(mondayKey(dateKey(delivery))),eligible=targets.filter(row=>parseLocalDate(row.week)<=latest&&parseLocalDate(row.week)>=parseLocalDate(mondayKey(dateKey(first))))
    let chosen=null
    for(const target of [...eligible].reverse()){const occupied=weekLoads.get(target.week)||0;if(occupied<Math.ceil(target.target)){chosen=target.week;break}}
    if(!chosen&&eligible.length)chosen=eligible[0].week
    if(!chosen){unscheduled.push({card,reason:'Sem semana produtiva elegível antes do prazo no mês.'});continue}
    weekLoads.set(chosen,(weekLoads.get(chosen)||0)+1);monthLoads.set(month,existing+1)
    const compatibility=compatibleKey(card),groupKey=compatibility||`INDIVIDUAL:${card.forno_id}`,lotKey=`${chosen}|${groupKey}`;let lot=lots.find(item=>item.key===lotKey&&item.cards.length<maxLot)
    if(!lot){lot={key:lotKey,code:null,week:chosen,configuration:compatibility||`${card.modelo||'Modelo não informado'} · programação individual`,cards:[],capacityValidated:false,deadline:dateKey(delivery),individual:!compatibility};lots.push(lot)}
    lot.cards.push({...card,proposedWeek:chosen})
  }
  for(const lot of lots)lot.code=uniqueLotCode(lot.week,lot.cards,usedCodes)
  const weeklyLoads=[...new Set([...weekLoads.keys(),...lots.map(x=>x.week)])].sort().map(week=>{const existing=[...commitments].filter(card=>card.planejado_para&&mondayKey(card.planejado_para)===week).length,suggested=lots.reduce((sum,lot)=>sum+lot.cards.filter(card=>card.proposedWeek===week).length,0);return{week,existing,suggested,projected:existing+suggested,reference:Math.ceil(weeklyReference(week,monthlyTarget,exceptions))}})
  const monthlyLoads=[...monthLoads].sort().map(([month,projected])=>{const existing=commitments.filter(card=>pending(card)&&String(card.planejado_para||'').slice(0,7)===month).length;return{month,target:monthlyTarget,existing,suggested:projected-existing,projected,available:Math.max(0,monthlyTarget-projected),overloaded:projected>monthlyTarget}})
  return{lots,unscheduled,preserved,weeklyLoads,monthlyLoads,notice:'Programação preliminar por quantidade e prazo. Segunda a sexta-feira foram usadas como calendário provisório; não há garantia de capacidade técnica por operação.'}
}

export function suggestSchedule(cards,options={}){
  const{maxLot=6,monthlyTarget=100,exceptions=[],commitments=[],mode='NEW',horizonStart,horizonEnd,dispatchLeadDays=0,existingCodes=[],today=new Date()}=options
  const start=parseLocalDate(horizonStart)||parseLocalDate(mondayKey(dateKey(today))),end=parseLocalDate(horizonEnd)||addDays(start,84),selectedIds=new Set(cards.map(card=>card.forno_id)),excluded=mode==='REPROGRAM'?selectedIds:new Set,loads=existingOccupancy(commitments,excluded),projected=new Map(loads),usedCodes=new Set(existingCodes),lots=[],unscheduled=[],preserved=[]
  const sorted=[...cards].sort((a,b)=>Number(Boolean(b.atrasado))-Number(Boolean(a.atrasado))||String(a.data_entrega||'9999').localeCompare(String(b.data_entrega||'9999'))||Number(b.prioridade||0)-Number(a.prioridade||0)||configKey(a).localeCompare(configKey(b)))
  for(const card of sorted){
    if(mode==='NEW'&&card.planejado_para){preserved.push(card);unscheduled.push({card,reason:'Conflito com programação aprovada: compromisso existente preservado.'});continue}
    const delivery=parseLocalDate(card.data_entrega)
    if(!delivery){unscheduled.push({card,reason:'Dados produtivos incompletos: data de entrega ausente.'});continue}
    const deadline=shiftProductiveDays(delivery,-Math.max(0,Number(dispatchLeadDays)||0),exceptions),latest=parseLocalDate(mondayKey(dateKey(deadline))),earliest=parseLocalDate(mondayKey(dateKey(start))),lastAllowed=parseLocalDate(mondayKey(dateKey(end)))
    if(latest>lastAllowed)latest.setTime(lastAllowed.getTime())
    if(latest<earliest){unscheduled.push({card,reason:delivery<today?'Prazo já vencido antes do horizonte de programação.':'Horizonte de programação insuficiente para a antecedência informada.'});continue}
    let chosen=null
    for(let week=new Date(latest);week>=earliest;week=addDays(week,-7)){const key=dateKey(week),reference=Math.ceil(weeklyReference(key,monthlyTarget,exceptions)),occupied=projected.get(key)||0;if(reference>0&&occupied<reference){chosen=key;projected.set(key,occupied+1);break}}
    if(!chosen){unscheduled.push({card,reason:'Referência semanal comprometida por programações aprovadas no horizonte.'});continue}
    const key=`${chosen}|${configKey(card)}`;let lot=lots.find(item=>item.key===key&&item.cards.length<maxLot)
    if(!lot){lot={key,code:null,week:chosen,configuration:configKey(card),cards:[],capacityValidated:false,deadline:dateKey(deadline)};lots.push(lot)}
    lot.cards.push(card)
  }
  for(const lot of lots)lot.code=uniqueLotCode(lot.week,lot.cards,usedCodes)
  const weeklyLoads=[...new Set([...loads.keys(),...projected.keys()])].sort().map(week=>({week,existing:loads.get(week)||0,suggested:(projected.get(week)||0)-(loads.get(week)||0),projected:projected.get(week)||0,reference:Math.ceil(weeklyReference(week,monthlyTarget,exceptions))}))
  return{lots,unscheduled,preserved,weeklyLoads,notice:'Programação preliminar por quantidade e prazo. Capacidade técnica e tempos das operações restantes não validados.'}
}

function weekNumber(date){const value=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));value.setUTCDate(value.getUTCDate()+4-(value.getUTCDay()||7));const year=new Date(Date.UTC(value.getUTCFullYear(),0,1));return Math.ceil((((value-year)/86400000)+1)/7)}

export function abcByModel(cards){const totals=new Map;for(const card of cards)totals.set(card.modelo||'Não informado',(totals.get(card.modelo||'Não informado')||0)+1);const rows=[...totals].map(([modelo,quantidade])=>({modelo,quantidade})).sort((a,b)=>b.quantidade-a.quantidade||a.modelo.localeCompare(b.modelo)),total=cards.length;let cumulative=0;return rows.map(row=>{const before=cumulative/Math.max(total,1);cumulative+=row.quantidade;return{...row,share:row.quantidade/Math.max(total,1),cumulative:cumulative/Math.max(total,1),class:before<.8?'A':before<.95?'B':'C'}})}
