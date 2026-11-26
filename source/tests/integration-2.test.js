import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'

const canonical=value=>JSON.stringify(Object.fromEntries(Object.entries(value).filter(([key])=>!['source_updated_at','synced_at','updated_at','linha_origem'].includes(key)).sort(([a],[b])=>a.localeCompare(b))))
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex')

test('hash de negócio ignora timestamps e linha técnica',()=>{const business={id_origem:'A1',n_serie:'3001',operacao:'ACAB.',hora_final:'2026-11-26T10:00:00.000Z'},a={...business,source_updated_at:'2026-11-26T10:01:00Z',linha_origem:10},b={...business,source_updated_at:'2026-11-26T11:01:00Z',linha_origem:999};assert.equal(hash(a),hash(b));assert.notEqual(hash(a),hash({...b,operacao:'MONT.GERAL'}))})

test('migration usa lote SQL, upsert condicional e preserva histórico',()=>{const sql=readFileSync(new URL('../supabase/migrations/20261126170000_integracao_2_0.sql',import.meta.url),'utf8');assert.match(sql,/sincronizar_integracao_lote/);assert.match(sql,/where hd_kanban\.apontamentos\.row_hash is distinct from excluded\.row_hash/);assert.match(sql,/insert into hd_kanban\.historico_troca_serie/);assert.match(sql,/grant select,insert on hd_kanban\.alertas_pcp to service_role/);assert.doesNotMatch(sql,/truncate/i)})

test('Edge Function faz uma RPC em lote e não usa Promise.all por registro',()=>{const source=readFileSync(new URL('../supabase/functions/sync-hd-medeiros/index.ts',import.meta.url),'utf8');assert.match(source,/rpc\('sincronizar_integracao_lote'/);assert.doesNotMatch(source,/Promise\.all\(.*sync/);assert.match(source,/x-idempotency-key/);assert.match(source,/integracao_pendencias/)})
test('Edge Function mantém compatibilidade segura com o Apps Script anterior',()=>{const source=readFileSync(new URL('../supabase/functions/sync-hd-medeiros/index.ts',import.meta.url),'utf8');assert.match(source,/legacy:\$\{action\}/);assert.match(source,/technicalFields/);assert.match(source,/if\(action==='sync-forno'\)/);assert.match(source,/row_hash:await sha256\(canonical\(item\)\)/);assert.match(source,/const keyed=new Map/)})

test('Apps Script não inclui timestamp técnico no hash e mantém frequência de cinco minutos',()=>{const sync=readFileSync(new URL('../apps-script/supabase-sync.gs',import.meta.url),'utf8'),reconcile=readFileSync(new URL('../apps-script/supabase-reconcile.gs',import.meta.url),'utf8');assert.match(sync,/source_updated_at','synced_at','updated_at','linha_origem/);assert.match(reconcile,/everyMinutes\(5\)/);assert.match(reconcile,/HDK_SCAN_CURSOR/);assert.doesNotMatch(reconcile,/ultima-499/);assert.doesNotMatch(reconcile,/HDK_RETRY_PENDENTE/)})

