import test from 'node:test'
import assert from 'node:assert/strict'
import {abcByModel,existingOccupancy,filterPortfolio,portfolioSummary,productiveDays,shiftProductiveDays,suggestSchedule,validatePeriod,weeklyReference,weeklyTargets} from '../frontend/js/planning-core.js'

const cards=[
 {forno_id:'a',n_serie:'1',modelo:'A',tensao:'220',controlador:'X',data_entrega:'2026-11-20',status_forno:'FABRICAÇÃO',tem_apontamento_produtivo:false,atrasado:true,prioridade:3},
 {forno_id:'b',n_serie:'2',modelo:'A',tensao:'220',controlador:'X',data_entrega:'2026-11-20',status_forno:'FABRICAÇÃO',tem_apontamento_produtivo:true},
 {forno_id:'c',n_serie:'3',modelo:'B',data_entrega:'2026-12-01',status_forno:'FINALIZADO'}
]
test('valida período e inclui limites',()=>{assert.equal(validatePeriod('2026-11-12','2026-11-10').valid,false);assert.deepEqual(filterPortfolio(cards,{from:'2026-11-20',to:'2026-11-20'}).cards.map(x=>x.n_serie),['1','2'])})
test('analisa carteira por configuração sem finalizados',()=>{const summary=portfolioSummary(cards.slice(0,2));assert.equal(summary.total,2);assert.equal(summary.groups[0].quantidade,2);assert.equal(summary.naoIniciados,1)})
test('calcula dias produtivos e meta proporcional',()=>{assert.equal(productiveDays(new Date(2026,10,2,12),new Date(2026,10,8,12)),5);assert.equal(weeklyTargets('2026-11',100).reduce((sum,item)=>sum+item.target,0),100)})
test('semana que atravessa meses soma as referências dos dois meses',()=>{assert.ok(weeklyReference('2026-11-30',100)>0);assert.equal(shiftProductiveDays(new Date(2026,10,9,12),-1).getDay(),5)})
test('ocupação existente exclui somente itens reprogramados',()=>{const result=existingOccupancy([{forno_id:'a',planejado_para:'2026-11-09',status_forno:'FABRICAÇÃO'},{forno_id:'b',planejado_para:'2026-11-09',status_forno:'FABRICAÇÃO'}],new Set(['a']));assert.equal(result.get('2026-11-09'),1)})
test('sugestão procura semanas anteriores e preserva compromissos',()=>{const commitments=Array.from({length:5},(_,i)=>({forno_id:`x${i}`,planejado_para:'2026-11-16',status_forno:'FABRICAÇÃO'}));const result=suggestSchedule(cards.slice(0,2),{monthlyTarget:4,commitments,horizonStart:'2026-11-02',horizonEnd:'2026-11-30',dispatchLeadDays:2,today:new Date(2026,10,10,12)});assert.ok(result.lots.every(lot=>lot.week<'2026-11-16'));assert.match(result.notice,/não validados/)})
test('modo novos preserva programação aprovada',()=>{const selected={...cards[0],planejado_para:'2026-11-09'};const result=suggestSchedule([selected],{commitments:[selected],mode:'NEW',horizonStart:'2026-11-01',horizonEnd:'2026-11-30'});assert.equal(result.lots.length,0);assert.match(result.unscheduled[0].reason,/preservado/)})
test('códigos não colidem com lotes existentes',()=>{const result=suggestSchedule(cards.slice(0,2),{horizonStart:'2026-11-01',horizonEnd:'2026-11-30',existingCodes:['2026-S46-A']});assert.equal(new Set(result.lots.map(x=>x.code)).size,result.lots.length);assert.ok(result.lots.every(x=>x.code))})
test('curva ABC classifica pelo acumulado anterior ao item limítrofe',()=>{const result=abcByModel([{modelo:'A'},{modelo:'A'},{modelo:'A'},{modelo:'A'},{modelo:'B'}]);assert.equal(result[0].class,'A');assert.equal(result[1].class,'B')})

