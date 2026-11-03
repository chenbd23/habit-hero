import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SyncStore} from '../src/store.mjs';
test('registration defaults to invitation; operator bootstrap and one-use invitation preserve isolation',()=>{
 const db=new SyncStore(':memory:');try{
  assert.equal(db.info().allowRegistration,false);assert.equal(db.info().needsBootstrap,true);
  assert.throws(()=>db.register({username:'intruder',password:'synthetic-password'}),e=>e.code==='REGISTRATION_CLOSED');
  const a=db.register({username:'parent-one',password:'synthetic-password'},{operator:true});
  const f=db.createFamily(a.userId,{name:'Synthetic',requestId:'family'}),code=db.invite(a.userId,f.id).code;
  const b=db.register({username:'parent-two',password:'synthetic-password',inviteCode:code});
  assert.equal(db.families(b.userId)[0].id,f.id);
  assert.throws(()=>db.register({username:'parent-three',password:'synthetic-password',inviteCode:code}),e=>e.code==='REGISTRATION_CLOSED');
  assert.equal(db.info().needsBootstrap,false);
 }finally{db.close();}
});
