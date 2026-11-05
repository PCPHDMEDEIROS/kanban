import {supabase} from './supabase.js'
import {classifyCard,diagnose,finalizedDate,metrics,operationKey,uniqueCards} from './kanban-core.js'
import {fetchAllCards} from './data.js'

const state={cards:[],operations:[],issues:[],limits:{},view:localStorage.getItem('hd-kanban-view')||'compact',metricMode:localStorage.getItem('hd-kanban-metrics')||'filtered',lastSuccess:0,retry:0}
const $=s=>document.querySelector(s)
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
let realtimeChannel=null,reloadTimer=null,pollTimer=null,retryTimer=null,loadPromise=null,loadAgain=false
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

function scheduleLoad(){clearTimeout(reloadTimer);reloadTimer=setTimeout(()=>load({force:true}),500)}
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
function visible(c){return searchMatches(c)&&(!$('#status-caixa').value||c.status_caixa===$('#status-caixa').value)&&(!$('#only-late').checked||c.atrasado)&&(!$('#only-open').checked||c.apontamento_aberto)&&(!$('#only-blocked').checked||c.bloqueado)&&(c.status_forno!=='FINALIZADO'||finalizedInPeriod(c))}
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
  const rows=(history??[]).map(h=>`<div class="history-item"><b>${esc(h.operacao)}</b> · ${esc(h.operador||'—')}<br><small>${esc(h.hora_inicial||h.data_hora||'—')} → ${esc(h.hora_final||'aberto')}</small></div>`).join('')
  if(!append)$('#details-content').innerHTML=`<h2>NS ${esc(serie)} — ${esc(c.modelo||'')}</h2><p><b>${esc(c.cliente)}</b></p><dl><dt>Entrega</dt><dd>${formatDate(c.data_entrega)}</dd><dt>Forno</dt><dd>${esc(c.status_forno)}</dd><dt>Caixa</dt><dd>${esc(c.status_caixa)}</dd><dt>Operação atual</dt><dd>${esc(c.operacao_atual||'—')}</dd></dl><h3>Histórico produtivo</h3><div id="history" class="history"></div><button id="load-history" type="button">Carregar mais histórico</button>`
  $('#history').insertAdjacentHTML('beforeend',rows||(!append?'Sem apontamentos':''));detailOffset+=(history??[]).length
  $('#load-history').hidden=(history??[]).length<50;$('#load-history').onclick=()=>detail(detailSerie,true);$('#details').showModal()
}

function startPolling(){clearInterval(pollTimer);pollTimer=setInterval(()=>{if(!document.hidden&&navigator.onLine)load()},60000)}
function startRealtime(){
  if(realtimeChannel)return
  realtimeChannel=supabase.channel('hd-kanban').on('postgres_changes',{event:'*',schema:'hd_kanban',table:'fornos'},scheduleLoad).on('postgres_changes',{event:'*',schema:'hd_kanban',table:'apontamentos'},scheduleLoad).on('postgres_changes',{event:'*',schema:'hd_kanban',table:'planejamento_kanban'},scheduleLoad).subscribe(status=>{if(status==='SUBSCRIBED')setStatus('connected',state.lastSuccess?`Atualizado às ${new Date(state.lastSuccess).toLocaleTimeString('pt-BR')}`:'Conectado');else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status))setStatus('reconnecting','Reconectando…')})
  startPolling()
}
async function stopRealtime(){clearInterval(pollTimer);if(!realtimeChannel)return;const channel=realtimeChannel;realtimeChannel=null;await supabase.removeChannel(channel)}
async function showSession(session){$('#login').hidden=!!session;$('#app').hidden=!session;if(session){$('#user-label').textContent=session.user.email;await load({force:true});startRealtime()}else await stopRealtime()}

$('#login-form').onsubmit=async e=>{e.preventDefault();try{$('#login-error').textContent='';await login($('#email').value,$('#password').value)}catch(x){$('#login-error').textContent=x.message}}
$('#magic-link').onclick=async()=>{try{await magicLink($('#email').value);$('#login-error').textContent='Link enviado. Verifique seu e-mail.'}catch(x){$('#login-error').textContent=x.message}}
$('#logout').onclick=()=>supabase.auth.signOut();$('#close-details').onclick=()=>$('#details').close()
document.querySelectorAll('.filters input,.filters select').forEach(x=>x.oninput=render)
$('#finalized-period').onchange=()=>{$('#finalized-dates').hidden=$('#finalized-period').value!=='custom';render()}
$('#metric-mode').value=state.metricMode;$('#metric-mode').onchange=e=>{state.metricMode=e.target.value;localStorage.setItem('hd-kanban-metrics',state.metricMode);render()}
$('#view-mode').value=state.view;$('#view-mode').onchange=e=>{state.view=e.target.value;localStorage.setItem('hd-kanban-view',state.view);render()}
$('#issues-button').onclick=()=>{const body=state.issues.map(x=>`<tr><td>${esc(x.card.n_serie||'Sem série')}</td><td>${esc(x.type)}</td><td>${esc(x.evidence||'Regra de classificação')}</td><td>${esc(x.action||'Consultar cadastro')}</td></tr>`).join('');$('#issues-content').innerHTML=`<h2>Pendências de Dados</h2><p>Diagnóstico somente leitura · verificado em ${new Date().toLocaleString('pt-BR')}</p><div class="table-wrap"><table><thead><tr><th>Série</th><th>Tipo</th><th>Evidência</th><th>Ação recomendada</th></tr></thead><tbody>${body||'<tr><td colspan="4">Nenhuma pendência detectada.</td></tr>'}</tbody></table></div>`;$('#issues').showModal()};$('#close-issues').onclick=()=>$('#issues').close()
$('#close-column').onclick=()=>$('#column-view').close()
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine)load()});window.addEventListener('online',()=>load({force:true}));window.addEventListener('offline',()=>setStatus('stale','Dados desatualizados · sem conexão'))
supabase.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>showSession(session),0)})
const {data:{session}}=await supabase.auth.getSession();await showSession(session)

