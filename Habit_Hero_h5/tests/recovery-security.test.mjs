import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../../server/src/index.mjs';
import {SyncStore} from '../../server/src/store.mjs';
import {backupDatabase,restoreDatabase,accountCommand} from '../../server/src/admin.mjs';
import {SyncClient} from '../services/syncClient.ts';
class Memory{values=new Map();get length(){return this.values.size;}key(i){return [...this.values.keys()][i]??null;}getItem(k){return this.values.get(k)??null;}setItem(k,v){this.values.set(k,String(v));}removeItem(k){this.values.delete(k);}}
const listen=async(server,port=0)=>{await new Promise(r=>server.listen(port,'127.0.0.1',r));return `http://127.0.0.1:${server.address().port}`;};
const close=async app=>{await new Promise(r=>app.server.close(r));app.store.close();};

test('actual backup/restore: export and archive pending spending, reconnect, never replay into restored epoch',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hh-restore-review-')),source=join(dir,'source.sqlite'),backup=join(dir,'backup.sqlite'),target=join(dir,'restored.sqlite');
 accountCommand(source,'create-user','parent','synthetic-password-123');
 let app=createApp({dbPath:source});const base=await listen(app.server),port=app.server.address().port,storage=new Memory();
 const freshFetch=(url,options)=>fetch(url,{...options,headers:{...options.headers,Connection:'close'}});
 const c=new SyncClient({storage,base,fetcher:freshFetch});
 try{
  await c.login('parent','synthetic-password-123');await c.createFamily('Review family');await c.createChild('Child');
  await c.commit([{action:'create',record:{kind:'transactions',id:'earn',childId:c.session.childId,fields:{type:'earn',amount:40,title:'Initial',date:new Date().toISOString()}}}]);
  backupDatabase(source,backup);
  const native=c.fetcher;c.fetcher=async(url,opts)=>{if(String(url).endsWith('/operations'))throw Error('offline');return native(url,opts);};
  await assert.rejects(c.commit([{action:'create',record:{kind:'transactions',id:'spend',childId:c.session.childId,fields:{type:'spend',amount:20,title:'Unconfirmed',date:new Date().toISOString()}}}]));c.fetcher=native;
  restoreDatabase(backup,target);await close(app);app=createApp({dbPath:target});await listen(app.server,port);
  const resumed=new SyncClient({storage,base,fetcher:freshFetch});await assert.rejects(resumed.reconcile(),e=>e.code==='SERVER_CHANGED');assert.equal(resumed.recoveryRequired,true);
  await assert.rejects(resumed.login('parent','synthetic-password-123'),e=>e.code==='SERVER_CHANGED');
  const bundle=await resumed.recoveryBundle();assert.equal(bundle.entries.length,1);assert.equal(bundle.receipts[0].status,'not-in-restored-database');assert.equal('token' in bundle.identity,false);
  const set=storage.setItem.bind(storage);storage.setItem=(k,v)=>{if(k.startsWith('hh-web-archive:'))throw Error('QuotaExceeded');set(k,v);};
  await assert.rejects(resumed.archiveAndDisconnect(bundle));assert.equal(resumed.pending().length,1);assert.ok(resumed.session);
  storage.setItem=set;await resumed.archiveAndDisconnect(bundle);assert.equal(resumed.session,null);assert.ok([...storage.values.keys()].some(k=>k.startsWith('hh-web-archive:')));
  await resumed.login('parent','synthetic-password-123');await resumed.selectFamily(resumed.session.families[0].id);assert.equal(resumed.view().totalPoints,40);assert.equal(resumed.pending().length,0);assert.equal(resumed.view().transactions.length,1);
 }finally{await close(app);rmSync(dir,{recursive:true,force:true});}
});

test('child switch removes parent credentials; lost response is recovered once; expired new redemption is rejected',async()=>{
 const store=new SyncStore(':memory:'),app=createApp({store});store.register({username:'parent',password:'synthetic-password-123'},{operator:true});const base=await listen(app.server),c=new SyncClient({storage:new Memory(),base});
 try{
  await c.login('parent','synthetic-password-123');await c.createFamily('Review family');await c.createChild('Child');await c.installStarter();await c.installStarter();assert.equal(c.view().habits.length,2);
  const parentToken=c.session.token,childId=c.session.childId,familyId=c.session.familyId;
  await c.commit([{action:'create',record:{kind:'transactions',id:'earn',childId,fields:{type:'earn',amount:80,title:'Initial',date:new Date().toISOString()}}}]);
  const code=(await c.request('/child-devices',{familyId,childId})).code;await c.loginChild(code);assert.equal(c.session.role,'child');assert.throws(()=>store.authenticate(parentToken),e=>e.code==='UNAUTHORIZED');assert.equal(JSON.stringify([...c.credentials.values.values()]).includes(parentToken),false);
  const id=c.view().rewards.find(r=>r.cost===20).id,native=c.fetcher;let dropped=false;c.fetcher=async(url,options)=>{const r=await native(url,options);if(String(url).endsWith('/child/actions')&&!dropped){dropped=true;throw Error('lost response');}return r;};
  await assert.rejects(c.childAction('redeem',id));assert.equal(c.pending().length,1);const next=new SyncClient({storage:c.storage,base});await next.resume();await next.reconcile();assert.equal(next.pending().length,0);assert.equal(next.view().totalPoints,60);
  await assert.rejects(next.request('/child/actions',{...store.info(),action:'redeem',id,expectedCost:20,requestId:'expired-new',validUntil:'2000-01-01'}),e=>e.code==='EXPIRED');assert.equal(next.view().totalPoints,60);
 }finally{await close(app);}
});

test('a definitively rejected child redemption is archived, clears the pending queue, and preserves balance',async()=>{
 const store=new SyncStore(':memory:'),app=createApp({store});store.register({username:'parent',password:'synthetic-password-123'},{operator:true});const base=await listen(app.server),c=new SyncClient({storage:new Memory(),base});
 try{
  await c.login('parent','synthetic-password-123');await c.createFamily('Family');await c.createChild('Child');await c.installStarter();
  const f=c.session.familyId,child=c.session.childId;const code=(await c.request('/child-devices',{familyId:f,childId:child})).code;await c.loginChild(code);
  const command={transport:'child',action:'redeem',id:c.view().rewards.find(r=>r.cost===20).id,expectedCost:20,requestId:'expired',operationId:'expired',serverId:c.session.serverId,datasetEpoch:c.session.datasetEpoch,validUntil:'2000-01-01'};
  c.storage.setItem(`hh-web-pending:${c.scope()}:expired`,JSON.stringify(command));
  await assert.rejects(c.reconcile(),e=>e.code==='EXPIRED');assert.equal(c.pending().length,0);assert.equal(c.view().totalPoints,0);assert.ok([...c.storage.values.keys()].some(k=>k.startsWith('hh-web-rejected:')));
  const stale={...command,requestId:'stale-price',expectedCost:1,validUntil:new Date(Date.now()+120000).toISOString()};await assert.rejects(c.request('/child/actions',stale),e=>e.code==='PRICE_CHANGED');
 }finally{await close(app);}
});

test('removed family membership with a pending command keeps recovery visible and preserves the old scope',async()=>{
 const store=new SyncStore(':memory:',{registration:'open'}),app=createApp({store}),base=await listen(app.server),a=new SyncClient({storage:new Memory(),base}),b=new SyncClient({storage:new Memory(),base});
 try{
  await a.login('parent-a','synthetic-password-123',true);await a.createFamily('Family');await a.createChild('Child');await b.login('parent-b','synthetic-password-123',true);await b.joinFamily((await a.request('/invites',{familyId:a.session.familyId})).code);
  const f=b.session.familyId,native=b.fetcher;b.fetcher=async(u,o)=>{if(String(u).endsWith('/operations'))throw Error('offline');return native(u,o);};await assert.rejects(b.createChild('Pending child'));b.fetcher=native;
  await a.request('/members/remove',{familyId:f,userId:b.session.userId});await assert.rejects(b.resume(),e=>e.code==='FAMILY_REMOVED');assert.equal(b.pending().length,1);assert.equal(b.session.familyId,f);assert.equal(b.recoveryRequired,true);
  const bundle=await b.recoveryBundle();await b.archiveAndDisconnect(bundle);assert.equal(b.session,null);
 }finally{await close(app);}
});
