import test from 'node:test'
import assert from 'node:assert/strict'
import {abcByModel,filterPortfolio,portfolioSummary,productiveDays,suggestSchedule,validatePeriod,weeklyTargets} from '../frontend/js/planning-core.js'

const cards=[
 {n_serie:'1',modelo:'A',tensao:'220',controlador:'X',data_entrega:'2026-11-10',status_forno:'FABRICAÇÃO',tem_apontamento_produtivo:false,atrasado:true,prioridade:3},
 {n_serie:'2',modelo:'A',tensao:'220',controlador:'X',data_entrega:'2026-11-12',status_forno:'FABRICAÇÃO',tem_apontamento_produtivo:true,planejado_para:'2026-11-09'},
 {n_serie:'3',modelo:'B',data_entrega:'2026-12-01',status_forno:'FINALIZADO'}
]
test('valida período e inclui limites',()=>{assert.equal(validatePeriod('2026-11-12','2026-11-10').valid,false);assert.deepEqual(filterPortfolio(cards,{from:'2026-11-10',to:'2026-11-12'}).cards.map(x=>x.n_serie),['1','2'])})
test('analisa carteira por configuração sem finalizados',()=>{const s=portfolioSummary(cards.slice(0,2));assert.equal(s.total,2);assert.equal(s.groups[0].quantidade,2);assert.equal(s.naoIniciados,1)})
test('calcula dias produtivos e meta proporcional',()=>{assert.equal(productiveDays(new Date('2026-11-02T12:00:00'),new Date('2026-11-08T12:00:00')),5);assert.equal(weeklyTargets('2026-11',100).reduce((n,x)=>n+x.target,0),100)})
test('sugestão é determinística, compatível e não afirma capacidade',()=>{const r=suggestSchedule(cards.slice(0,2));assert.equal(r.lots.length,1);assert.deepEqual(r.lots[0].cards.map(x=>x.n_serie),['1','2']);assert.equal(r.lots[0].capacityValidated,false);assert.match(r.notice,/não validada/)})
test('curva ABC classifica pelo acumulado anterior ao item limítrofe',()=>{const r=abcByModel([{modelo:'A'},{modelo:'A'},{modelo:'A'},{modelo:'A'},{modelo:'B'}]);assert.equal(r[0].class,'A');assert.equal(r[1].class,'B')})

