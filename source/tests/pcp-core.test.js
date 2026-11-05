import test from 'node:test'
import assert from 'node:assert/strict'
import {demandByModel,pcpMetrics,unplanned,weeks,weekFor} from '../frontend/js/pcp-core.js'

const reference=new Date('2026-11-05T12:00:00')
test('gera semana atual e quatro semanas futuras',()=>{const result=weeks(5,reference);assert.equal(result.length,5);assert.equal(result[0].key,'2026-11-02');assert.equal(result[4].key,'2026-11-30')})
test('planejamento semanal não depende da operação real',()=>{const periods=weeks(5,reference);assert.equal(weekFor({planejado_para:'2026-11-10',operacao_atual:'PREP'},periods).index,1)})
test('demanda e não programados excluem finalizados',()=>{const cards=[{n_serie:'1',modelo:'A'},{n_serie:'2',modelo:'A',atrasado:true},{n_serie:'3',modelo:'B',status_forno:'FINALIZADO'}];assert.deepEqual(demandByModel(cards),[{modelo:'A',total:2}]);assert.deepEqual(unplanned(cards).map(x=>x.n_serie),['2','1']);assert.equal(pcpMetrics(cards,reference).total,2)})

