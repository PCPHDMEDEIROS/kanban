import test from 'node:test'
import assert from 'node:assert/strict'
import {classifyCard,diagnose,metrics,uniqueCards} from '../frontend/js/kanban-core.js'

const operations=['A_PRODUZIR','PREP','MONT.GERAL','ACAB.','FINALIZADO']

test('cada forno recebe uma única classificação principal',()=>{
  assert.equal(classifyCard({status_forno:'FINALIZADO',operacao_atual:'PREP',apontamento_aberto:true},operations),'FINALIZADO')
  assert.equal(classifyCard({status_forno:'FABRICAÇÃO',operacao_atual:'MONT.GERAL',ultima_movimentacao:'2026-01-01'},operations),'MONTGERAL')
  assert.equal(classifyCard({status_forno:'FABRICAÇÃO'},operations),'A_PRODUZIR')
})

test('duplicatas são diagnosticadas e removidas sem multiplicar indicadores',()=>{
  const cards=[{id:'a',n_serie:'10',atrasado:true},{id:'a',n_serie:'10',atrasado:true},{id:'b',n_serie:'11'}]
  assert.equal(uniqueCards(cards).length,2)
  assert.equal(metrics(uniqueCards(cards)).atrasados,1)
  assert.ok(diagnose([{n_serie:'10'},{n_serie:'10'}],operations).some(x=>x.type.includes('duplicada')))
})

test('registros desconhecidos permanecem visíveis como pendência',()=>{
  assert.equal(classifyCard({operacao_atual:'OPERAÇÃO NOVA',ultima_movimentacao:'2026-01-01'},operations),'PENDENCIA')
})

