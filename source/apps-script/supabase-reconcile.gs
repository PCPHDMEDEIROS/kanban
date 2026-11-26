/** HD Medeiros — varredura incremental, reconciliação retomável e reprocessamento seletivo. */
const HDK_RECONCILIACAO_PROP='HDK_RECONCILIACAO_ESTADO';

function HDK_validarDependenciasReconciliacao_(){
  if(typeof HDK_validarDependencias_!=='function')throw new Error('supabase-sync.gs não foi incorporado integralmente neste projeto. A função HDK_validarDependencias_ está ausente.');
  const result=HDK_validarDependencias_(),missing=[];
  if(typeof listarTodasVendas_!=='function')missing.push('listarTodasVendas_ (Code.gs)');
  if(typeof HDV_CONFIG==='undefined'||!HDV_CONFIG.SINCRONIZACAO)missing.push('HDV_CONFIG.SINCRONIZACAO (Code.gs)');
  if(missing.length)throw new Error('Dependências do projeto ausentes: '+missing.join(', ')+'. Preserve Code.gs e copie os dois arquivos Supabase completos.');
  const sync=HDV_CONFIG.SINCRONIZACAO;
  if(!sync.PLANILHA_APONTAMENTOS_ID||!sync.ABA_APONTAMENTOS)throw new Error('Configure PLANILHA_APONTAMENTOS_ID e ABA_APONTAMENTOS em HDV_CONFIG.SINCRONIZACAO.');
  const sheet=SpreadsheetApp.openById(sync.PLANILHA_APONTAMENTOS_ID).getSheetByName(sync.ABA_APONTAMENTOS);
  if(!sheet)throw new Error('Aba de apontamentos não encontrada: '+sync.ABA_APONTAMENTOS+'.');
  return Object.assign({},result,{planilhaApontamentosId:sync.PLANILHA_APONTAMENTOS_ID,abaApontamentos:sync.ABA_APONTAMENTOS});
}

function HDK_instalarGatilhos(){
  HDK_validarDependenciasReconciliacao_();
  const handlers=['HDK_sincronizacaoIncremental','HDK_reprocessarPendencias','HDK_retomarReconciliacaoPendente','HDK_reconciliacaoDiaria'];
  ScriptApp.getProjectTriggers().filter(t=>handlers.includes(t.getHandlerFunction())).forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('HDK_sincronizacaoIncremental').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('HDK_reprocessarPendencias').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('HDK_retomarReconciliacaoPendente').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('HDK_reconciliacaoDiaria').timeBased().atHour(2).everyDays(1).create();
  return{ok:true,handlers};
}

function HDK_sincronizacaoIncremental(){
  HDK_validarDependenciasReconciliacao_();
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1000))return{ok:false,motivo:'ocupado'};
  try{
    const props=PropertiesService.getScriptProperties(),state=HDK_stateMap_(),sales=listarTodasVendas_().map(HDK_fornoPayload_),changedSales=HDK_changed_('FORNO',sales,state),salesResult=HDK_sendChanged_('FORNO',changedSales,'HD_VENDAS_SCAN',state),sheet=SpreadsheetApp.openById(HDV_CONFIG.SINCRONIZACAO.PLANILHA_APONTAMENTOS_ID).getSheetByName(HDV_CONFIG.SINCRONIZACAO.ABA_APONTAMENTOS),last=Math.max(2,sheet.getLastRow());
    let start=Math.max(2,Number(props.getProperty('HDK_SCAN_CURSOR')||2));
    if(start>last)start=2;
    const count=Math.min(HDK.SCAN,last-start+1),items=HDK_lerApontamentos_(sheet,start,count),changed=HDK_changed_('APONTAMENTO',items,state),apResult=HDK_sendChanged_('APONTAMENTO',changed,'APONTAMENTOS_SCAN_5_MIN',state),success=salesResult.erros===0&&apResult.erros===0,next=success?(start+count>last?2:start+count):start,summary={at:new Date().toISOString(),ok:success,vendas_lidas:sales.length,vendas_enviadas:salesResult.enviados,apontamentos_lidos:items.length,apontamentos_enviados:apResult.enviados,erros:salesResult.erros+apResult.erros,proxima_linha:next};
    props.setProperties({HDK_SCAN_CURSOR:String(next),HDK_ULTIMA_SINCRONIZACAO:JSON.stringify(summary)});
    return summary;
  }finally{lock.releaseLock();}
}

function HDK_reprocessarPendencias(){
  HDK_validarDependenciasReconciliacao_();
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1000))return{ok:false,motivo:'ocupado'};
  try{
    const sheet=HDK_sheet_(HDK.QUEUE_SHEET,['IDEMPOTENCIA','ENTIDADE','ORIGEM','PAYLOAD','TENTATIVAS','PROXIMA_TENTATIVA','ERRO']);
    if(sheet.getLastRow()<=1)return{ok:true,processados:0,restantes:0};
    const rows=sheet.getRange(2,1,sheet.getLastRow()-1,7).getValues(),now=new Date(),remove=[],state=HDK_stateMap_();
    rows.forEach((row,index)=>{
      if(row[5] instanceof Date&&row[5]>now)return;
      try{
        const item=JSON.parse(row[3]),entity=String(row[1]),action=entity==='FORNO'?'sync-fornos-batch':'sync-apontamentos-batch';
        HDK_enviar_(action,[item],`REPROCESSO:${row[2]}`,`${row[0]}:tentativa:${Number(row[4])+1}`);
        HDK_commitState_(entity,[item],state);
        remove.push(index+2);
      }catch(error){
        const attempts=Number(row[4])+1,minutes=Math.min(1440,5*Math.pow(2,Math.min(attempts,8)));
        sheet.getRange(index+2,5,1,3).setValues([[attempts,new Date(Date.now()+minutes*60000),String(error).slice(0,1000)]]);
      }
    });
    remove.reverse().forEach(row=>sheet.deleteRow(row));
    return{ok:true,processados:remove.length,restantes:Math.max(0,sheet.getLastRow()-1)};
  }finally{lock.releaseLock();}
}

function HDK_novoEstadoReconciliacao_(origin){
  return{versao:2,jobId:Utilities.getUuid(),origem:origin||'RECONCILIACAO_MANUAL',iniciadoEm:new Date().toISOString(),fase:'FORNOS',proximaLinha:2,vendas:null,apontamentos:{lidos:0,enviados:0,inseridos:0,atualizados:0,ignorados:0,erros:0}};
}
function HDK_salvarEstadoReconciliacao_(state){PropertiesService.getScriptProperties().setProperty(HDK_RECONCILIACAO_PROP,JSON.stringify(state));}
function HDK_carregarEstadoReconciliacao_(){const raw=PropertiesService.getScriptProperties().getProperty(HDK_RECONCILIACAO_PROP);return raw?JSON.parse(raw):null;}
function HDK_somarResultado_(target,result,lidos){target.lidos+=Number(lidos||0);target.enviados+=Number(result.enviados||0);target.inseridos+=Number(result.inseridos||0);target.atualizados+=Number(result.atualizados||0);target.ignorados+=Number(result.ignorados||0);target.erros+=Number(result.erros||0);}
function HDK_idsOrigemApontamentos_(sheet){
  if(sheet.getLastRow()<2)return[];
  const meta=HDK_headers_(sheet),index=meta.map[normalizarCabecalho_('ID')];
  if(index===undefined)throw new Error('Coluna ID não encontrada na aba de apontamentos.');
  return[...new Set(sheet.getRange(2,index+1,sheet.getLastRow()-1,1).getDisplayValues().flat().map(HDK_text_).filter(Boolean))];
}

function HDK_reconciliarSupabaseCompleto(origem){
  HDK_validarDependenciasReconciliacao_();
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(5000))return{ok:false,motivo:'ocupado'};
  const invocationStarted=Date.now(),props=PropertiesService.getScriptProperties();
  try{
    const stateMap=HDK_stateMap_(),sheet=SpreadsheetApp.openById(HDV_CONFIG.SINCRONIZACAO.PLANILHA_APONTAMENTOS_ID).getSheetByName(HDV_CONFIG.SINCRONIZACAO.ABA_APONTAMENTOS);
    let progress=HDK_carregarEstadoReconciliacao_()||HDK_novoEstadoReconciliacao_(origem);
    if(progress.fase==='FORNOS'){
      const sales=listarTodasVendas_().map(HDK_fornoPayload_),result=HDK_sendChanged_('FORNO',sales,progress.origem,stateMap);
      progress.vendas={lidas:sales.length,...result};
      progress.fase='APONTAMENTOS';
      HDK_salvarEstadoReconciliacao_(progress);
    }
    const last=sheet.getLastRow();
    while(progress.fase==='APONTAMENTOS'&&progress.proximaLinha<=last&&Date.now()-invocationStarted<HDK.MAX_RUNTIME_MS){
      const count=Math.min(HDK.SCAN,last-progress.proximaLinha+1),items=HDK_lerApontamentos_(sheet,progress.proximaLinha,count),result=HDK_sendChanged_('APONTAMENTO',items,progress.origem,stateMap);
      HDK_somarResultado_(progress.apontamentos,result,items.length);
      progress.proximaLinha+=count;
      HDK_salvarEstadoReconciliacao_(progress);
    }
    if(progress.fase==='APONTAMENTOS'&&progress.proximaLinha<=last)return{ok:true,concluida:false,jobId:progress.jobId,fase:progress.fase,proximaLinha:progress.proximaLinha,retomadaAutomatica:true,apontamentos:progress.apontamentos};
    if(progress.fase==='APONTAMENTOS'){progress.fase='COMPARACAO_IDS';HDK_salvarEstadoReconciliacao_(progress);}
    if(progress.fase==='COMPARACAO_IDS'){
      const ids=HDK_idsOrigemApontamentos_(sheet),response=HDK_enviar_('compare-source-ids',{entidade:'APONTAMENTO',ids},progress.origem,HDK_hash_({jobId:progress.jobId,fase:'COMPARACAO_IDS',quantidade:ids.length}));
      progress.comparacaoIds=response.result;
      progress.fase='FINALIZACAO';
      HDK_salvarEstadoReconciliacao_(progress);
    }
    const comparison=progress.comparacaoIds||{},summary={ok:Number(progress.vendas?.erros||0)===0&&Number(progress.apontamentos.erros||0)===0&&Number(comparison.nao_sincronizados||0)===0,jobId:progress.jobId,iniciadoEm:progress.iniciadoEm,concluidoEm:new Date().toISOString(),vendas:progress.vendas,apontamentos:progress.apontamentos,comparacaoIds:comparison};
    try{HDK_enviar_('reconciliation-summary',summary,progress.origem,HDK_hash_({jobId:progress.jobId,fase:'FINALIZACAO'}));}catch(error){summary.registroAuditoriaErro=String(error);}
    props.setProperty('HDK_ULTIMA_RECONCILIACAO',JSON.stringify(summary));
    props.deleteProperty(HDK_RECONCILIACAO_PROP);
    return Object.assign({concluida:true},summary);
  }finally{lock.releaseLock();}
}

function HDK_retomarReconciliacaoPendente(){return HDK_carregarEstadoReconciliacao_()?HDK_reconciliarSupabaseCompleto():{ok:true,pendente:false};}
function HDK_reconciliacaoDiaria(){return HDK_reconciliarSupabaseCompleto('RECONCILIACAO_DIARIA');}
function HDK_cancelarRetomadaReconciliacao(){PropertiesService.getScriptProperties().deleteProperty(HDK_RECONCILIACAO_PROP);return{ok:true,observacao:'Somente o marcador de retomada foi removido; nenhum dado de origem ou Supabase foi excluído.'};}

function HDK_statusIntegracao(){
  const dependencies=HDK_validarDependenciasReconciliacao_(),props=PropertiesService.getScriptProperties(),queue=HDK_sheet_(HDK.QUEUE_SHEET,['IDEMPOTENCIA','ENTIDADE','ORIGEM','PAYLOAD','TENTATIVAS','PROXIMA_TENTATIVA','ERRO']);
  return{dependencias:dependencies,ultimaSincronizacao:JSON.parse(props.getProperty('HDK_ULTIMA_SINCRONIZACAO')||'null'),ultimaReconciliacao:JSON.parse(props.getProperty('HDK_ULTIMA_RECONCILIACAO')||'null'),reconciliacaoEmAndamento:HDK_carregarEstadoReconciliacao_(),cursor:Number(props.getProperty('HDK_SCAN_CURSOR')||2),pendencias:Math.max(0,queue.getLastRow()-1)};
}

function HDK_testarInstalacao(){
  const dependencies=HDK_validarDependenciasReconciliacao_(),sheet=SpreadsheetApp.openById(HDV_CONFIG.SINCRONIZACAO.PLANILHA_APONTAMENTOS_ID).getSheetByName(HDV_CONFIG.SINCRONIZACAO.ABA_APONTAMENTOS),ids=HDK_idsOrigemApontamentos_(sheet),comparison=HDK_enviar_('compare-source-ids',{entidade:'APONTAMENTO',ids},'TESTE_INSTALACAO',HDK_hash_({teste:'IDS',quantidade:ids.length,primeiro:ids[0]||null,ultimo:ids[ids.length-1]||null}));
  return{ok:true,dependencias,idsOrigem:ids.length,comparacaoIds:comparison.result,status:HDK_statusIntegracao()};
}



