import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/index.mjs';
import {SyncStore} from '../src/store.mjs';
import {points} from '../../shared/sync-protocol.js';

function fixture() {
  const store=new SyncStore(':memory:',{registration:'open'});
  const account=store.register({username:'legacy-parent',password:'legacy-test-password'});
  const family=store.createFamily(account.userId,{name:'旧资料导入',requestId:'legacy-family'});
  const profile={kind:'profiles',id:'child',childId:'child',fields:{name:'测试孩子',totalPoints:95}};
  const tx=(id,title,amount,type='earn')=>({kind:'transactions',id,childId:'child',fields:{title,amount,type,date:'2026-02-03T10:20:30.123Z',externalId:null}});
  const records=[profile,tx('blank','',100),tx('spaces',' \n ',20,'spend'),tx('long','旧备注'.repeat(200),15)];
  const request={familyId:family.id,importId:'legacy-import',sourceId:'ios-backup',records,mappings:{child:'new'}};
  return {store,account,family,request};
}

test('HTTP preview and commit preserve legacy blank/long remarks, amounts, dates and balance; retry is idempotent',async()=>{
  const f=fixture(),app=createApp({store:f.store});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const post=async(path,body)=>{const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/v1/${path}`,{method:'POST',headers:{Authorization:`Bearer ${f.account.token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;};
  try{
    // These are valid old app records but fail the new-operation remark rule.
    for(const row of f.request.records.slice(1))assert.throws(()=>f.store.validateRecord(row,f.family.id),e=>e.details.field==='title');
    const before=structuredClone(f.request);
    const preview=await post('migrations/preview',f.request);
    assert.equal(preview.ready,true);assert.equal(preview.balances[0].final,95);
    assert.equal(f.store.records(f.family.id).length,0,'preview must not write household data');
    const commit={familyId:f.family.id,id:preview.id,previewHash:preview.previewHash};
    const result=await post('migrations/commit',commit);
    assert.deepEqual(await post('migrations/commit',commit),result);
    const saved=f.store.records(f.family.id),ledger=saved.filter(r=>r.kind==='transactions');
    assert.equal(ledger.length,3);assert.equal(ledger.reduce((sum,r)=>sum+points(r.fields),0),95);
    for(const row of before.records.slice(1))assert.deepEqual(ledger.find(r=>r.id===row.id).fields,row.fields);
    assert.equal(saved.find(r=>r.kind==='profiles').fields.totalPoints,95);
    assert.deepEqual(f.request,before,'source is not rewritten');
  }finally{await new Promise(resolve=>app.server.close(resolve));f.store.close();}
});

test('invalid legacy ledger fields identify the exact record and do not produce a committable preview',()=>{
  const f=fixture();try{
    for(const [field,value] of [['type','unknown'],['amount',1.5],['amount',1000001],['title',null],['date','not-a-date'],['date',123]]){
      const input=structuredClone(f.request);input.records[1].fields[field]=value;
      assert.throws(()=>f.store.previewImport(f.account.userId,f.family.id,input),e=>e.code==='INVALID_TRANSACTION'&&e.details.field===field&&e.details.recordIndex===2&&e.details.recordId==='blank'&&/第 2 条积分记录/.test(e.message));
      assert.equal(f.store.get('SELECT count(*) AS n FROM migrations').n,0);
      assert.equal(f.store.records(f.family.id).length,0);
    }
  }finally{f.store.close();}
});
