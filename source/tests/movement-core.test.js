import test from 'node:test'
import assert from 'node:assert/strict'
import {movementImpact,movementVersions,validateMovement} from '../frontend/js/movement-core.js'

test('movimento de lote congela versões de todos os participantes',()=>{const item={versao:3,participants:[{forno_id:'a'},{forno_id:'b'}]};assert.deepEqual(movementVersions('LOTE',item,new Map([['a',2],['b',4]])),{lote:3,a:2,b:4})})
test('impacto informa quantidade, riscos e normaliza segunda-feira',()=>{const item={semana_planejada:'2026-11-09',participants:[{atrasado:true},{dias_para_entrega:4}]};const result=movementImpact('LOTE',item,'2026-11-18');assert.equal(result.to,'2026-11-16');assert.equal(result.affected,2);assert.equal(result.delayed,1);assert.equal(result.critical,1)})
test('retirada da programação produz destino nulo e exige justificativa',()=>{const result=movementImpact('FORNO',{forno_id:'a',planejado_para:'2026-11-09'},null);assert.equal(result.to,null);assert.equal(validateMovement(result,'Retirar da programação').valid,true);assert.equal(validateMovement(result,'').valid,false)})
test('reprogramação exige mudança e justificativa',()=>{assert.equal(validateMovement({affected:1,from:'2026-11-09',to:'2026-11-09'},'x').valid,false);assert.equal(validateMovement({affected:1,from:'2026-11-09',to:'2026-11-16'},'').valid,false);assert.equal(validateMovement({affected:1,from:'2026-11-09',to:'2026-11-16'},'ajuste').valid,true)})
