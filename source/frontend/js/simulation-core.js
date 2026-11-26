const clone=value=>structuredClone(value)
const id=()=>globalThis.crypto?.randomUUID?.()||`local-${Date.now()}-${Math.random().toString(16).slice(2)}`
const normalized=value=>String(value??'').trim().toUpperCase()
const compatible=(a,b)=>['modelo','tensao','controlador'].every(key=>normalized(a[key])===normalized(b[key]))

export function createSimulationState(schedule={lots:[],unscheduled:[],weeklyLoads:[]}){
  const lots=(schedule.lots||[]).map(lot=>({
    id:lot.id||id(),code:lot.code,week:lot.week,configuration:lot.configuration,
    fixed:false,order:Number(lot.order||0),cards:(lot.cards||[]).map((card,index)=>({...card,fixed:false,order:index}))
  }))
  const allocated=new Set(lots.flatMap(lot=>lot.cards.map(card=>String(card.forno_id))))
  const unscheduled=(schedule.unscheduled||[]).map(item=>({...item.card,reason:item.reason||'Sem encaixe na sugestão'}))
    .filter(card=>!allocated.has(String(card.forno_id)))
  return{lots,unscheduled,weeklyLoads:schedule.weeklyLoads||[],notice:schedule.notice||'',dirty:false,revision:0}
}

export function weeksInState(state){return[...new Set(state.lots.map(lot=>lot.week).filter(Boolean))].sort()}
export function allFurnaces(state){return[...state.lots.flatMap(lot=>lot.cards),...state.unscheduled]}
export function findLot(state,lotId){return state.lots.find(lot=>String(lot.id)===String(lotId))}

export function recalculateLoads(state,monthlyTarget=100){
  const result=new Map((state.weeklyLoads||[]).map(row=>[row.week,{...row,suggested:0,projected:Number(row.existing||0)}]))
  for(const lot of state.lots){if(!result.has(lot.week))result.set(lot.week,{week:lot.week,existing:0,suggested:0,projected:0,reference:Math.ceil(monthlyTarget/4.35)});const row=result.get(lot.week);row.suggested+=lot.cards.length;row.projected=Number(row.existing||0)+row.suggested}
  return[...result.values()].filter(row=>row.suggested||row.existing).sort((a,b)=>a.week.localeCompare(b.week))
}

function mutate(state,action){
  const next=clone(state),lot=findLot(next,action.lotId)
  if(action.type==='MOVE_LOT'){
    if(!lot)throw new Error('Lote não encontrado.')
    lot.week=action.week
  }else if(action.type==='MOVE_FURNACE'){
    let card
    for(const source of next.lots){const index=source.cards.findIndex(item=>String(item.forno_id)===String(action.fornoId));if(index>=0){card=source.cards.splice(index,1)[0];break}}
    if(!card){const index=next.unscheduled.findIndex(item=>String(item.forno_id)===String(action.fornoId));if(index>=0)card=next.unscheduled.splice(index,1)[0]}
    if(!card)throw new Error('Forno não encontrado na simulação.')
    if(action.lotId){const target=findLot(next,action.lotId);if(!target)throw new Error('Lote de destino não encontrado.');if(target.cards.length&&!compatible(target.cards[0],card))throw new Error('Modelo, tensão ou controlador incompatível com o lote.');target.cards.push({...card,order:target.cards.length})}
    else if(action.week){next.lots.push({id:id(),code:action.code||`IND-${card.n_serie}`,week:action.week,configuration:'Programação individual',fixed:false,order:next.lots.length,cards:[{...card,order:0}]})}
    else next.unscheduled.push({...card,reason:action.reason||'Retirado manualmente da programação'})
    next.lots=next.lots.filter(item=>item.cards.length)
  }else if(action.type==='REMOVE_FROM_LOT'){
    if(!lot)throw new Error('Lote não encontrado.')
    const index=lot.cards.findIndex(card=>String(card.forno_id)===String(action.fornoId));if(index<0)throw new Error('Forno não pertence ao lote.')
    const [card]=lot.cards.splice(index,1)
    if(action.keepWeek)next.lots.push({id:id(),code:`IND-${card.n_serie}`,week:lot.week,configuration:'Programação individual',fixed:card.fixed,order:lot.order+1,cards:[{...card,order:0}]})
    else next.unscheduled.push({...card,reason:'Removido do lote e da programação'})
    next.lots=next.lots.filter(item=>item.cards.length)
  }else if(action.type==='SPLIT_LOT'){
    if(!lot)throw new Error('Lote não encontrado.')
    const selected=new Set(action.fornoIds.map(String)),cards=lot.cards.filter(card=>selected.has(String(card.forno_id)))
    if(!cards.length||cards.length===lot.cards.length)throw new Error('Selecione parte dos fornos para dividir o lote.')
    lot.cards=lot.cards.filter(card=>!selected.has(String(card.forno_id)))
    next.lots.push({id:id(),code:action.code||`${lot.code}-B`,week:action.week||lot.week,configuration:lot.configuration,fixed:false,order:lot.order+1,cards})
  }else if(action.type==='CREATE_LOT'){
    const selected=new Set(action.fornoIds.map(String)),cards=next.unscheduled.filter(card=>selected.has(String(card.forno_id)))
    if(!cards.length)throw new Error('Selecione ao menos um forno sem programação.')
    if(cards.some(card=>!compatible(cards[0],card)))throw new Error('Os fornos selecionados não possuem configuração compatível.')
    next.unscheduled=next.unscheduled.filter(card=>!selected.has(String(card.forno_id)))
    next.lots.push({id:id(),code:action.code||`MAN-${String(cards[0].modelo||'LOTE').replace(/\W/g,'').slice(0,8)}-${Date.now().toString().slice(-4)}`,week:action.week,configuration:[cards[0].modelo,cards[0].tensao,cards[0].controlador].filter(Boolean).join(' · '),fixed:false,order:next.lots.length,cards})
  }else if(action.type==='TOGGLE_FIXED'){
    if(action.lotId){if(!lot)throw new Error('Lote não encontrado.');lot.fixed=!lot.fixed;lot.cards=lot.cards.map(card=>({...card,fixed:lot.fixed}))}
    else{const card=allFurnaces(next).find(item=>String(item.forno_id)===String(action.fornoId));if(!card)throw new Error('Forno não encontrado.');card.fixed=!card.fixed}
  }else if(action.type==='REORDER_LOT'){
    if(!lot)throw new Error('Lote não encontrado.');lot.order=Number(action.order)
  }else throw new Error('Ação de simulação inválida.')
  next.dirty=true;next.revision=Number(state.revision||0)+1
  return next
}

export function createHistory(initial){
  let present=clone(initial),past=[],future=[]
  return{
    get state(){return clone(present)},get canUndo(){return past.length>0},get canRedo(){return future.length>0},
    dispatch(action){past.push(clone(present));present=mutate(present,action);future=[];return this.state},
    replace(value,{record=false}={}){if(record)past.push(clone(present));present=clone(value);future=[];return this.state},
    undo(){if(!past.length)return this.state;future.unshift(clone(present));present=past.pop();return this.state},
    redo(){if(!future.length)return this.state;past.push(clone(present));present=future.shift();return this.state}
  }
}

export function serializeSimulation(state,filters={},parameters={}){
  return{schema:2,filters,parameters,state:{...clone(state),dirty:false},savedAt:new Date().toISOString()}
}

export function restoreSimulation(payload){if(!payload||Number(payload.schema)!==2||!payload.state)throw new Error('Rascunho incompatível.');return createHistory({...clone(payload.state),dirty:false})}

