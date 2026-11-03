import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {SyncStore} from '../src/store.mjs';
import {installMigrations} from '../src/migrations.mjs';
installMigrations(SyncStore);
function setup(){
  const s=new SyncStore(':memory:',{registration:'open'});
  const a=s.register({username:'parent-a',password:'test-password-a',bootstrapKey:'test-bootstrap-only'});
  const f=s.createFamily(a.userId,{name:'测试家庭',requestId:randomUUID()});
  const child=randomUUID();let clientSeq=0;const stream=randomUUID();
  const op=(changes,extra={})=>({protocolVersion:1,...s.info(),operationId:randomUUID(),clientStreamId:stream,clientSeq:++clientSeq,familyId:f.id,changes,...extra});
  const profile={kind:'profiles',childId:child,id:child,fields:{name:'测试孩子',totalPoints:0}};
  s.operation(a.userId,op([{action:'create',record:profile}]));
  const tx=(amount,type='earn')=>({action:'create',record:{kind:'transactions',id:randomUUID(),childId:child,fields:{title:'测试流水',amount,type,date:new Date().toISOString()}}});
  return {s,a,f,child,op,tx};
}
test('one operation, 100 retries, one ledger effect and durable original receipt',()=>{
  const {s,a,f,child,op,tx}=setup();try{const command=op([tx(100)]),result=s.operation(a.userId,command);for(let i=0;i<100;i++)assert.deepEqual(s.operation(a.userId,command),result);assert.equal(s.record(f.id,`${child}/profiles/${child}`).fields.totalPoints,100);assert.equal(s.records(f.id).filter(r=>r.kind==='transactions').length,1);assert.throws(()=>s.operation(a.userId,{...command,changes:[tx(200)]}),/编号/);}finally{s.close();}
});
test('two clients spending final balance cannot both succeed',()=>{
  const {s,a,f,child,op,tx}=setup();try{s.operation(a.userId,op([tx(50)]));const r1=s.operation(a.userId,op([tx(50,'spend')]));const r2=s.operation(a.userId,op([tx(50,'spend')],{clientStreamId:randomUUID(),clientSeq:1}));assert.equal(r1.status,'applied');assert.equal(r2.code,'INSUFFICIENT_POINTS');assert.equal(s.record(f.id,`${child}/profiles/${child}`).fields.totalPoints,0);assert.equal(s.records(f.id).filter(r=>r.kind==='transactions').length,2);}finally{s.close();}
});
test('field conflicts retain distinct edits and reject same field',()=>{
  const {s,a,f,child,op}=setup();try{const id=randomUUID(),key=`${child}/habits/${id}`;s.operation(a.userId,op([{action:'create',record:{kind:'habits',childId:child,id,fields:{name:'读书',points:5,emoji:'📚'}}}]));const version=s.record(f.id,key).version;s.operation(a.userId,op([{action:'patch',key,baseVersion:version,set:{name:'读绘本'}}]));assert.equal(s.operation(a.userId,op([{action:'patch',key,baseVersion:version,set:{emoji:'📖'}}])).status,'applied');assert.equal(s.operation(a.userId,op([{action:'patch',key,baseVersion:version,set:{name:'读故事'}}])).status,'conflict');assert.deepEqual(s.record(f.id,key).fields,{name:'读绘本',points:5,emoji:'📖'});}finally{s.close();}
});
test('approval is atomic: stale second deletion cannot award twice',()=>{
  const {s,a,f,child,op,tx}=setup();try{const id=randomUUID(),key=`${child}/pendingTasks/${id}`;s.operation(a.userId,op([{action:'create',record:{kind:'pendingTasks',id,childId:child,fields:{habitName:'读书',points:10,timestamp:new Date().toISOString()}}}]));const version=s.record(f.id,key).version;assert.equal(s.operation(a.userId,op([{action:'delete',key,baseVersion:version},tx(10)])).status,'applied');assert.equal(s.operation(a.userId,op([tx(10),{action:'delete',key,baseVersion:version}])).code,'ENTITY_DELETED');assert.equal(s.record(f.id,`${child}/profiles/${child}`).fields.totalPoints,10);}finally{s.close();}
});
test('deleted records cannot be recreated by an old device',()=>{
  const {s,a,f,child,op}=setup();try{const r={kind:'habits',childId:child,id:randomUUID(),fields:{name:'读书',points:10}};s.operation(a.userId,op([{action:'create',record:r}]));const key=`${child}/habits/${r.id}`,version=s.record(f.id,key).version;s.operation(a.userId,op([{action:'delete',key,baseVersion:version}]));assert.equal(s.operation(a.userId,op([{action:'create',record:r}])).status,'conflict');assert.equal(s.operation(a.userId,op([{action:'patch',key,baseVersion:version,set:{name:'新的'}}])).code,'ENTITY_DELETED');}finally{s.close();}
});
test('failure after receipt or publish rolls back business, receipt, cursor and stream',()=>{
  for(const stage of ['afterMutation','afterReceipt','afterPublish']){const {s,a,f,child,op,tx}=setup();try{const command=op([tx(30)]),seq=s.snapshot(a.userId,f.id).cursor;s.testHook=x=>{if(x===stage)throw Error('injected');};assert.throws(()=>s.operation(a.userId,command),/injected/);assert.equal(s.record(f.id,`${child}/profiles/${child}`).fields.totalPoints,0);assert.equal(s.snapshot(a.userId,f.id).cursor,seq);assert.throws(()=>s.receipt(a.userId,f.id,command.operationId));s.testHook=null;assert.equal(s.operation(a.userId,command).status,'applied');}finally{s.close();}}
});
test('pagination pins upper bound and retains immutable historical images',()=>{
  const {s,a,f,child,op}=setup();try{const key=`${child}/profiles/${child}`;s.operation(a.userId,op([{action:'patch',key,baseVersion:1,set:{name:'第一版'}}]));const first=s.changes(a.userId,f.id,0,null,1);s.operation(a.userId,op([{action:'patch',key,baseVersion:2,set:{name:'第二版'}}]));const second=s.changes(a.userId,f.id,first.cursor,first.until,1);assert.equal(second.groups[0].records[0].fields.name,'第一版');assert.equal(second.hasMore,false);assert.equal(s.changes(a.userId,f.id,second.cursor,null,1).groups[0].records[0].fields.name,'第二版');}finally{s.close();}
});
test('family records, assets, receipts and migration previews are tenant isolated',()=>{
  const {s,a,f,op,tx}=setup();try{const b=s.register({username:'parent-b',password:'test-password-b'});const command=op([tx(10)]);s.operation(a.userId,command);for(const action of [()=>s.snapshot(b.userId,f.id),()=>s.changes(b.userId,f.id,0),()=>s.receipt(b.userId,f.id,command.operationId),()=>s.asset(b.userId,f.id,'x'),()=>s.previewImport(b.userId,f.id,{})])assert.throws(action,e=>e.code==='FORBIDDEN');const code=s.invite(a.userId,f.id).code;s.join(b.userId,code);assert.equal(s.snapshot(b.userId,f.id).records.length,2);}finally{s.close();}
});
test('first import preserves balance using auditable opening adjustment, commit is idempotent',()=>{
  const {s,a,f}=setup();try{const id=randomUUID(),request={importId:randomUUID(),sourceId:'legacy-source',mappings:{[id]:'new'},records:[{kind:'profiles',id,childId:id,fields:{name:'旧孩子',totalPoints:100}},{kind:'transactions',id:randomUUID(),childId:id,fields:{type:'earn',amount:80,title:'旧收入',date:'2026-01-01T00:00:00Z'}}]};const p=s.previewImport(a.userId,f.id,request);assert.equal(p.ready,true);const result=s.commitImport(a.userId,f.id,p.id,p.previewHash);assert.deepEqual(s.commitImport(a.userId,f.id,p.id,p.previewHash),result);const target=p.mappings[id];assert.equal(s.record(f.id,`${target}/profiles/${target}`).fields.totalPoints,100);assert.equal(s.records(f.id).filter(r=>r.childId===target&&r.kind==='transactions').reduce((n,r)=>n+(r.fields.type==='earn'?r.fields.amount:r.fields.amount),0),100);}finally{s.close();}
});
test('existing family import requires explicit balance choice and stale preview is refused',()=>{
  const {s,a,f,child,op,tx}=setup();try{s.operation(a.userId,op([tx(100)]));const records=s.records(f.id).map(r=>({...r,fields:{...r.fields}}));records.find(r=>r.kind==='profiles').fields.totalPoints=120;records.push(tx(20).record);const request={importId:randomUUID(),sourceId:'same-origin',records,mappings:{[child]:child}};assert.equal(s.previewImport(a.userId,f.id,request).ready,false);request.balances={[child]:{mode:'projected'}};const p=s.previewImport(a.userId,f.id,request);assert.equal(p.balances[0].proposed,120);s.operation(a.userId,op([tx(5)]));assert.throws(()=>s.commitImport(a.userId,f.id,p.id,p.previewHash),e=>e.code==='IMPORT_STALE');const fresh=s.previewImport(a.userId,f.id,request);s.commitImport(a.userId,f.id,fresh.id,fresh.previewHash);assert.equal(s.record(f.id,`${child}/profiles/${child}`).fields.totalPoints,125);}finally{s.close();}
});
