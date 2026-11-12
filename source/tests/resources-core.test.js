import test from 'node:test'
import assert from 'node:assert/strict'
import {availableCapacity,capacityForDate,capacityStatus,electricalCandidatesWithState} from '../frontend/js/resources-core.js'

test('capacidade considera horas, eficiência e operadores sem inventar ausentes',()=>{assert.equal(availableCapacity({horas_semanais:40,eficiencia:.8,quantidade_operadores:3}),96);assert.equal(availableCapacity({horas_semanais:40}),null)})
test('vigência mais recente é usada na data consultada',()=>{const rows=[{id:'a',operacao_id:'op',vigencia_inicio:'2026-01-01',vigencia_fim:null},{id:'b',operacao_id:'op',vigencia_inicio:'2026-10-01',vigencia_fim:null}];assert.equal(capacityForDate(rows,'op','2026-11-12').id,'b')})
test('ocupação só é afirmada com capacidade válida',()=>{assert.equal(capacityStatus(10,null).level,'unknown');assert.equal(capacityStatus(110,100).level,'overload')})
test('elétrica inclui programados, montagem geral e acompanhamentos existentes',()=>{const cards=[{forno_id:'1',status_forno:'FABRICAÇÃO',planejado_para:'2026-11-16'},{forno_id:'2',status_forno:'FABRICAÇÃO',operacao_atual:'MONT.GERAL'},{forno_id:'3',status_forno:'FABRICAÇÃO'},{forno_id:'4',status_forno:'FINALIZADO'}],rows=[{forno_id:'3',status:'MATERIAIS_PRONTOS'}];assert.deepEqual(electricalCandidatesWithState(cards,rows).map(x=>x.forno_id).sort(),['1','2','3'])})

