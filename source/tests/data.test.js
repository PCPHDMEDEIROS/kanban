import test from 'node:test'
import assert from 'node:assert/strict'
import {fetchAllCards} from '../frontend/js/data.js'

test('carrega todas as páginas e valida a contagem total',async()=>{
  const source=Array.from({length:1201},(_,i)=>({n_serie:String(i+1)}))
  const supabase={schema:()=>({from:()=>({select:()=>({order:()=>({range:async(from,to)=>({data:source.slice(from,to+1),error:null,count:from===0?source.length:null})})})})})}
  const result=await fetchAllCards(supabase,{pageSize:500})
  assert.equal(result.rows.length,1201);assert.equal(result.total,1201);assert.equal(result.complete,true)
})

