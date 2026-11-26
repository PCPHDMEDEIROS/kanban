const board=document.querySelector('#suggestion-board')
const iso=label=>{const match=label.match(/(\d{2})\/(\d{2})\/(\d{4})/);return match?`${match[3]}-${match[2]}-${match[1]}`:null}
function enhance(){
  const weeks=[...new Set([...board.querySelectorAll('.week-card h3')].map(node=>iso(node.textContent)).filter(Boolean))].sort()
  if(!weeks.length)return
  for(const lot of board.querySelectorAll('.lot-card')){
    const first=lot.querySelector('[data-forno]'),current=iso(lot.closest('.week-card')?.querySelector('h3')?.textContent||'');if(!first||lot.querySelector('[data-adjust-lot]'))continue
    const lotSelect=document.createElement('select');lotSelect.dataset.adjustLot='';lotSelect.setAttribute('aria-label','Alterar semana de todo o lote');lotSelect.innerHTML=weeks.map(week=>`<option value="${week}" ${week===current?'selected':''}>Semana ${week.split('-').reverse().join('/')}</option>`).join('');lot.querySelector('p')?.before(lotSelect)
    for(const checkbox of lot.querySelectorAll('[data-forno]')){const select=document.createElement('select');select.dataset.manualWeek=checkbox.dataset.forno;select.setAttribute('aria-label',`Alterar semana da série ${checkbox.parentElement.textContent.trim()}`);select.innerHTML=lotSelect.innerHTML;select.value=current;checkbox.closest('li').append(select)}
    const update=()=>{let note=document.querySelector('#manual-adjustment-note');if(!note){note=document.createElement('p');note.id='manual-adjustment-note';note.className='capacity-warning';board.before(note)}const counts=new Map;document.querySelectorAll('[data-manual-week]').forEach(select=>counts.set(select.value,(counts.get(select.value)||0)+1));note.textContent='Distribuição após ajustes manuais: '+[...counts].sort().map(([week,total])=>`${week}: ${total}`).join(' · ')}
    lotSelect.onchange=()=>{lot.querySelectorAll('[data-manual-week]').forEach(select=>select.value=lotSelect.value);update()};lot.querySelectorAll('[data-manual-week]').forEach(select=>select.onchange=update);update()
  }
}
new MutationObserver(enhance).observe(board,{childList:true,subtree:true});enhance()
