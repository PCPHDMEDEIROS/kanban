import test from 'node:test'
import assert from 'node:assert/strict'
import {COLOR_LEGEND} from '../frontend/js/visual-config.js'

test('legenda cobre todas as sinalizações visuais do Kanban',()=>{
  assert.deepEqual(COLOR_LEGEND.map(section=>section.title),['Situação do forno','Status da caixa'])
  assert.deepEqual(COLOR_LEGEND.flatMap(section=>section.items.map(item=>item.className)),[
    'late','critical','open','neutral','blocked','box-bought','box-buy','box-stock'
  ])
})

