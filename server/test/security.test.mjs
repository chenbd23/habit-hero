import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {SyncStore} from '../src/store.mjs';
import {createApp} from '../src/index.mjs';
import {createWebServer} from '../../Habit_Hero_h5/server/server-sync.mjs';
const pw='synthetic-password-123';
const account=(s,name='parent')=>s.register({username:name,password:pw},{operator:true});
const setup=(options={})=>{const s=new SyncStore(':memory:',options),a=account(s),f=s.createFamily(a.userId,{name:'Synthetic family',requestId:'one'});const op=changes=>({...s.info(),protocolVersion:1,familyId:f.id,operationId:randomUUID(),clientStreamId:randomUUID(),clientSeq:1,changes});const create=(kind,id,fields,childId='child')=>({action:'create',record:{kind,id,childId,fields}});s.operation(a.userId,op([create('profiles','child',{name:'Child',totalPoints:0})]));return {s,a,f,op,create};};
const listen=async server=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${server.address().port}`;};

test('unknown auth paths do not consume login budget; gateway preserves source and strips spoofed forwarding',async()=>{
 const store=new SyncStore(':memory:'),a=account(store),key='g'.repeat(64),edge='e'.repeat(64),app=createApp({store,gatewayKey:key});const upstream=await listen(app.server),web=createWebServer({upstream,gatewayKey:key,edgeKey:edge}),base=await listen(web);
 const post=(path,body,headers={})=>fetch(base+'/api/v1'+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 try{
  for(let i=0;i<35;i++){const r=await post('/auth/nonexistent',{});assert.equal(r.status,404);await r.text();}
  assert.equal((await post('/auth/login',{username:'parent',password:pw})).status,200);
  const sourceA={'X-HH-Edge-Key':edge,'X-HH-Edge-IP':'198.51.100.1'};
  for(let i=0;i<10;i++){const r=await post('/auth/login',{username:'parent',password:'wrong'},sourceA);assert.equal(r.status,401);await r.text();}
  assert.equal((await post('/auth/login',{username:'parent',password:pw},sourceA)).status,429);
  assert.equal((await post('/auth/login',{username:'parent',password:pw},{'X-HH-Edge-Key':edge,'X-HH-Edge-IP':'198.51.100.2'})).status,200);
  // Untrusted headers cannot impersonate a trusted source or reset a local source bucket.
  for(let i=0;i<9;i++)await post('/auth/login',{username:'parent',password:'wrong'},{'X-Forwarded-For':`203.0.113.${i+1}`,'X-HH-Client-IP':`203.0.113.${i+1}`,'X-HH-Gateway-Key':key});
  assert.equal((await post('/auth/login',{username:'parent',password:pw},{'X-HH-Edge-IP':'192.0.2.4'})).status,429);
  assert.equal((await post('/auth/logout',{}, {Authorization:`Bearer ${a.token}`})).status,200);
 }finally{await new Promise(r=>web.close(r));await new Promise(r=>app.server.close(r));store.close();}
});

test('cumulative asset quota rejects new content but permits idempotent uploads; family quota rolls back operations',()=>{
 const {s,a,f,op,create}=setup({assetBytes:10});try{
  const upload=text=>{const b=Buffer.from(text);return s.uploadAsset(a.userId,f.id,{mime:'image/png',base64:b.toString('base64'),hash:createHash('sha256').update(b).digest('hex')});};
  upload('123456');upload('123456');assert.throws(()=>upload('abcdef'),e=>e.code==='ASSET_QUOTA');assert.equal(s.familyUsage(f.id).assetBytes,6);
  const seq=s.snapshot(a.userId,f.id).cursor;s.limits.familyBytes=s.familyUsage(f.id).bytes+1;
  assert.throws(()=>s.operation(a.userId,op([create('habits','new',{name:'Never committed',points:1})])),e=>e.code==='FAMILY_QUOTA');assert.equal(s.snapshot(a.userId,f.id).cursor,seq);assert.equal(s.record(f.id,'child/habits/new'),null);
  assert.equal(s.unreferencedAssets(f.id).length,1);
 }finally{s.close();}
});

test('password reset, revocation, membership removal and last-admin guard',()=>{
 const {s,a,f}=setup();try{
  const b=account(s,'second-parent');s.join(b.userId,s.invite(a.userId,f.id).code);
  const device=s.issueChild(b.userId,{familyId:f.id,childId:'child'}),child=s.childLogin(device.code);
  s.removeMember(a.userId,f.id,b.userId);assert.throws(()=>s.snapshot(b.userId,f.id),e=>e.code==='FORBIDDEN');assert.equal(s.childAuthenticate(child.token),undefined);
  assert.throws(()=>s.removeMember(a.userId,f.id,a.userId),e=>e.code==='LAST_ADMIN');
  assert.throws(()=>s.changePassword(a.userId,{currentPassword:'wrong',newPassword:'new-password-123'}),e=>e.code==='INVALID_CREDENTIALS');
  s.changePassword(a.userId,{currentPassword:pw,newPassword:'new-password-123'});assert.throws(()=>s.authenticate(a.token),e=>e.code==='UNAUTHORIZED');assert.throws(()=>s.login({username:'parent',password:pw}),e=>e.code==='INVALID_CREDENTIALS');
  const next=s.login({username:'parent',password:'new-password-123'});s.revokeSessions(next.userId);assert.throws(()=>s.authenticate(next.token),e=>e.code==='UNAUTHORIZED');
 }finally{s.close();}
});

test('child API forbids admin mutations and other-child data; server prices spending and retries exactly once',async()=>{
 const {s,a,f,op,create}=setup();
 s.operation(a.userId,op([create('profiles','other',{name:'Other',totalPoints:0},'other'),create('transactions','earn',{type:'earn',amount:50,title:'Initial',date:new Date().toISOString()}),create('rewards','reward',{name:'Play',cost:20}),create('habits','habit',{name:'Read',points:5})]));
 const code=s.issueChild(a.userId,{familyId:f.id,childId:'child'}).code,login=s.childLogin(code),app=createApp({store:s}),base=await listen(app.server);
 const call=(path,body)=>fetch(base+'/api/v1'+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${login.token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 try{
  assert.throws(()=>s.childLogin(code),e=>e.code==='INVALID_CODE');
  for(const path of ['/operations','/assets','/migrations/preview','/invites','/members/remove','/families','/child-devices'])assert.equal((await call(path,{familyId:f.id})).status,403);
  const snapshot=await (await call('/sync/snapshot?familyId='+f.id)).json();assert.equal(snapshot.records.some(r=>r.childId==='other'),false);
  const body={...s.info(),action:'redeem',requestId:'redeem-once',id:'reward',expectedCost:20,amount:-999,validUntil:new Date(Date.now()+120000).toISOString()};
  assert.equal((await call('/child/actions',body)).status,200);body.validUntil='2000-01-01';assert.equal((await call('/child/actions',body)).status,200);
  assert.equal(s.record(f.id,'child/profiles/child').fields.totalPoints,30);
  assert.equal((await call('/child/actions',{...body,id:'other'})).status,409);
  const task={...s.info(),action:'task',requestId:'task-once',id:'habit',points:100000};await call('/child/actions',task);await call('/child/actions',task);
  assert.equal(s.records(f.id).filter(r=>r.kind==='pendingTasks').length,1);assert.equal(s.records(f.id).find(r=>r.kind==='pendingTasks').fields.points,5);
  assert.equal((await call('/child/actions',{...task,requestId:'duplicate-day'})).status,409);
  s.revokeSessions(a.userId);assert.equal((await call('/session')).status,401);
 }finally{await new Promise(r=>app.server.close(r));s.close();}
});
