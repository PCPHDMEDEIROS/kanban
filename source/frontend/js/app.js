import {supabase} from './supabase.js'
import {classifyCard,diagnose,finalizedDate,metrics,operationKey,uniqueCards} from './kanban-core.js'
import {fetchAllCards,fetchCardsBySeries} from './data.js'
import {COLOR_LEGEND} from './visual-config.js'
import {deliveryInPeriod,durationLabel,operationTimeline} from './time-core.js'
import {applyInstitutionalBrand} from './brand.js'

applyInstitutionalBrand()

const state={cards:[],operations:[],issues:[],limits:{},view:localStorage.getItem('hd-kanban-view')||'compact',metricMode:localStorage.getItem('hd-kanban-metrics')||'filtered',lastSuccess:0,retry:0}
const $=s=>document.querySelector(s)
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
let realtimeChannel=null,reloadTimer=null,pollTimer=null,retryTimer=null,loadPromise=null,loadAgain=false
const pendingSeries=new Set()
const PAGE_SIZE=20,MIN_REFRESH=5000
const initialLimit=key=>['A_PRODUZIR','FINALIZADO'].includes(key)?10:15

async function login(email,password){const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error}
async function magicLink(email){const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:location.href}});if(error)throw error}
function setStatus(kind,message){const el=$('#sync-status');el.dataset.kind=kind;el.textContent=message}

async function load({force=false}={}){
  if(!force&&Date.now()-state.lastSuccess<MIN_REFRESH)return
  if(loadPromise){loadAgain=true;return loadPromise}
  clearTimeout(retryTimer);setStatus('reconnecting','Atualizando…')
  loadPromise=(async()=>{
    const [cardsResult,operationsResult]=await Promise.all([
      fetchAllCards(supabase),
      supabase.schema('hd_kanban').from('operacoes').select('*').eq('ativo',true).eq('considerar_no_kanban',true).order('ordem')
    ])
    if(operationsResult.error)throw operationsResult.error
    if(!cardsResult.complete)throw new Error(`Carga incompleta: ${cardsResult.rows.length} de ${cardsResult.total}`)
    const raw=cardsResult.rows
    state.cards=uniqueCards(raw);state.operations=operationsResult.data??[]
    state.issues=diagnose(raw,state.operations.map(x=>x.codigo))
    state.lastSuccess=Date.now();state.retry=0;render()
    setStatus('connected',`Atualizado às ${new Date().toLocaleTimeString('pt-BR')}`)
  })().catch(error=>{
    console.error('Falha ao carregar o Kanban',error)
    setStatus(navigator.onLine?'error':'stale',navigator.onLine?'Erro de sincronização':'Dados desatualizados · sem conexão')
    retryTimer=setTimeout(()=>load({force:true}),Math.min(60000,5000*2**state.retry++))
  }).finally(()=>{loadPromise=null;if(loadAgain){loadAgain=false;load({force:true})}})
  return loadPromise
}

async function refreshSeries(){const keys=[...pendingSeries];pendingSeries.clear();if(!keys.length)return load({force:true});try{const changed=await fetchCardsBySeries(supabase,keys),affected=new Set(keys),bySeries=new Map(state.cards.filter(card=>!affected.has(String(card.n_serie))).map(card=>[String(card.n_serie),card]));changed.forEach(card=>bySeries.set(String(card.n_serie),card));state.cards=uniqueCards([...bySeries.values()]);state.lastSuccess=Date.now();render();setStatus('connected',`Atualizado às ${new Date().toLocaleTimeString('pt-BR')}`)}catch(error){console.error('Falha na atualização incremental',error);await load({force:true})}}
function scheduleLoad(event){[event?.new?.n_serie,event?.old?.n_serie].filter(Boolean).forEach(value=>pendingSeries.add(String(value)));clearTimeout(reloadTimer);reloadTimer=setTimeout(refreshSeries,500)}
function searchMatches(c){const q=($('#search').value||'').trim().toLowerCase();return!q||[c.n_serie,c.cliente,c.modelo,c.operador_atual].some(x=>String(x??'').toLowerCase().includes(q))}
function serialSearchMatches(c){const q=($('#search').value||'').trim().toLowerCase();return q&&String(c.n_serie??'').toLowerCase().includes(q)}
function finalizedInPeriod(c){
  if(serialSearchMatches(c))return true
  const date=finalizedDate(c);if(!date)return false
  const period=$('#finalized-period').value
  if(period==='all')return true
  if(period==='2026')return date.getFullYear()===2026
  if(period==='custom'){
    const from=$('#finalized-from').value?new Date(`${$('#finalized-from').value}T00:00:00`):null
    const to=$('#finalized-to').value?new Date(`${$('#finalized-to').value}T23:59:59.999`):null
    return(!from||date>=from)&&(!to||date<=to)
  }
  const since=new Date();since.setHours(0,0,0,0);since.setDate(since.getDate()-Number(period||60));return date>=since
}
function deliveryPeriodValid(){const from=$('#delivery-from').value,to=$('#delivery-to').value,valid=!from||!to||from<=to;$('#delivery-period-error').textContent=valid?'':'A data inicial de entrega não pode ser posterior à data final.';return valid}
function visible(c){return deliveryPeriodValid()&&searchMatches(c)&&deliveryInPeriod(c,$('#delivery-from').value,$('#delivery-to').value)&&(!$('#status-caixa').value||c.status_caixa===$('#status-caixa').value)&&(!$('#only-late').checked||c.atrasado)&&(!$('#only-open').checked||c.apontamento_aberto)&&(!$('#only-blocked').checked||c.bloqueado)&&(c.status_forno!=='FINALIZADO'||finalizedInPeriod(c))}
function metric(label,value){return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`}
function formatDate(value){if(!value)return'—';const d=new Date(`${String(value).slice(0,10)}T12:00:00`);return Number.isNaN(d.getTime())?esc(value):d.toLocaleDateString('pt-BR')}
function sortCards(list,column){return [...list].sort((a,b)=>column==='FINALIZADO'?(finalizedDate(b)?.getTime()||0)-(finalizedDate(a)?.getTime()||0):(String(a.data_entrega||'9999').localeCompare(String(b.data_entrega||'9999'))||Number(b.atrasado)-Number(a.atrasado)||Number(b.prioridade||0)-Number(a.prioridade||0)))}
function card(c){
  const critical=!c.atrasado&&Number(c.dias_para_entrega)>=0&&Number(c.dias_para_entrega)<=7
  return `<article class="card ${state.view} ${c.atrasado?'late':''} ${critical?'critical':''} ${c.apontamento_aberto?'open':''} ${c.bloqueado?'blocked':''}" data-serie="${esc(c.n_serie)}" tabindex="0"><div class="card-title"><span>NS ${esc(c.n_serie)} — ${esc(c.modelo||'Sem modelo')}</span><span>${Number(c.prioridade)>=2?'⚠ Prioridade':''}</span></div><div class="card-extra"><b>${esc(c.cliente||'Cliente não informado')}</b><div>Entrega: ${formatDate(c.data_entrega)} · Prazo: ${c.dias_para_entrega??'—'} dias</div><div>${esc(c.operacao_atual||'Ainda não iniciado')} · ${esc(c.operador_atual||'Sem operador')}</div></div><div class="badges"><span class="badge ${esc(c.status_caixa)}">Caixa: ${esc(c.status_caixa||'—')}</span>${c.apontamento_aberto?'<span class="badge success">Em operação</span>':''}${c.bloqueado?'<span class="badge danger">Bloqueado</span>':''}</div></article>`
}
function render(){
  const filtered=state.cards.filter(visible),universe=state.metricMode==='general'?state.cards:filtered,m=metrics(universe)
  $('#metrics').innerHTML=[metric('Total',m.total),metric('Em fabricação',m.fabricacao),metric('A produzir',m.aProduzir),metric('Finalizados',m.finalizados),metric('Atrasados',m.atrasados),metric('Em operação',m.abertos),metric('Bloqueados',m.bloqueados),metric('Caixas para comprar',m.caixasComprar),metric('Caixas compradas',m.caixasCompradas)].join('')
  $('#issues-count').textContent=state.issues.length
  const operationCodes=state.operations.map(x=>x.codigo),codes=operationCodes.map(operationKey)
  $('#board').innerHTML=state.operations.map(op=>{
    const key=operationKey(op.codigo),initial=initialLimit(key)
    const list=sortCards(filtered.filter(c=>classifyCard(c,operationCodes)===key),op.codigo)
    const limit=state.limits[key]??initial,shown=list.slice(0,limit),remaining=list.length-shown.length
    return `<article class="column" data-column="${key}"><h2><span>${esc(op.nome)}</span><span>${list.length}</span></h2><div class="cards">${shown.map(card).join('')||'<p class="empty">Nenhum forno neste filtro.</p>'}</div><footer>${remaining>0?`<span>Exibindo ${shown.length} de ${list.length}</span><button data-more="${key}">Carregar mais ${Math.min(PAGE_SIZE,remaining)}</button><button data-all="${key}">Ver todos</button>`:''}${limit>initial?`<button data-collapse="${key}">Recolher</button>`:''}</footer></article>`
  }).join('')+pendingColumn(filtered,codes)
  bindBoardActions()
}
function pendingColumn(filtered,codes){const list=filtered.filter(c=>classifyCard(c,codes)==='PENDENCIA');return list.length?`<article class="column pending"><h2><span>Pendências de Dados</span><span>${list.length}</span></h2><div class="cards">${list.slice(0,20).map(card).join('')}</div></article>`:''}
function bindBoardActions(){
  document.querySelectorAll('.card').forEach(el=>{el.onclick=()=>detail(el.dataset.serie);el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();detail(el.dataset.serie)}}})
  document.querySelectorAll('[data-more]').forEach(b=>b.onclick=()=>{state.limits[b.dataset.more]=(state.limits[b.dataset.more]??initialLimit(b.dataset.more))+PAGE_SIZE;render()})
  document.querySelectorAll('[data-all]').forEach(b=>b.onclick=()=>openColumn(b.dataset.all))
  document.querySelectorAll('[data-collapse]').forEach(b=>b.onclick=()=>{delete state.limits[b.dataset.collapse];render()})
}
function openColumn(key){
  const operationCodes=state.operations.map(x=>x.codigo),op=state.operations.find(x=>operationKey(x.codigo)===key)
  const list=sortCards(state.cards.filter(visible).filter(c=>classifyCard(c,operationCodes)===key),op?.codigo)
  $('#column-title').textContent=`${op?.nome||key} — ${list.length} fornos`;$('#column-search').value=''
  const draw=()=>{const q=$('#column-search').value.toLowerCase(),filtered=list.filter(c=>[c.n_serie,c.modelo,c.cliente].some(v=>String(v??'').toLowerCase().includes(q)));$('#column-results').innerHTML=filtered.slice(0,100).map(card).join('')+`<p class="empty">Exibindo ${Math.min(100,filtered.length)} de ${filtered.length}</p>`;document.querySelectorAll('#column-results .card').forEach(el=>el.onclick=()=>detail(el.dataset.serie))}
  $('#column-search').oninput=draw;draw();$('#column-view').showModal()
}

let detailOffset=0,detailSerie=null
async function detail(serie,append=false){
  detailSerie=serie;if(!append)detailOffset=0
  const c=state.cards.find(x=>String(x.n_serie)===String(serie));if(!c)return
  const {data:history,error}=await supabase.schema('hd_kanban').from('apontamentos').select('*').eq('n_serie',serie).eq('source_deleted',false).order('data_hora',{ascending:false}).range(detailOffset,detailOffset+49)
  if(error){setStatus('error','Erro ao consultar histórico');return}
  const rows=(history??[]).map(h=>{const timeline=operationTimeline(h),duration=durationLabel(timeline.duration);return`<div class="history-item"><b>${esc(h.operacao||'Operação não informada')} — ${esc(h.operador||'Operador não informado')}</b><br><small>Início: ${esc(timeline.initial?.label||'Data/hora não disponível')}<br>Fim: ${esc(timeline.final?.label||(h.hora_final?'Data/hora não disponível':'Em aberto'))}${duration?`<br>Duração: ${esc(duration)}${timeline.crossedMidnight?' · atravessou a meia-noite':''}`:''}</small></div>`}).join('')
  if(!append)$('#details-content').innerHTML=`<h2>NS ${esc(serie)} — ${esc(c.modelo||'')}</h2><p><b>${esc(c.cliente)}</b></p><dl><dt>Entrega</dt><dd>${formatDate(c.data_entrega)}</dd><dt>Forno</dt><dd>${esc(c.status_forno)}</dd><dt>Caixa</dt><dd>${esc(c.status_caixa)}</dd><dt>Operação atual</dt><dd>${esc(c.operacao_atual||'—')}</dd></dl><h3>Histórico produtivo</h3><div id="history" class="history"></div><button id="load-history" type="button">Carregar mais histórico</button>`
  $('#history').insertAdjacentHTML('beforeend',rows||(!append?'Sem apontamentos':''));detailOffset+=(history??[]).length
  $('#load-history').hidden=(history??[]).length<50;$('#load-history').onclick=()=>detail(detailSerie,true);$('#details').showModal()
}

function startPolling(){clearInterval(pollTimer);pollTimer=setInterval(()=>{if(!document.hidden&&navigator.onLine)load({force:true})},300000)}
function startRealtime(){
  if(realtimeChannel)return
  realtimeChannel=supabase.channel('hd-kanban').on('postgres_changes',{event:'*',schema:'hd_kanban',table:'fornos'},scheduleLoad).on('postgres_changes',{event:'*',schema:'hd_kanban',table:'apontamentos'},scheduleLoad).on('postgres_changes',{event:'*',schema:'hd_kanban',table:'planejamento_kanban'},scheduleLoad).subscribe(status=>{if(status==='SUBSCRIBED')setStatus('connected',state.lastSuccess?`Atualizado às ${new Date(state.lastSuccess).toLocaleTimeString('pt-BR')}`:'Conectado');else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status))setStatus('reconnecting','Reconectando…')})
  startPolling()
}
async function stopRealtime(){clearInterval(pollTimer);if(!realtimeChannel)return;const channel=realtimeChannel;realtimeChannel=null;await supabase.removeChannel(channel)}
async function showSession(session){$('#login').hidden=!!session;$('#app').hidden=!session;if(session){$('#user-label').textContent=session.user.email;$('#integration-health-button').hidden=session.user.app_metadata?.hd_role!=='ADMIN';await load({force:true});startRealtime()}else await stopRealtime()}

$('#login-form').onsubmit=async e=>{e.preventDefault();try{$('#login-error').textContent='';await login($('#email').value,$('#password').value)}catch(x){$('#login-error').textContent=x.message}}
$('#magic-link').onclick=async()=>{try{await magicLink($('#email').value);$('#login-error').textContent='Link enviado. Verifique seu e-mail.'}catch(x){$('#login-error').textContent=x.message}}
$('#logout').onclick=()=>supabase.auth.signOut();$('#close-details').onclick=()=>$('#details').close()
document.querySelectorAll('.filters input,.filters select').forEach(x=>x.oninput=render)
$('#clear-delivery-period').onclick=()=>{$('#delivery-from').value='';$('#delivery-to').value='';$('#delivery-period-error').textContent='';render()}
$('#finalized-period').onchange=()=>{$('#finalized-dates').hidden=$('#finalized-period').value!=='custom';render()}
$('#metric-mode').value=state.metricMode;$('#metric-mode').onchange=e=>{state.metricMode=e.target.value;localStorage.setItem('hd-kanban-metrics',state.metricMode);render()}
$('#view-mode').value=state.view;$('#view-mode').onchange=e=>{state.view=e.target.value;localStorage.setItem('hd-kanban-view',state.view);render()}
function openIssues(){const affected=new Set(state.issues.map(x=>String(x.card.n_serie||'')).filter(Boolean)),categories=[...new Set(state.issues.map(x=>x.type))].sort();$('#issues-content').innerHTML=`<h2>Pendências de Dados</h2><p>Diagnóstico administrativo somente leitura · atualizado em ${new Date().toLocaleString('pt-BR')}</p><div class="metrics"><div class="metric"><span>Ocorrências</span><strong>${state.issues.length}</strong></div><div class="metric"><span>Fornos afetados</span><strong>${affected.size}</strong></div><div class="metric"><span>Categorias</span><strong>${categories.length}</strong></div></div><div class="filters"><input id="issue-search" placeholder="Pesquisar número de série"><select id="issue-category"><option value="">Todas as categorias</option>${categories.map(value=>`<option>${esc(value)}</option>`).join('')}</select><button id="issue-export" type="button">Exportar relatório</button></div><div class="table-wrap"><table><thead><tr><th>Série</th><th>Cliente</th><th>Modelo</th><th>Status atual</th><th>Tipo</th><th>Evidência</th><th>Fonte consultada</th><th>Última sincronização</th><th>Ação recomendada</th><th>Investigação</th></tr></thead><tbody id="issue-body"></tbody></table></div>`;const draw=()=>{const query=$('#issue-search').value.trim().toLowerCase(),category=$('#issue-category').value;$('#issue-body').innerHTML=state.issues.filter(x=>(!query||String(x.card.n_serie||'').toLowerCase().includes(query))&&(!category||x.type===category)).map(x=>`<tr><td>${esc(x.card.n_serie||'Sem série')}</td><td>${esc(x.card.cliente||'—')}</td><td>${esc(x.card.modelo||'—')}</td><td>${esc(x.card.status_forno||'—')}</td><td>${esc(x.type)}</td><td>${esc(x.evidence||'Regra de classificação')}</td><td>Supabase · sincronização AppSheet</td><td>${x.card.updated_at?new Date(x.card.updated_at).toLocaleString('pt-BR'):'—'}</td><td>${esc(x.action||'Consultar cadastro')}</td><td><span class="badge">Pendente de validação na origem</span></td></tr>`).join('')||'<tr><td colspan="10">Nenhuma pendência neste filtro.</td></tr>'};$('#issue-search').oninput=draw;$('#issue-category').onchange=draw;$('#issue-export').onclick=()=>{const rows=[['Série','Cliente','Modelo','Status','Tipo','Evidência','Ação'],...state.issues.map(x=>[x.card.n_serie,x.card.cliente,x.card.modelo,x.card.status_forno,x.type,x.evidence,x.action])],content=rows.map(row=>row.map(value=>`"${String(value??'').replaceAll('"','""')}"`).join(';')).join('\r\n'),link=document.createElement('a');link.href=URL.createObjectURL(new Blob(['\ufeff'+content],{type:'text/csv'}));link.download='pendencias-kanban.csv';link.click();URL.revokeObjectURL(link.href)};draw();$('#issues').showModal()}
$('#issues-button').onclick=openIssues;$('#close-issues').onclick=()=>$('#issues').close()
async function openIntegrationHealth(){const dialog=$('#integration-health'),content=$('#integration-health-content');dialog.showModal();content.innerHTML='<h2>Saúde da Integração</h2><p>Carregando diagnóstico…</p>';const{data,error}=await supabase.schema('hd_kanban').rpc('saude_integracao');if(error){content.innerHTML=`<h2>Saúde da Integração</h2><p class="filter-error">${esc(error.message)}</p>`;return}const rows=data?.ultimos_lotes??[];content.innerHTML=`<h2>Saúde da Integração</h2><p>Consulta administrativa sob demanda, sem polling adicional.</p><div class="metrics">${metric('Pendentes',data?.pendentes??0)}${metric('Processando',data?.processando??0)}${metric('Falhas em 24h',data?.falhas_24h??0)}${metric('Lidos em 24h',data?.lidos_24h??0)}${metric('Gravados em 24h',data?.gravados_24h??0)}${metric('Ignorados em 24h',data?.ignorados_24h??0)}</div><p><b>Último sucesso:</b> ${data?.ultima_sincronizacao?new Date(data.ultima_sincronizacao).toLocaleString('pt-BR'):'—'}<br><b>Última falha:</b> ${data?.ultima_falha?new Date(data.ultima_falha).toLocaleString('pt-BR'):'—'}</p><div class="table-wrap"><table><thead><tr><th>Início</th><th>Origem</th><th>Status</th><th>Lidos</th><th>Inseridos</th><th>Atualizados</th><th>Ignorados</th><th>Erros</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${row.inicio?new Date(row.inicio).toLocaleString('pt-BR'):'—'}</td><td>${esc(row.origem||'—')}</td><td>${esc(row.status||'—')}</td><td>${row.registros_lidos||0}</td><td>${row.registros_inseridos||0}</td><td>${row.registros_atualizados||0}</td><td>${row.registros_ignorados||0}</td><td>${row.erros||0}</td></tr>`).join('')||'<tr><td colspan="8">Sem execuções registradas.</td></tr>'}</tbody></table></div>`}
$('#integration-health-button').onclick=openIntegrationHealth;$('#close-integration-health').onclick=()=>$('#integration-health').close()
const legend=$('#color-legend')
$('#legend-content').innerHTML=`<div class="legend-sections">${COLOR_LEGEND.map(section=>`<section class="legend-section"><h3>${esc(section.title)}</h3><ul class="legend-list">${section.items.map(item=>`<li class="legend-item"><span class="legend-swatch ${esc(item.className)}" aria-hidden="true"></span><span><strong>${esc(item.label)}:</strong> ${esc(item.description)}</span></li>`).join('')}</ul></section>`).join('')}</div>`
$('#legend-button').onclick=()=>legend.showModal()
$('#close-legend').onclick=()=>legend.close()
legend.addEventListener('click',event=>{if(event.target===legend)legend.close()})
$('#close-column').onclick=()=>$('#column-view').close()
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine)load()});window.addEventListener('online',()=>load({force:true}));window.addEventListener('offline',()=>setStatus('stale','Dados desatualizados · sem conexão'))
supabase.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>showSession(session),0)})
const {data:{session}}=await supabase.auth.getSession();await showSession(session)
