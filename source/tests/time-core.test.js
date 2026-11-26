import test from 'node:test'
import assert from 'node:assert/strict'
import {deliveryInPeriod,durationLabel,isArtificialSheetDate,operationTimeline} from '../frontend/js/time-core.js'

test('NS 2948 combina data real com horários base 1899 sem alterar valores',()=>{const row={data_hora:'2026-11-10T17:53:30+00:00',hora_inicial:'1899-12-30T17:59:28+00:00',hora_final:'1899-12-30T19:59:28+00:00'},result=operationTimeline(row);assert.equal(result.initial.label,'10/11/2026 17:59');assert.equal(result.final.label,'10/11/2026 19:59');assert.equal(durationLabel(result.duration),'2h 00min');assert.equal(isArtificialSheetDate(row.hora_inicial),true)})
test('NS 3037 preserva os horários armazenados',()=>{const result=operationTimeline({data_hora:'2026-10-22T14:10:14+00:00',hora_inicial:'1899-12-30T11:41:28+00:00',hora_final:'1899-12-30T14:16:28+00:00'});assert.equal(result.initial.label,'22/10/2026 11:41');assert.equal(result.final.label,'22/10/2026 14:16');assert.equal(durationLabel(result.duration),'2h 35min')})
test('sem data confiável mostra somente horários e atravessa meia-noite',()=>{const result=operationTimeline({hora_inicial:'1899-12-30T23:30:00Z',hora_final:'1899-12-30T01:15:00Z'});assert.equal(result.initial.label,'23:30');assert.equal(result.final.label,'01:15');assert.equal(result.crossedMidnight,true);assert.equal(durationLabel(result.duration),'1h 45min')})
test('registro inválido não inventa data',()=>{const result=operationTimeline({data_hora:'inválido',hora_inicial:'inválido'});assert.equal(result.valid,false);assert.equal(result.initial,null)})
test('filtro de entrega é inclusivo e aceita somente um limite',()=>{const card={data_entrega:'2026-11-30'};assert.equal(deliveryInPeriod(card,'2026-11-01','2026-11-30'),true);assert.equal(deliveryInPeriod(card,'2026-12-01',''),false);assert.equal(deliveryInPeriod(card,'','2026-11-30'),true);assert.equal(deliveryInPeriod({},'2026-11-01','2026-11-30'),false)})

