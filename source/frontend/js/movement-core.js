import {mondayKey} from './pcp-board-core.js'

export function movementVersions(type,item,planningVersions){
  const versions={}
  if(type==='LOTE'){
    versions.lote=Number(item.versao||0)
    for(const card of item.participants||[])versions[card.forno_id]=Number(planningVersions.get(card.forno_id)||0)
  }else versions[item.forno_id]=Number(planningVersions.get(item.forno_id)||0)
  return versions
}

export function movementImpact(type,item,targetWeek){
  const participants=type==='LOTE'?(item.participants||[]):[item]
  return{type,from:type==='LOTE'?item.semana_planejada:item.planejado_para,to:targetWeek?mondayKey(targetWeek):null,affected:participants.length,lots:type==='LOTE'?1:Number(Boolean(item.lote_id)),delayed:participants.filter(card=>card.atrasado).length,critical:participants.filter(card=>Number(card.dias_para_entrega)>=0&&Number(card.dias_para_entrega)<=7).length}
}

export function validateMovement(impact,reason){
  if(!impact.affected)return{valid:false,error:'Nenhum forno será movimentado.'}
  if(impact.from===impact.to)return{valid:false,error:'Selecione uma semana diferente da atual.'}
  if(!String(reason||'').trim())return{valid:false,error:'Informe a justificativa da reprogramação.'}
  return{valid:true,error:null}
}

