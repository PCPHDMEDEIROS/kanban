import test from 'node:test'
import assert from 'node:assert/strict'
import {demandByModel,deliveryRisk,electricalCandidates,pcpMetrics,simulateWeek,suggestLots,unplanned,weeks,weekFor} from '../frontend/js/pcp-core.js'

const reference=new Date('2026-11-05T12:00:00')
test('gera semana atual e quatro semanas futuras',()=>{const result=weeks(5,reference);assert.equal(result.length,5);assert.equal(result[0].key,'2026-11-02');assert.equal(result[4].key,'2026-11-30')})
test('planejamento semanal não depende da operação real',()=>{const periods=weeks(5,reference);assert.equal(weekFor({planejado_para:'2026-11-10',operacao_atual:'PREP'},periods).index,1)})
test('demanda e não programados excluem finalizados',()=>{const cards=[{n_serie:'1',modelo:'A'},{n_serie:'2',modelo:'A',atrasado:true},{n_serie:'3',modelo:'B',status_forno:'FINALIZADO'}];assert.deepEqual(demandByModel(cards),[{modelo:'A',total:2}]);assert.deepEqual(unplanned(cards).map(x=>x.n_serie),['2','1']);assert.equal(pcpMetrics(cards,reference).total,2)})
test('PCP usa a mesma evidência produtiva do Kanban',()=>{const m=pcpMetrics([{n_serie:'1',tem_apontamento_produtivo:false},{n_serie:'2',tem_apontamento_produtivo:true}],reference);assert.equal(m.aProduzir,1);assert.equal(m.fabricacao,1)})
test('lotes sugeridos agrupam somente o mesmo modelo',()=>{const lots=suggestLots([{n_serie:'1',modelo:'A'},{n_serie:'2',modelo:'A'},{n_serie:'3',modelo:'B'}]);assert.equal(lots.length,1);assert.deepEqual(lots[0].series,['1','2']);assert.match(lots[0].justificativa,/não presumida/)})
test('risco é explicável e não declara segurança sem capacidade',()=>{assert.equal(deliveryRisk({atrasado:true}).level,'CRÍTICO');assert.equal(deliveryRisk({data_entrega:'2026-12-01',dias_para_entrega:30}).level,'INDETERMINADO')})
test('elétrica antecipa montagem geral e programação',()=>{const result=electricalCandidates([{n_serie:'1',operacao_atual:'MONT.GERAL'},{n_serie:'2',planejado_para:'2026-11-10'},{n_serie:'3'}]);assert.deepEqual(result.map(x=>x.n_serie),['2','1'])})
test('simulação não modifica coleção oficial',()=>{const original=[{n_serie:'1',planejado_para:null}],result=simulateWeek(original,[{n_serie:'1',planejado_para:'2026-11-10'}]);assert.equal(original[0].planejado_para,null);assert.equal(result[0].simulado,true)})

