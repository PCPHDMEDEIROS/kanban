import test from 'node:test'
import assert from 'node:assert/strict'
import {approvalItems,approvalSummary,friendlyApprovalError,sourceFingerprint,validateApproval} from '../frontend/js/approval-core.js'

const card=(i,overrides={})=>({forno_id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,n_serie:String(3000+i),modelo:'HD80',tensao:'220V',controlador:'A',...overrides})
const lot=(id,count,start=1,overrides={})=>({id,week:'2026-11-30',code:`VISUAL-${id}`,cards:Array.from({length:count},(_,i)=>card(start+i,overrides))})

test('um lote com seis fornos compartilha a mesma identidade lógica',()=>{const items=approvalItems([lot('lote-a',6)],new Map([[card(1).forno_id,2]]));assert.equal(items.length,6);assert.deepEqual(new Set(items.map(x=>x.lote_logico_id)),new Set(['lote-a']));assert.equal(items[0].versao_esperada,2);assert.equal(validateApproval(items).valid,true);assert.deepEqual(approvalSummary(items),{furnaces:6,lots:1})})

test('cenário de 70 lotes e 87 fornos mantém contagens e identidades',()=>{const lots=[];let serial=1;for(let i=0;i<70;i++){const count=i<17?2:1;lots.push(lot(`logical-${i}`,count,serial));serial+=count}const items=approvalItems(lots);assert.equal(items.length,87);assert.equal(validateApproval(items).valid,true);assert.deepEqual(approvalSummary(items),{furnaces:87,lots:70})})

test('aprovação rejeita forno, série e identidade lógica duplicados ou ausentes',()=>{assert.equal(validateApproval([{n_serie:'1'}]).valid,false);const [item]=approvalItems([lot('lote-a',1)]);assert.equal(validateApproval([item,item]).valid,false);assert.equal(validateApproval([item,{...item,forno_id:card(2).forno_id}]).valid,false);assert.equal(validateApproval([{...item,lote_logico_id:''}]).valid,false)})

test('aprovação rejeita incompatibilidade dentro do mesmo lote lógico',()=>{const base=approvalItems([lot('lote-a',2)]);assert.equal(validateApproval([base[0],{...base[1],semana_planejada:'2026-12-07'}]).valid,false);assert.equal(validateApproval([base[0],{...base[1],modelo:'HD100'}]).valid,false);assert.equal(validateApproval([base[0],{...base[1],configuracao:{...base[1].configuracao,tensao:'380V'}}]).valid,false)})

test('mensagens de falha preservam contexto para nova tentativa',()=>{assert.match(friendlyApprovalError({code:'23505'}),/Nada foi gravado/);assert.match(friendlyApprovalError({code:'40001'}),/Recarregue/);assert.match(friendlyApprovalError({message:'Falha específica'}),/Falha específica/)})

test('fingerprint muda quando a fonte muda',()=>{assert.notEqual(sourceFingerprint([{forno_id:'a',updated_at:'1'}]),sourceFingerprint([{forno_id:'a',updated_at:'2'}]))})
