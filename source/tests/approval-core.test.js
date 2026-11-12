import test from 'node:test';import assert from 'node:assert/strict';import {approvalItems,sourceFingerprint,validateApproval} from '../frontend/js/approval-core.js'
test('aprovação usa forno_id e versão esperada',()=>{const items=approvalItems([{week:'2026-11-09',code:'2026-S46-L001',cards:[{forno_id:'a',n_serie:'1',modelo:'A'}]}],new Map([['a',2]]));assert.equal(items[0].forno_id,'a');assert.equal(items[0].versao_esperada,2);assert.equal(validateApproval(items).valid,true)})
test('aprovação rejeita duplicidade e falta de identidade',()=>{assert.equal(validateApproval([{n_serie:'1'}]).valid,false);const x={forno_id:'a',n_serie:'1',semana_planejada:'2026-11-09',lote_codigo:'L1',modelo:'A'};assert.equal(validateApproval([x,x]).valid,false)})
test('fingerprint muda quando a fonte muda',()=>{assert.notEqual(sourceFingerprint([{forno_id:'a',updated_at:'1'}]),sourceFingerprint([{forno_id:'a',updated_at:'2'}]))})

