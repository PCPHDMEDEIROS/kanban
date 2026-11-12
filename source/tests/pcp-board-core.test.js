import test from 'node:test'
import assert from 'node:assert/strict'
import {cardsInColumn,dateKey,joinLots,mondayKey,paginate,planningColumns,sortBoardItems,unassignedPlanned,weekInterval} from '../frontend/js/pcp-board-core.js'

test('semanas usam calendário local inclusive em dezembro e janeiro',()=>{
  assert.equal(mondayKey('2027-01-01'),'2026-12-28')
  assert.equal(dateKey(weekInterval('2026-12-28').end),'2027-01-03')
})

test('kanban PCP cria semanas dinâmicas e sem programação',()=>{const cards=[{planejado_para:null},{planejado_para:'2026-11-09'},{planejado_para:'2026-12-07'}],cols=planningColumns(cards,new Date(2026,10,12,12));assert.equal(cols[0].key,'UNPLANNED');assert.ok(cols.some(x=>x.key==='2026-12-07'));assert.equal(cardsInColumn(cards,'UNPLANNED').length,1)})

test('lotes usam somente vínculos ativos e não duplicam participantes',()=>{const cards=[{forno_id:'a',status_forno:'FABRICAÇÃO',tem_apontamento_produtivo:false,status_caixa:'COMPRAR'},{forno_id:'b',status_forno:'FINALIZADO',tem_apontamento_produtivo:true}],lots=[{id:'l',codigo:'L1',status:'PLANEJADO'}],links=[{lote_id:'l',forno_id:'a',ativo:true},{lote_id:'l',forno_id:'a',ativo:true},{lote_id:'l',forno_id:'b',ativo:false}];const [lot]=joinLots(lots,links,cards);assert.equal(lot.quantity,1);assert.equal(lot.notStarted,1);assert.equal(lot.materialIssues,1)})

test('lotes cancelados somem e fornos programados sem lote permanecem',()=>{const cards=[{forno_id:'a',planejado_para:'2026-11-09'},{forno_id:'b',planejado_para:'2026-11-09'}],links=[{lote_id:'x',forno_id:'a',ativo:true}];assert.equal(joinLots([{id:'x',status:'CANCELADO'}],links,cards).length,0);assert.deepEqual(unassignedPlanned(cards,links).map(x=>x.forno_id),['b'])})

test('paginação não altera total e permite ordenação',()=>{const items=Array.from({length:55},(_,i)=>({n_serie:String(55-i),prioridade:i%3}));const page=paginate(items,30);assert.equal(page.visible.length,30);assert.equal(page.total,55);assert.equal(page.hasMore,true);assert.equal(sortBoardItems(items,'SERIAL')[0].n_serie,'1')})

