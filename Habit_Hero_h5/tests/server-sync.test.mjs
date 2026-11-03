import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createApp} from '../../server/src/index.mjs';
import {SyncStore} from '../../server/src/store.mjs';
import {createWebServer} from '../server/server-sync.mjs';
import {SyncClient,parseImport} from '../services/syncClient.ts';
import {hashBase64} from '../services/hash.js';

export class MemoryStorage {
  values=new Map();get length(){return this.values.size;}key(i){return [...this.values.keys()][i]??null;}
  getItem(k){return this.values.get(k)??null;}setItem(k,v){this.values.set(k,String(v));}removeItem(k){this.values.delete(k);}
}
async function listen(server){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${server.address().port}`;}
async function fixture(){
  const app=createApp({store:new SyncStore(':memory:',{registration:'open'})}),origin=await listen(app.server),web=createWebServer({upstream:origin}),base=await listen(web);
  const make=(options={})=>new SyncClient({storage:new MemoryStorage(),credentials:new MemoryStorage(),base,...options});
  const a=make();await a.login('parent-web','test-password-web',true);await a.createFamily('测试家庭');await a.createChild('小英雄');
  const b=make();await b.login('parent-web','test-password-web');await b.selectFamily(a.session.familyId);
  return {app,web,base,make,a,b,async close(){await Promise.all([new Promise(r=>web.close(r)),new Promise(r=>app.server.close(r))]);app.store.close();}};
}
const clone=x=>structuredClone(x);
const tx=(amount,type='earn',description='测试奖励')=>({id:randomUUID(),type,amount,description,date:new Date().toISOString()});
const addTx=(view,row)=>({...clone(view),transactions:[row,...view.transactions]});

test('H5 uses same-origin API, preserves mobile-only fields, and only changes selected child',async()=>{
 const f=await fixture();try{
  const child=f.a.session.childId;
  await f.a.commit([{action:'create',record:{kind:'literacyProgresses',id:'word',childId:child,fields:{word:'云',correctCount:3}}},f.a.patch(f.a.record('profiles',child),{pokemonFeatureEnabled:true,literacyFeatureEnabled:true})]);
  await f.a.createChild('另一个孩子');await f.a.saveView(f.a.view(),addTx(f.a.view(),tx(22)));f.a.selectChild(child);
  const before=f.a.view(),next=clone(before);next.childName='改名';next.habits.push({id:'habit',name:'阅读',points:10,emoji:'📚'});await f.a.saveView(before,next);
  await f.b.refresh();assert.equal(f.b.view().childName,'改名');assert.equal(f.b.record('profiles',child).fields.pokemonFeatureEnabled,true);assert.equal(f.b.record('literacyProgresses','word').fields.correctCount,3);
  const other=f.b.children().find(r=>r.id!==child);assert.equal(other.fields.totalPoints,22);
  assert.equal(f.b.view().totalPoints,0);assert.equal(f.b.view().habits[0].name,'阅读');
 }finally{await f.close();}
});

test('approval deletes pending task and creates ledger in one transaction; concurrent approval awards once',async()=>{
 const f=await fixture();try{
  const pending={id:'task',habitId:'habit',habitName:'阅读',points:15,emoji:'📖',timestamp:new Date().toISOString()};
  await f.a.saveView(f.a.view(),{...f.a.view(),pendingTasks:[pending]});await f.b.refresh();
  const approve=c=>c.saveView(c.view(),{...addTx(c.view(),tx(15,'earn','阅读')),pendingTasks:[]});
  const results=await Promise.allSettled([approve(f.a),approve(f.b)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  await f.a.refresh();assert.equal(f.a.view().pendingTasks.length,0);assert.equal(f.a.view().transactions.length,1);assert.equal(f.a.view().totalPoints,15);
 }finally{await f.close();}
});

test('lost response survives reload; receipt recovery never replays spending or changes confirmed balance optimistically',async()=>{
 const f=await fixture();try{
  await f.a.saveView(f.a.view(),addTx(f.a.view(),tx(100)));
  let dropped=false;const nativeFetch=fetch;
  f.a.fetcher=async(url,options)=>{const result=await nativeFetch(url,options);if(String(url).endsWith('/operations')&&!dropped){dropped=true;throw Error('response lost');}return result;};
  await assert.rejects(f.a.saveView(f.a.view(),addTx(f.a.view(),tx(30,'spend'))));
  assert.equal(f.a.pending().length,1);assert.equal(f.a.view().totalPoints,100);
  const restored=f.make({storage:f.a.storage,credentials:f.a.credentials});await restored.resume();await restored.reconcile();
  assert.equal(restored.pending().length,0);assert.equal(restored.view().totalPoints,70);assert.equal(restored.view().transactions.length,2);
 }finally{await f.close();}
});

test('two clients cannot overspend; known rejection does not strand an unconfirmed command',async()=>{
 const f=await fixture();try{
  await f.a.saveView(f.a.view(),addTx(f.a.view(),tx(50)));await f.b.refresh();
  const results=await Promise.allSettled([f.a.saveView(f.a.view(),addTx(f.a.view(),tx(40,'spend'))),f.b.saveView(f.b.view(),addTx(f.b.view(),tx(40,'spend')))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);await f.a.refresh();assert.equal(f.a.view().totalPoints,10);assert.equal(f.a.pending().length+f.b.pending().length,0);
 }finally{await f.close();}
});

test('same field conflicts do not overwrite another client; unrelated mobile fields remain unchanged',async()=>{
 const f=await fixture();try{
  const stale=f.b.view();await f.a.saveView(f.a.view(),{...f.a.view(),childName:'甲'});
  await assert.rejects(f.b.saveView(stale,{...stale,childName:'乙'}),e=>e.code==='CONFLICT');assert.equal(f.b.view().childName,'甲');
  assert.ok([...f.b.storage.values.keys()].some(k=>k.startsWith('hh-web-rejected:')));
 }finally{await f.close();}
});

test('attachments round-trip and full export retains non-H5 data and omits credentials and PIN',async()=>{
 const f=await fixture();try{
  const png='data:image/png;base64,iVBORw0KGgo=';await f.a.saveView(f.a.view(),{...f.a.view(),avatar:png,parentPin:'1234',rewards:[{id:'reward',name:'贴纸',cost:5,emoji:'⭐',image:png}]});
  await f.b.refresh();assert.equal(f.b.view().avatar,png);assert.equal(f.b.view().rewards[0].image,png);assert.equal(f.b.view().parentPin,'0000');
  await f.a.commit([{action:'create',record:{kind:'runtime',id:'progress',childId:f.a.session.childId,fields:{activeRun:{step:2}}}}]);
  const exported=await f.a.exportFamily();assert.ok(exported.records.some(r=>r.kind==='runtime'));assert.equal(Object.keys(exported.assets).length,1);
  assert.equal(JSON.stringify(exported).includes(f.a.session.token),false);assert.equal(JSON.stringify(exported).includes('parentPin'),false);
  assert.equal(hashBase64('YWJj'),createHash('sha256').update('abc').digest('hex'));
 }finally{await f.close();}
});

test('legacy import requires explicit mapping, previews balance, and repeated commit does not duplicate history',async()=>{
 const f=await fixture();try{
  const input={childName:'旧孩子',totalPoints:100,parentPin:'9999',habits:[],rewards:[],transactions:[{id:'old-income',type:'earn',amount:20,description:'',date:'2026-02-01T00:00:00Z'}]};
  const draft=parseImport(JSON.stringify(input));draft.mappings['legacy-child']='new';const preview=await f.a.previewImport(draft);
  assert.equal(f.a.children().length,1);assert.equal(preview.balances[0].final,100);
  await f.a.commitImport(preview);await f.a.commitImport(preview);assert.equal(f.a.children().length,2);
  f.a.selectChild(preview.mappings['legacy-child']);assert.equal(f.a.view().totalPoints,100);assert.equal(f.a.view().transactions.length,2);assert.equal(f.a.view().parentPin,'0000');
  assert.equal(parseImport(JSON.stringify(input)).sourceId,draft.sourceId);
  assert.notEqual(parseImport(JSON.stringify({...input,transactions:[]})).sourceId,draft.sourceId,'same name is not a shared source identity');
 }finally{await f.close();}
});

test('new account cannot see another family; pending commands block switching; restored server blocks replay',async()=>{
 const f=await fixture();try{
  const stranger=f.make();await stranger.login('other-parent','other-test-password',true);
  await assert.rejects(stranger.request(`/sync/snapshot?familyId=${f.a.session.familyId}`),e=>e.code==='FORBIDDEN');
  f.a.fetcher=async()=>{throw Error('offline');};await assert.rejects(f.a.saveView(f.a.view(),addTx(f.a.view(),tx(10))));
  await assert.rejects(f.a.selectFamily(f.a.session.familyId),e=>e.code==='PENDING');await assert.rejects(f.a.logout(),e=>e.code==='PENDING');
  f.a.fetcher=fetch;f.app.store.run("UPDATE meta SET value=? WHERE key='datasetEpoch'",randomUUID());
  await assert.rejects(f.a.reconcile(),e=>e.code==='SERVER_CHANGED');assert.equal(f.a.pending().length,1);
  assert.equal(f.app.store.records(f.a.session.familyId).filter(r=>r.kind==='transactions').length,0);
 }finally{await f.close();}
});

test('gateway serves built UI, forwards authentication, refuses legacy API and private files',async()=>{
 const f=await fixture();try{
  assert.match(await(await fetch(f.base+'/parent')).text(),/习惯小英雄/);
  assert.equal((await fetch(f.base+'/api/data')).status,410);
  assert.equal((await fetch(f.base+'/server/habit_hero.db')).status,404);
  assert.equal((await fetch(f.base+'/.env')).status,404);
  assert.equal((await fetch(f.base+'/api/v1/session')).status,401);
  assert.equal((await fetch(f.base+'/healthz')).status,200);
 }finally{await f.close();}
});

test('invalid amounts and PIN are rejected before any family mutation',async()=>{
 const f=await fixture();try{
  const before=f.app.store.snapshot(f.a.session.userId,f.a.session.familyId).cursor;
  await assert.rejects(f.a.saveView(f.a.view(),{...f.a.view(),habits:[{id:'fraction',name:'错误积分',points:1.5,emoji:'!'}]}),/整数/);
  await assert.rejects(f.a.saveView(f.a.view(),{...f.a.view(),childName:'不应更新',parentPin:'bad'}),/4 位/);
  assert.equal(f.app.store.snapshot(f.a.session.userId,f.a.session.familyId).cursor,before);assert.equal(f.a.pending().length,0);
 }finally{await f.close();}
});

test('persistent credentials migrate the existing tab session, survive a new client and clear on logout',async()=>{
 const f=await fixture();try{
  const persistent=new MemoryStorage(),legacy=new MemoryStorage(),key='habit-hero-web-session-v1';legacy.setItem(key,f.a.credentials.getItem(key));
  const restored=f.make({storage:persistent,credentials:undefined,legacyCredentials:legacy});
  assert.equal(restored.session.token,f.a.session.token);assert.equal(legacy.getItem(key),null);assert.ok(persistent.getItem(key));await restored.resume();
  const reopened=f.make({storage:persistent,credentials:undefined,legacyCredentials:new MemoryStorage()});await reopened.resume();assert.equal(reopened.view().childName,'小英雄');
  await reopened.logout();assert.equal(persistent.getItem(key),null);assert.equal(reopened.session,null);assert.equal(f.make({storage:persistent,credentials:undefined}).session,null);
  await assert.rejects(f.a.resume(),e=>e.code==='UNAUTHORIZED');
 }finally{await f.close();}
});

test('family opens before delayed images; media loads concurrently, deduplicates and publishes progressively',async()=>{
 const f=await fixture();let release;try{
  const images=await Promise.all(['iVBORw0KGgo=','iVBORw0KGgph','iVBORw0KGgpi'].map(base64=>f.a.uploadImage('data:image/png;base64,'+base64)));
  const child=f.a.session.childId;await f.a.commit([f.a.patch(f.a.record('profiles',child),{avatarData:images[0]}),...images.map((imageData,i)=>({action:'create',record:{kind:'rewards',id:'media-'+i,childId:child,fields:{name:'图片奖励'+i,cost:1,emoji:'⭐',imageData}}}))]);
  const gate=new Promise(r=>release=r),requests=[],nativeFetch=fetch;let changed=0,finish;const loaded=new Promise(r=>finish=r);
  const fast=f.make({credentials:f.a.credentials,backgroundImages:true,fetcher:async(url,options)=>{if(String(url).includes('/assets/')){requests.push(String(url));await gate;}return nativeFetch(url,options);}});
  fast.onImagesChanged=()=>{changed++;if(changed===3)finish();};
  await fast.selectFamily(f.a.session.familyId);assert.equal(fast.view().childName,'小英雄');assert.equal(fast.stale,false);assert.equal(fast.view().avatar,undefined);assert.equal(requests.length,3,'independent images start concurrently; shared avatar/reward ref requested once');
  await fast.refresh();assert.equal(requests.length,3,'in-flight downloads are reused');
  release();await loaded;assert.equal(fast.view().avatar,'data:image/png;base64,iVBORw0KGgo=');assert.equal(fast.assets.size,3);
 }finally{release?.();await f.close();}
});

class MemoryFamilyCache {
 families=new Map();images=new Map();
 async read(scope){return structuredClone(this.families.get(scope));}
 async write(scope,value){this.families.set(scope,structuredClone(value));}
 async image(scope,ref){return this.images.get(scope+ref);}
 async saveImage(scope,ref,value){this.images.set(scope+ref,value);}
}
test('durable family cache restores records and pictures offline; refresh pulls changes and falls back only for expired cursors',async()=>{
 const f=await fixture();try{
  const cache=new MemoryFamilyCache(),calls=[],nativeFetch=fetch;
  const first=f.make({credentials:f.a.credentials,cache});await first.resume();
  await first.saveView(first.view(),{...first.view(),avatar:'data:image/png;base64,iVBORw0KGgo='});await first.flushCache();
  const restored=f.make({credentials:first.credentials,cache,fetcher:async(url,options)=>{calls.push(String(url));return nativeFetch(url,options);}});
  assert.equal(await restored.restoreCachedFamily(),true);assert.equal(restored.view().childName,'小英雄');assert.equal(restored.view().avatar,first.view().avatar);assert.equal(restored.stale,true);assert.equal(calls.length,0);
  await assert.rejects(restored.saveView(restored.view(),{...restored.view(),childName:'离线不应写入'}),/缓存/);
  await f.a.refresh();await f.a.saveView(f.a.view(),{...f.a.view(),childName:'手机修改'});
  await restored.refresh();assert.equal(restored.view().childName,'手机修改');assert.equal(restored.stale,false);assert.equal(calls.filter(c=>c.includes('/snapshot')).length,0);assert.equal(calls.filter(c=>c.includes('/assets/')).length,0);assert.ok(calls.some(c=>c.includes('/changes')));await restored.flushCache();
  const offline=f.make({credentials:first.credentials,cache,fetcher:async()=>{throw Error('offline');}});assert.equal(await offline.restoreCachedFamily(),true);await assert.rejects(offline.resume());assert.equal(offline.view().childName,'手机修改');assert.equal(offline.stale,true);
  await f.a.saveView(f.a.view(),{...f.a.view(),childName:'游标失效后'});f.app.store.run('UPDATE families SET min_seq=seq WHERE id=?',f.a.session.familyId);
  await restored.refresh();assert.equal(restored.view().childName,'游标失效后');assert.equal(calls.filter(c=>c.includes('/snapshot')).length,1);
  const other=f.make({cache});await other.login('cache-other-parent','test-password-web',true);await other.createFamily('其他账户');assert.equal(await other.restoreCachedFamily(),true);assert.equal(other.children().length,0);
 }finally{await f.close();}
});
