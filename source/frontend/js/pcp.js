import {supabase} from './supabase.js'
import {activeCards,demandByModel,pcpMetrics,unplanned,weeks,weekFor} from './pcp-core.js'
import {fetchAllCards} from './data.js'

const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
let cards=[],session=null,channel=null,loadPromise=null,reloadTimer=null,pollTimer=null,lastSuccess=0
const fmt=value=>value?new Date(`${String(value).slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR'):'—'
function status(text,error=false){$('#pcp-status').textContent=text;$('#pcp-status').classList.toggle('error',error)}
function metric(label,value,note=''){return`<article class="metric"><span>${label}</span><strong>${value}</strong>${note?`<small>${note}</small>`:''}</article>`}
function filtered(){const q=$('#pcp-search').value.trim().toLowerCase(),model=$('#pcp-model').value;return cards.filter(c=>(!q||[c.n_serie,c.cliente,c.modelo].some(v=>String(v??'').toLowerCase().includes(q)))&&(!model||c.modelo===model))}
function render(){
  const list=filtered(),m=pcpMetrics(list),periods=weeks()
  $('#pcp-metrics').innerHTML=[metric('Carteira pendente',m.total),metric('A produzir',m.aProduzir),metric('Em fabricação',m.fabricacao),metric('Atrasados',m.atrasados),metric('Entregas na semana',m.entregasSemana),metric('Entregas em 15 dias',m.entregas15),metric('Planejados na semana',m.planejadosSemana),metric('Sem programação',m.semProgramacao),metric('Capacidade semanal','Não configurado','Cadastre horas e recursos na fase de capacidade')].join('')
  const demand=demandByModel(list);$('#demand-body').innerHTML=demand.map(x=>`<tr><td>${esc(x.modelo)}</td><td>${x.total}</td><td>${m.total?Math.round(x.total/m.total*100):0}%</td></tr>`).join('')||'<tr><td colspan="3">Nenhum forno no filtro.</td></tr>'
  $('#weeks').innerHTML=periods.map(w=>{const planned=activeCards(list).filter(c=>weekFor(c,[w]));return`<article class="week-card"><h3>${w.label}</h3><p>${fmt(w.key)} a ${w.end.toLocaleDateString('pt-BR')}</p><strong>${planned.length} fornos</strong><span>Capacidade: Não configurado</span><div>${planned.slice(0,8).map(c=>`<button data-serie="${esc(c.n_serie)}">NS ${esc(c.n_serie)} · ${esc(c.modelo)}</button>`).join('')||'<em>Sem fornos programados</em>'}</div></article>`}).join('')
  const pending=unplanned(list);$('#unplanned-count').textContent=pending.length;$('#unplanned-body').innerHTML=pending.slice(0,100).map(c=>`<tr><td>${esc(c.n_serie)}</td><td>${esc(c.modelo||'—')}</td><td>${esc(c.cliente||'—')}</td><td>${fmt(c.data_entrega)}</td><td class="${c.atrasado?'danger-text':''}">${c.dias_para_entrega??'—'}</td><td>${esc(c.operacao_atual||'Não iniciado')}</td><td>${c.prioridade??0}</td></tr>`).join('')||'<tr><td colspan="7">Nenhum forno sem programação.</td></tr>'
}
async function load(force=false){
  if(!force&&Date.now()-lastSuccess<5000)return
  if(loadPromise)return loadPromise
  status('Atualizando…')
  loadPromise=fetchAllCards(supabase).then(result=>{if(!result.complete)throw new Error(`Carga incompleta: ${result.rows.length} de ${result.total}`);cards=result.rows;const current=$('#pcp-model').value;const models=[...new Set(cards.map(c=>c.modelo).filter(Boolean))].sort();$('#pcp-model').innerHTML='<option value="">Todos os modelos</option>'+models.map(m=>`<option>${esc(m)}</option>`).join('');$('#pcp-model').value=current;lastSuccess=Date.now();render();status(`Atualizado às ${new Date(lastSuccess).toLocaleTimeString('pt-BR')}`)}).catch(error=>status(`Erro de sincronização: ${error.message}`,true)).finally(()=>{loadPromise=null})
  return loadPromise
}
function scheduleLoad(){clearTimeout(reloadTimer);reloadTimer=setTimeout(()=>load(true),500)}
function startSync(){if(channel)return;channel=supabase.channel('hd-pcp').on('postgres_changes',{event:'*',schema:'hd_kanban',table:'fornos'},scheduleLoad).on('postgres_changes',{event:'*',schema:'hd_kanban',table:'apontamentos'},scheduleLoad).on('postgres_changes',{event:'*',schema:'hd_kanban',table:'planejamento_kanban'},scheduleLoad).subscribe(s=>{if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(s))status('Reconectando…',true)});pollTimer=setInterval(()=>{if(!document.hidden&&navigator.onLine)load()},60000)}
async function stopSync(){clearInterval(pollTimer);if(channel){const old=channel;channel=null;await supabase.removeChannel(old)}}
async function show(current){session=current;$('#pcp-login').hidden=!!session;$('#pcp-app').hidden=!session;if(session){$('#pcp-user').textContent=session.user.email;await load(true);startSync()}else await stopSync()}
$('#pcp-login-form').onsubmit=async e=>{e.preventDefault();const {error}=await supabase.auth.signInWithPassword({email:$('#pcp-email').value,password:$('#pcp-password').value});if(error)$('#pcp-login-error').textContent=error.message}
$('#pcp-logout').onclick=()=>supabase.auth.signOut();$('#pcp-search').oninput=render;$('#pcp-model').onchange=render
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine)load()});window.addEventListener('online',()=>load(true));window.addEventListener('offline',()=>status('Dados desatualizados · sem conexão',true))
supabase.auth.onAuthStateChange((_event,current)=>setTimeout(()=>show(current),0));const {data:{session:current}}=await supabase.auth.getSession();await show(current)

