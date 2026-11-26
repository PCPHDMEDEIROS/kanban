import test from 'node:test'
import assert from 'node:assert/strict'
import {createSimulationState,createHistory,recalculateLoads,serializeSimulation,restoreSimulation} from '../frontend/js/simulation-core.js'

const card=(id,model='HD80-11')=>({forno_id:id,n_serie:id,modelo:model,tensao:'220',controlador:'INV'})
const base=()=>createSimulationState({lots:[{id:'l1',code:'L1',week:'2026-11-23',cards:[card('1'),card('2')]}],unscheduled:[{card:card('3'),reason:'Sem vaga'}],weeklyLoads:[{week:'2026-11-23',existing:4,reference:23}]})

test('move forno para sem programação e desfaz',()=>{const h=createHistory(base());h.dispatch({type:'MOVE_FURNACE',fornoId:'1'});assert.equal(h.state.unscheduled.length,2);assert.equal(h.state.lots[0].cards.length,1);h.undo();assert.equal(h.state.lots[0].cards.length,2);h.redo();assert.equal(h.state.unscheduled.length,2)})
test('divide lote sem duplicar participante',()=>{const h=createHistory(base());h.dispatch({type:'SPLIT_LOT',lotId:'l1',fornoIds:['2'],code:'L2'});assert.equal(h.state.lots.length,2);assert.equal(new Set(h.state.lots.flatMap(x=>x.cards.map(c=>c.forno_id))).size,2)})
test('valida compatibilidade ao criar lote',()=>{const state=base();state.unscheduled.push(card('4','HD100'));const h=createHistory(state);assert.throws(()=>h.dispatch({type:'CREATE_LOT',fornoIds:['3','4'],week:'2026-11-30'}),/compatível/)})
test('recalcula ocupação e restaura rascunho com lote lógico estável',()=>{const state=base(),loads=recalculateLoads(state);assert.deepEqual(loads[0],{week:'2026-11-23',existing:4,reference:23,suggested:2,projected:6});const restored=restoreSimulation(serializeSimulation(state,{model:'HD80'},{goal:100}));assert.equal(restored.state.lots[0].cards.length,2);assert.equal(restored.state.lots[0].id,'l1')})
