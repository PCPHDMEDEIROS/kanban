import {supabase} from './supabase.js'
import {activeCards,deliveryRisk,demandByModel,pcpMetrics,suggestLots,unplanned,weeks,weekFor} from './pcp-core.js'
import {fetchAllCards} from './data.js'

const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
let cards=[],session=null,channel=null,loadPromise=null,reloadTimer=null,pollTimer=null,lastSuccess=0,dirty=false
const selected=new Set()
const canEdit=()=>['ADMIN','PCP'].includes(session?.user?.app_metadata?.hd_role)
const fmt=value=>value?new Date(`${String(value).slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR'):'—'
function status(text,error=false){$('#pcp-status').textContent=text;$('#pcp-status').classList.toggle('error',error)}
function metric(label,value,note=''){return`<article class="metric"><span>${label}</span><strong>${value}</strong>${note?`<small>${note}</small>`:''}</article>`}
function filtered(){const q=$('#pcp-search').value.trim().toLowerCase(),model=$('#pcp-model').value;return cards.filter(c=>(!q||[c.n_serie,c.cliente,c.modelo].some(v=>String(v??'').toLowerCase().includes(q)))&&(!model||c.modelo===model))}
function render(){
  const list=filtered(),m=pcpMetrics(list),periods=weeks()
  $('#pcp-metrics').innerHTML=[metric('Carteira pendente',m.total),metric('A produzir',m.aProduzir),metric('Em fabricação',m.fabricacao),metric('Atrasados',m.atrasados),metric('Entregas na semana',m.entregasSemana),metric('Entregas em 15 dias',m.entregas15),metric('Planejados na semana',m.planejadosSemana),metric('Sem programação',m.semProgramacao),metric('Capacidade semanal','Não configurado','Cadastre horas e recursos na fase de capacidade')].join('')
  const demand=demandByModel(list);$('#demand-body').innerHTML=demand.map(x=>`<tr><td>${esc(x.modelo)}</td><td>${x.total}</td><td>${m.total?Math.round(x.total/m.total*100):0}%</td></tr>`).join('')||'<tr><td colspan="3">Nenhum forno no filtro.</td></tr>'
  $('#weeks').innerHTML=periods.map(w=>{const planned=activeCards(list).filter(c=>weekFor(c,[w]));return`<article class="week-card" data-week="${w.key}"><h3>${w.label}</h3><p>${fmt(w.key)} a ${w.end.toLocaleDateString('pt-BR')}</p><strong>${planned.length} fornos</strong><span>Capacidade: Não configurado</span><div>${planned.slice(0,20).map(c=>`<button draggable="${canEdit()}" data-planned-serie="${esc(c.n_serie)}">NS ${esc(c.n_serie)} · ${esc(c.modelo)}</button>`).join('')||'<em>Sem fornos programados</em>'}</div></article>`}).join('')
  const pending=unplanned(list);$('#unplanned-count').textContent=pending.length;$('#unplanned-body').innerHTML=pending.slice(0,100).map(c=>`<tr><td>${canEdit()?`<input type="checkbox" data-select-serie="${esc(c.n_serie)}" ${selected.has(String(c.n_serie))?'checked':''}>`:''}${esc(c.n_serie)}</td><td>${esc(c.modelo||'—')}</td><td>${esc(c.cliente||'—')}</td><td>${fmt(c.data_entrega)}</td><td class="${c.atrasado?'danger-text':''}">${c.dias_para_entrega??'—'}</td><td>${esc(c.operacao_atual||'Não iniciado')}</td><td>${c.prioridade??0}</td></tr>`).join('')||'<tr><td colspan="7">Nenhum forno sem programação.</td></tr>'
  document.querySelectorAll('[data-select-serie]').forEach(el=>el.onchange=()=>{el.checked?selected.add(el.dataset.selectSerie):selected.delete(el.dataset.selectSerie);dirty=selected.size>0;$('#plan-selected').hidden=!canEdit()||!selected.size})
  document.querySelectorAll('[data-planned-serie]').forEach(el=>el.ondragstart=e=>e.dataTransfer.setData('text/plain',el.dataset.plannedSerie))
  document.querySelectorAll('[data-week]').forEach(el=>{el.ondragover=e=>{if(canEdit())e.preventDefault()};el.ondrop=async e=>{e.preventDefault();const serie=e.dataTransfer.getData('text/plain');if(serie)await savePlanning([serie],el.dataset.week,'Reprogramação por arrastar e soltar')}})
  $('#lot-suggestions').innerHTML=suggestLots(list).slice(0,10).map(l=>`<article class="suggestion"><b>${esc(l.modelo)} · ${l.quantidade} fornos</b><p>${esc(l.series.slice(0,12).join(', '))}</p><small>${esc(l.justificativa)}</small></article>`).join('')||'<p>Nenhuma sugestão no filtro.</p>'
  const risks=activeCards(list).map(c=>({card:c,risk:deliveryRisk(c)})).filter(x=>['CRÍTICO','ATENÇÃO'].includes(x.risk.level)).sort((a,b)=>a.card.dias_para_entrega-b.card.dias_para_entrega);$('#risk-list').innerHTML=risks.slice(0,20).map(x=>`<p><b>${esc(x.risk.level)} · NS ${esc(x.card.n_serie)}</b><br><small>${esc(x.risk.reason)}</small></p>`).join('')||'<p>Nenhum risco determinável no filtro.</p>'
}
async function load(force=false){
  if(!force&&Date.now()-lastSuccess<5000)return
  if(loadPromise)return loadPromise
  status('Atualizando…')
  loadPromise=fetchAllCards(supabase).then(result=>{if(!result.complete)throw new Error(`Carga incompleta: ${result.rows.length} de ${result.total}`);cards=result.rows;const current=$('#pcp-model').value;const models=[...new Set(cards.map(c=>c.modelo).filter(Boolean))].sort();$('#pcp-model').innerHTML='<option value="">Todos os modelos</option>'+models.map(m=>`<option>${esc(m)}</option>`).join('');$('#pcp-model').value=current;lastSuccess=Date.now();render();status(`Atualizado às ${new Date(lastSuccess).toLocaleTimeString('pt-BR')}`)}).catch(error=>status(`Erro de sincronização: ${error.message}`,true)).finally(()=>{loadPromise=null})
  return loadPromise
}
function scheduleLoad(){if(dirty){status('Alteração externa detectada; conclua ou cancele sua seleção.',true);return}clearTimeout(reloadTimer);reloadTimer=setTimeout(()=>load(true),500)}
function startSync(){if(channel)return;channel=supabase.channel('hd-pcp').on('postgres_changes',{event:'*',schema:'hd_kanban',table:'fornos'},scheduleLoad).on('postgres_changes',{event:'*',schema:'hd_kanban',table:'apontamentos'},scheduleLoad).on('postgres_changes',{event:'*',schema:'hd_kanban',table:'planejamento_kanban'},scheduleLoad).subscribe(s=>{if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(s))status('Reconectando…',true)});pollTimer=setInterval(()=>{if(!document.hidden&&navigator.onLine)load()},60000)}
async function stopSync(){clearInterval(pollTimer);if(channel){const old=channel;channel=null;await supabase.removeChannel(old)}}
async function show(current){session=current;$('#pcp-login').hidden=!!session;$('#pcp-app').hidden=!session;if(session){$('#pcp-user').textContent=session.user.email;await load(true);startSync()}else await stopSync()}
$('#pcp-login-form').onsubmit=async e=>{e.preventDefault();const {error}=await supabase.auth.signInWithPassword({email:$('#pcp-email').value,password:$('#pcp-password').value});if(error)$('#pcp-login-error').textContent=error.message}
$('#pcp-logout').onclick=()=>supabase.auth.signOut();$('#pcp-search').oninput=render;$('#pcp-model').onchange=render
$('#plan-selected').onclick=()=>{const periods=weeks();$('#target-week').innerHTML=periods.map(w=>`<option value="${w.key}">${w.label} · ${fmt(w.key)}</option>`).join('');$('#planning-dialog').showModal()}
$('#close-planning').onclick=()=>{$('#planning-dialog').close();selected.clear();dirty=false;render()}
$('#confirm-planning').onclick=async()=>savePlanning([...selected],$('#target-week').value,$('#planning-reason').value)
async function savePlanning(series,week,reason){if(!canEdit())return;$('#planning-feedback').textContent='Salvando…';const rows=series.map(n_serie=>({n_serie,planejado_para:week,observacao_pcp:reason||null,updated_by:session.user.id}));const {error}=await supabase.schema('hd_kanban').from('planejamento_kanban').upsert(rows,{onConflict:'n_serie'});if(error){$('#planning-feedback').textContent=error.message;return}selected.clear();dirty=false;$('#planning-dialog').close();await load(true)}
$('#view-history').onclick=async()=>{const {data,error}=await supabase.schema('hd_kanban').from('historico_planejamento').select('n_serie,semana_anterior,semana_nova,prioridade_anterior,prioridade_nova,justificativa,alterado_em').order('alterado_em',{ascending:false}).limit(100);$('#history-table').innerHTML=error?esc(error.message):`<div class="table-wrap"><table><thead><tr><th>Série</th><th>Anterior</th><th>Nova</th><th>Justificativa</th><th>Data</th></tr></thead><tbody>${(data||[]).map(h=>`<tr><td>${esc(h.n_serie)}</td><td>${fmt(h.semana_anterior)}</td><td>${fmt(h.semana_nova)}</td><td>${esc(h.justificativa||'—')}</td><td>${new Date(h.alterado_em).toLocaleString('pt-BR')}</td></tr>`).join('')}</tbody></table></div>`;$('#planning-history').showModal()};$('#close-history').onclick=()=>$('#planning-history').close()
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine)load()});window.addEventListener('online',()=>load(true));window.addEventListener('offline',()=>status('Dados desatualizados · sem conexão',true))
supabase.auth.onAuthStateChange((_event,current)=>setTimeout(()=>show(current),0));const {data:{session:current}}=await supabase.auth.getSession();await show(current)

