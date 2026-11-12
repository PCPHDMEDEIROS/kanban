const dateOnly=value=>{if(!value)return null;const d=new Date(`${String(value).slice(0,10)}T12:00:00`);return Number.isNaN(d.getTime())?null:d}
const iso=date=>date.toISOString().slice(0,10)
const monday=date=>{const d=new Date(date);d.setDate(d.getDate()-((d.getDay()+6)%7));return d}
const configKey=card=>[card.modelo,card.tensao,card.controlador].map(x=>String(x||'NÃO INFORMADO').trim().toUpperCase()).join(' | ')

export function validatePeriod(from,to){const a=dateOnly(from),b=dateOnly(to);if(!a||!b)return{valid:false,error:'Informe as datas inicial e final.'};if(b<a)return{valid:false,error:'A data final não pode ser anterior à inicial.'};return{valid:true,from:a,to:b}}

export function filterPortfolio(cards,filters={}){
  const period=validatePeriod(filters.from,filters.to);if(!period.valid)return{cards:[],excludedLate:0,error:period.error}
  const pending=cards.filter(c=>!['FINALIZADO','CANCELADO'].includes(String(c.status_forno||'').toUpperCase()))
  const before=pending.filter(c=>{const d=dateOnly(c.data_entrega);return d&&d<period.from}).length
  const list=pending.filter(c=>{
    const delivery=dateOnly(c.data_entrega),inPeriod=delivery&&delivery>=period.from&&delivery<=period.to
    const includeLate=filters.includeLate&&delivery&&delivery<period.from
    const production=filters.production||'ALL',started=c.tem_apontamento_produtivo===true
    return(inPeriod||includeLate)&&(!filters.model||c.modelo===filters.model)&&(!filters.client||String(c.cliente||'').toLowerCase().includes(String(filters.client).toLowerCase()))&&(!filters.box||c.status_caixa===filters.box)&&(production==='ALL'||production==='NOT_STARTED'&&!started||production==='STARTED'&&started)&&(filters.scheduling!=='UNPLANNED'||!c.planejado_para)&&(filters.scheduling!=='PLANNED'||Boolean(c.planejado_para))
  })
  return{cards:list,excludedLate:filters.includeLate?0:before,error:null}
}

export function portfolioSummary(cards){
  const dates=cards.map(c=>dateOnly(c.data_entrega)).filter(Boolean),groups=new Map
  for(const c of cards){const key=configKey(c);if(!groups.has(key))groups.set(key,{key,modelo:c.modelo||'Não informado',tensao:c.tensao||'Não informada',controlador:c.controlador||'Não informado',quantidade:0,naoIniciados:0,fabricacao:0,prazos:[]});const g=groups.get(key);g.quantidade++;c.tem_apontamento_produtivo?g.fabricacao++:g.naoIniciados++;const d=dateOnly(c.data_entrega);if(d)g.prazos.push(d)}
  return{total:cards.length,naoIniciados:cards.filter(c=>!c.tem_apontamento_produtivo).length,fabricacao:cards.filter(c=>c.tem_apontamento_produtivo).length,programados:cards.filter(c=>c.planejado_para).length,semProgramacao:cards.filter(c=>!c.planejado_para).length,atrasados:cards.filter(c=>c.atrasado).length,prioridadeAlta:cards.filter(c=>Number(c.prioridade)>=2).length,primeiroPrazo:dates.length?new Date(Math.min(...dates)):null,ultimoPrazo:dates.length?new Date(Math.max(...dates)):null,groups:[...groups.values()].map(g=>({...g,primeiroPrazo:g.prazos.length?new Date(Math.min(...g.prazos)):null,ultimoPrazo:g.prazos.length?new Date(Math.max(...g.prazos)):null})).sort((a,b)=>b.quantidade-a.quantidade||a.key.localeCompare(b.key))}
}

export function productiveDays(from,to,exceptions=[]){const blocked=new Set(exceptions.filter(x=>x.working===false).map(x=>x.date)),extra=new Set(exceptions.filter(x=>x.working===true).map(x=>x.date));let total=0;for(const d=new Date(from);d<=to;d.setDate(d.getDate()+1)){const key=iso(d),weekday=d.getDay()>=1&&d.getDay()<=5;if((weekday&&!blocked.has(key))||extra.has(key))total++}return total}

export function weeklyTargets(month,monthlyTarget=100,exceptions=[]){const start=new Date(`${month}-01T12:00:00`),end=new Date(start.getFullYear(),start.getMonth()+1,0,12),monthDays=productiveDays(start,end,exceptions);if(!monthDays)return[];const daily=monthlyTarget/monthDays,result=[];for(let cursor=monday(start);cursor<=end;cursor.setDate(cursor.getDate()+7)){const weekStart=new Date(cursor),weekEnd=new Date(cursor);weekEnd.setDate(weekEnd.getDate()+6);const from=weekStart<start?start:weekStart,to=weekEnd>end?end:weekEnd,days=productiveDays(from,to,exceptions);if(days)result.push({week:iso(weekStart),days,target:Number((daily*days).toFixed(2))})}return result}

export function suggestSchedule(cards,{maxLot=6,monthlyTarget=100,exceptions=[]}={}){
  const sorted=[...cards].sort((a,b)=>Number(Boolean(b.atrasado))-Number(Boolean(a.atrasado))||String(a.data_entrega||'9999').localeCompare(String(b.data_entrega||'9999'))||Number(b.prioridade||0)-Number(a.prioridade||0)||configKey(a).localeCompare(configKey(b)))
  const loads=new Map,sequence=new Map,lots=[],unscheduled=[]
  for(const c of sorted){const delivery=dateOnly(c.data_entrega);if(!delivery){unscheduled.push({card:c,reason:'Dados insuficientes: data de entrega ausente.'});continue}const week=monday(delivery),weekKey=iso(week),month=iso(delivery).slice(0,7),targets=weeklyTargets(month,monthlyTarget,exceptions),limit=targets.find(x=>x.week===weekKey)?.target??null,current=loads.get(weekKey)||0;if(limit!==null&&current>=Math.ceil(limit)){unscheduled.push({card:c,reason:'Sem encaixe na referência por quantidade antes do prazo.'});continue}loads.set(weekKey,current+1);const key=`${weekKey}|${configKey(c)}`;let lot=lots.find(x=>x.key===key&&x.cards.length<maxLot);if(!lot){const n=(sequence.get(weekKey)||0)+1;sequence.set(weekKey,n);lot={key,code:`${week.getFullYear()}-S${String(weekNumber(week)).padStart(2,'0')}-L${String(n).padStart(3,'0')}`,week:weekKey,configuration:configKey(c),cards:[],capacityValidated:false};lots.push(lot)}lot.cards.push(c)}
  return{lots,unscheduled,notice:'Programação por quantidade — capacidade operacional não validada.'}
}

function weekNumber(date){const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));const y=new Date(Date.UTC(d.getUTCFullYear(),0,1));return Math.ceil((((d-y)/86400000)+1)/7)}

export function abcByModel(cards){const totals=new Map;for(const c of cards)totals.set(c.modelo||'Não informado',(totals.get(c.modelo||'Não informado')||0)+1);const rows=[...totals].map(([modelo,quantidade])=>({modelo,quantidade})).sort((a,b)=>b.quantidade-a.quantidade||a.modelo.localeCompare(b.modelo)),total=cards.length;let cumulative=0;return rows.map(row=>{const before=cumulative/Math.max(total,1);cumulative+=row.quantidade;return{...row,share:row.quantidade/Math.max(total,1),cumulative:cumulative/Math.max(total,1),class:before<.8?'A':before<.95?'B':'C'}})}

