import test from 'node:test'
import assert from 'node:assert/strict'
import {cumulativeProduction,dateInPeriod,deliveryRadar,demandByModel,executiveIndicators,operationQueues,operationTimes,plannedVsActual,scopeCardsByDate} from '../frontend/js/indicators-core.js'

const cards=[
 {forno_id:'a',modelo:'A',status_forno:'FINALIZADO',data_finalizacao:'2026-11-05T12:00:00Z',planejamento_original_para:'2026-11-02',planejado_para:'2026-11-02'},
 {forno_id:'b',modelo:'A',status_forno:'FABRICAÇÃO',tem_apontamento_produtivo:true,apontamento_aberto:true,operacao_atual:'CORTE',data_entrega:'2026-11-15',dias_para_entrega:5,planejado_para:'2026-11-09'},
 {forno_id:'c',modelo:'B',status_forno:'FABRICAÇÃO',tem_apontamento_produtivo:false,atrasado:true,data_entrega:'2026-11-08',dias_para_entrega:-2}
]
test('executivo não duplica forno e usa data real de conclusão',()=>{const result=executiveIndicators([...cards,cards[0]],{month:'2026-11',today:new Date(2026,10,10,12)});assert.equal(result.finished,1);assert.equal(result.portfolio,2);assert.equal(result.inProduction,1)})
test('demanda separa não iniciados e fabricação por evidência real',()=>{const [a,b]=demandByModel(cards);assert.equal(a.inProduction,1);assert.equal(b.notStarted,1)})
test('filas distinguem execução e espera sem declarar gargalo',()=>{const [queue]=operationQueues(cards,[{codigo:'CORTE',nome:'Corte'}],new Date(2026,10,10,12));assert.equal(queue.running,1);assert.equal(queue.bottleneckProven,false)})
test('tempos ignoram execução incompleta e separam espera',()=>{const result=operationTimes([{n_serie:'1',operacao:'A',hora_inicial:'2026-11-01T10:00:00Z',hora_final:'2026-11-01T12:00:00Z'},{n_serie:'1',operacao:'B',hora_inicial:'2026-11-01T14:00:00Z',hora_final:null}]);assert.equal(result.find(x=>x.operation==='A').executionAverage,2);assert.equal(result.find(x=>x.operation==='B').waitAverage,2);assert.equal(result.find(x=>x.operation==='B').executionAverage,null)})
test('tempos recompõem datas base 1899 usando data real',()=>{const result=operationTimes([{n_serie:'2948',operacao:'MONT.GERAL',data_hora:'2026-11-10T17:53:30Z',hora_inicial:'1899-12-30T17:59:28Z',hora_final:'1899-12-30T19:59:28Z'}]);assert.equal(result[0].executionAverage,2);assert.equal(result[0].processed,1)})
test('planejado versus realizado preserva plano original',()=>{const [row]=plannedVsActual(cards);assert.ok(row.original>=1);assert.ok(row.finished>=1)})
test('radar mantém risco não calculado quando falta entrega',()=>{const radar=deliveryRadar([...cards,{forno_id:'d',status_forno:'FABRICAÇÃO'}]);assert.equal(radar.RISCO_NAO_CALCULADO.length,1);assert.equal(radar.ATRASADOS.length,1)})
test('curva acumulada usa finalizações reais',()=>{const curve=cumulativeProduction(cards,'2026-11',100);assert.equal(curve.at(-1).actual,1);assert.equal(Math.round(curve.at(-1).target),100)})
test('períodos usam a data própria do indicador e limites inclusivos',()=>{assert.equal(dateInPeriod('2026-11-30T18:00:00Z','2026-11-01','2026-11-30'),true);assert.equal(dateInPeriod(null,'2026-11-01','2026-11-30'),false);assert.deepEqual(scopeCardsByDate(cards,'data_entrega','2026-11-15','2026-11-15').map(card=>card.forno_id),['b'])})
