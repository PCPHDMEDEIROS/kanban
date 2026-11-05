export const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]/gi,'').toUpperCase()

export function operationKey(value){
  const key=normalize(value)
  if(key.startsWith('PREP'))return'PREP'
  if(key.startsWith('MONTGERAL'))return'MONTGERAL'
  if(key.startsWith('MONTELETR'))return'MONTELETR'
  if(key.startsWith('TESTEELETR'))return'TESTEELETR'
  if(key.startsWith('CORTE'))return'CORTEMANTAS'
  if(key.startsWith('ACAB'))return'ACAB'
  return key
}

export const finalizedDate=card=>{
  const value=card.data_finalizacao||card.ultima_movimentacao
  const date=value?new Date(value):null
  return date&&!Number.isNaN(date.getTime())?date:null
}

export function classifyCard(card,operationCodes=[]){
  if(card.status_forno==='FINALIZADO')return'FINALIZADO'
  if(!card.ultima_movimentacao&&!card.apontamento_aberto)return'A_PRODUZIR'
  const key=operationKey(card.operacao_atual)
  const known=new Set(operationCodes.map(operationKey))
  return key&&known.has(key)?key:'PENDENCIA'
}

export function uniqueCards(cards){
  const map=new Map()
  for(const card of cards){
    const key=String(card.id||card.n_serie||'').trim()
    if(!key)continue
    const current=map.get(key)
    const cardTime=new Date(card.ultima_movimentacao||0).getTime()
    const currentTime=new Date(current?.ultima_movimentacao||0).getTime()
    if(!current||cardTime>=currentTime)map.set(key,card)
  }
  return [...map.values()]
}

export function diagnose(cards,operationCodes=[]){
  const series=new Map(),issues=[]
  for(const card of cards){
    const serie=String(card.n_serie??'').trim()
    if(!serie)issues.push({type:'Série ausente',card})
    else series.set(serie,(series.get(serie)||0)+1)
    const column=classifyCard(card,operationCodes)
    if(column==='PENDENCIA')issues.push({type:'Operação não classificada',card})
    if(card.status_forno==='FINALIZADO'&&card.apontamento_aberto)issues.push({type:'Finalizado com apontamento aberto',card})
    if(card.status_forno==='FINALIZADO'&&!finalizedDate(card))issues.push({type:'Finalizado sem evidência de data',card})
  }
  for(const [serie,count] of series)if(count>1)issues.push({type:`Série duplicada (${count})`,card:{n_serie:serie}})
  return issues
}

export function metrics(cards){
  return {
    total:cards.length,
    fabricacao:cards.filter(x=>x.status_forno==='FABRICAÇÃO').length,
    aProduzir:cards.filter(x=>classifyCard(x,[])==='A_PRODUZIR').length,
    finalizados:cards.filter(x=>x.status_forno==='FINALIZADO').length,
    atrasados:cards.filter(x=>x.atrasado).length,
    abertos:cards.filter(x=>x.apontamento_aberto).length,
    bloqueados:cards.filter(x=>x.bloqueado).length,
    caixasComprar:cards.filter(x=>x.status_caixa==='COMPRAR').length,
    caixasCompradas:cards.filter(x=>['COMPRADA','COMPRADO'].includes(x.status_caixa)).length
  }
}

