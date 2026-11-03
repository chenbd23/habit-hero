import {randomUUID,createHash} from 'node:crypto';
import {Fault} from './store.mjs';
import {clone,keyOf,equal,stable,points,recordsMap} from '../../shared/sync-protocol.js';
const hash=x=>createHash('sha256').update(x).digest('hex');
const assert=(ok,code,message,status=400)=>{if(!ok)throw new Fault(code,message,status);};
const deterministicID=source=>{const h=hash(source);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
export function installMigrations(Store){
  Store.prototype.previewImport=function(userId,familyId,request){
    this.access(userId,familyId,true);this.checkDisk();
    assert(request&&typeof request.importId==='string'&&request.importId.length<=100&&typeof request.sourceId==='string'&&Array.isArray(request.records)&&request.records.length<=30000,'INVALID_IMPORT','导入数据格式无效');
    this.run('DELETE FROM migrations WHERE result IS NULL AND expires_at<=?',Date.now());
    assert(this.get('SELECT count(*) n FROM migrations WHERE family_id=? AND result IS NULL AND id<>?',familyId,request.importId).n<5,'PREVIEW_QUOTA','待确认导入预览最多 5 份，请等待过期',409);
    const prior=this.get('SELECT * FROM migrations WHERE id=?',request.importId);
    assert(!prior||prior.user_id===userId&&prior.family_id===familyId,'IMPORT_OWNER','导入编号已使用',409);
    if(prior?.result)return {...JSON.parse(prior.result),alreadyCommitted:true};
    const cloud=recordsMap(this.records(familyId)), next=clone(cloud),mappings={},sources=[], conflicts=[],summary={added:0,updated:0,duplicates:0,skipped:0};
    const changes=new Map(),transactionsAdded=new Map(),sourceProfiles=request.records.filter(x=>x.kind==='profiles');
    assert(new Set(request.records.map(keyOf)).size===request.records.length,'DUPLICATE_RECORD','导入中有重复记录标识');
    for(const p of sourceProfiles){
      const mapping=request.mappings?.[p.id];assert(mapping,'CHILD_MAPPING','请选择每个孩子的导入方式');
      if(mapping==='skip')continue;
      const target=mapping==='new'?deterministicID(`${familyId}:${request.sourceId}:${p.id}`):mapping;
      assert(!this.record(familyId,`${target}/profiles/${target}`)?.deleted,'CHILD_DELETED','该孩子已在家庭中删除，不能通过旧档案自动恢复');
      assert(typeof target==='string'&&/^[a-z0-9-]{1,160}$/i.test(target),'CHILD_MAPPING','孩子标识无效');
      assert(!Object.values(mappings).includes(target),'CHILD_MAPPING','请勿把两个本机孩子静默合并成一个孩子');
      assert(mapping==='new'||cloud[`${target}/profiles/${target}`],'CHILD_MAPPING','目标孩子不存在');mappings[p.id]=target;
    }
    const ids=new Map();
    for(const source of request.records){
      if(source.childId!=='global'&&!mappings[source.childId])continue;
      const targetChild=source.childId==='global'?'global':mappings[source.childId];
      let id=source.kind==='profiles'?targetChild:source.id;
      const sourceKey=`${request.sourceId}:${keyOf(source)}`;
      const saved=this.get('SELECT * FROM source_map WHERE family_id=? AND source_key=?',familyId,sourceKey);
      if(saved){const old=cloud[saved.target_key];if(old)id=old.id;}
      if(source.kind==='transactions'&&source.fields.externalId){const match=Object.values(cloud).find(r=>r.kind==='transactions'&&r.childId===targetChild&&(r.id===source.fields.externalId||r.fields.externalId===source.fields.externalId));if(match)id=match.id;}
      ids.set(keyOf(source),{childId:targetChild,id,sourceKey});
    }
    for(const source of request.records){
      const mapped=ids.get(keyOf(source));if(!mapped){summary.skipped++;continue;}
      const r={kind:source.kind,id:mapped.id,childId:mapped.childId,fields:clone(source.fields)};
      if(r.kind==='challengeCheckIns'&&r.fields.challengeId)r.fields.challengeId=ids.get(`${source.childId}/habitChallenges/${r.fields.challengeId}`)?.id??r.fields.challengeId;
      if(['achievementAwards','achievementTemplates'].includes(r.kind)&&r.fields.key?.startsWith('challenge_')){const cid=r.fields.key.slice(10);r.fields.key='challenge_'+(ids.get(`${source.childId}/habitChallenges/${cid}`)?.id??cid);}
      try { this.validateRecord(r,familyId,{importing:true}); }
      catch(error){
        if(error instanceof Fault){
          const index=request.records.indexOf(source)+1;
          const recordLabel=r.kind==='transactions'?'积分记录':'记录';
          error.message=`导入第 ${index} 条${recordLabel}（${source.id}）：${error.message}`;
          error.details={...error.details,recordIndex:index,recordId:source.id,kind:r.kind};
        }
        throw error;
      }
      const key=keyOf(r),old=cloud[key],decision=request.decisions?.[key];
      if(this.record(familyId,key)?.deleted){conflicts.push({key,type:'deletedRecord',label:r.fields.name??r.fields.title??r.kind,local:r.fields,remote:{deleted:true},choice:'remote',required:false});summary.skipped++;continue;}
      if(old&&r.kind!=='transactions')r.fields={...old.fields,...r.fields};
      if(old){
        const a={...old.fields},b={...r.fields};if(r.kind==='profiles'){delete a.totalPoints;delete b.totalPoints;}
        const onlyAdditions=Object.keys(a).every(k=>equal(a[k],b[k]));
        if(onlyAdditions&&!equal(a,b)&&r.kind!=='transactions'){
          if(r.kind==='profiles')r.fields.totalPoints=old.fields.totalPoints;
          next[key]=r;changes.set(key,r);summary.updated++;sources.push({...mapped,targetKey:key,sourceHash:hash(stable(source))});continue;
        }
        if(equal(a,b)){summary.duplicates++;sources.push({...mapped,targetKey:key,sourceHash:hash(stable(source))});continue;}
        if(r.kind==='transactions'){
          conflicts.push({key,type:'ledgerDifference',label:r.fields.title,local:r.fields,remote:old.fields,choice:'remote',required:false});summary.duplicates++;continue;
        }
        conflicts.push({key,type:'fields',label:r.fields.name??r.fields.word??r.fields.title??r.kind,local:r.fields,remote:old.fields,choice:decision??'remote',required:false});
        if(decision!=='local'){summary.skipped++;sources.push({...mapped,targetKey:key,sourceHash:hash(stable(source))});continue;}
        if(r.kind==='profiles')r.fields.totalPoints=old.fields.totalPoints;
        next[key]=r;changes.set(key,r);summary.updated++;
      }else{
        const candidate=Object.values(next).find(x=>x.childId===r.childId&&x.kind===r.kind&&(
          r.kind==='transactions'?x.fields.type===r.fields.type&&x.fields.amount===r.fields.amount&&x.fields.title===r.fields.title&&Math.abs(Date.parse(x.fields.date)-Date.parse(r.fields.date))<3000:
          ['literacyProgresses','literacyNotebookEntries'].includes(r.kind)?x.fields.word===r.fields.word:
          ['achievementAwards','achievementTemplates'].includes(r.kind)?x.fields.key===r.fields.key:
          ['habits','rewards','quickActions'].includes(r.kind)?x.fields.name===r.fields.name:false));
        if(candidate){
          const choice=decision??null;conflicts.push({key,type:'possibleDuplicate',label:r.fields.title??r.fields.name??r.fields.word??r.kind,local:r.fields,remote:candidate.fields,candidateKey:keyOf(candidate),choice,required:!choice});
          if(!choice||choice==='remote'){summary.skipped++;if(choice)sources.push({...mapped,targetKey:keyOf(candidate),sourceHash:hash(stable(source))});continue;}
          assert(choice==='separate','IMPORT_CHOICE','疑似重复记录请选择保留两份或使用云端');
        }
        next[key]=r;changes.set(key,r);summary.added++;
        if(r.kind==='transactions')transactionsAdded.set(r.childId,(transactionsAdded.get(r.childId)??0)+points(r.fields));
      }
      sources.push({...mapped,targetKey:key,sourceHash:hash(stable(source))});
    }
    const balances=[];
    for(const source of sourceProfiles){
      const target=mappings[source.id];if(!target)continue;
      const key=`${target}/profiles/${target}`,old=cloud[key],p=next[key];
      const projected=old?old.fields.totalPoints+(transactionsAdded.get(target)??0):source.fields.totalPoints;
      const choice=request.balances?.[source.id];
      const final=choice?.mode==='local'?source.fields.totalPoints:choice?.mode==='remote'?(old?.fields.totalPoints??source.fields.totalPoints):choice?.mode==='custom'?Number(choice.value):projected;
      const incomplete=Math.abs(source.fields.totalPoints-request.records.filter(r=>r.kind==='transactions'&&r.childId===source.id).reduce((s,r)=>s+points(r.fields),0))>0;
      const required=!!old&&!choice;
      balances.push({sourceChildId:source.id,childId:target,name:source.fields.name,local:source.fields.totalPoints,cloud:old?.fields.totalPoints??null,proposed:projected,final,incomplete,required});
      assert(Number.isSafeInteger(final)&&Math.abs(final)<=1000000000,'INVALID_BALANCE','核定余额无效');
      const existingBase=old?.fields.totalPoints??0,ledgerDelta=transactionsAdded.get(target)??0,adjustment=final-existingBase-ledgerDelta;
      p.fields.totalPoints=final;changes.set(key,p);
      if(adjustment){const tx={kind:'transactions',childId:target,id:deterministicID(request.importId+':balance:'+target),fields:{type:'adjust',amount:adjustment,title:old?'家庭融合余额核定':'迁入期初余额',date:new Date().toISOString(),externalId:null,migrationId:request.importId}};changes.set(keyOf(tx),tx);}
    }
    const plan={id:request.importId,baseSeq:this.get('SELECT seq FROM families WHERE id=?',familyId).seq,records:[...changes.values()],sources,summary,conflicts,balances,mappings,ready:!conflicts.some(x=>x.required)&&!balances.some(x=>x.required)};
    plan.previewHash=hash(stable(plan));
    this.transaction(()=>{this.run('INSERT INTO migrations VALUES (?,?,?,?,?,?,NULL,?) ON CONFLICT(id) DO UPDATE SET request_hash=excluded.request_hash,base_seq=excluded.base_seq,plan=excluded.plan,expires_at=excluded.expires_at',request.importId,familyId,userId,hash(stable(request)),plan.baseSeq,stable(plan),Date.now()+3600000);this.checkFamilyQuota(familyId);});
    const {records,sources:privateSources,...preview}=plan;return preview;
  };
  Store.prototype.commitImport=function(userId,familyId,id,previewHash){
    this.access(userId,familyId,true);
    return this.transaction(()=>{
      const row=this.get('SELECT * FROM migrations WHERE id=?',id);assert(row&&row.user_id===userId&&row.family_id===familyId,'NOT_FOUND','导入预览不存在',404);
      if(row.result)return JSON.parse(row.result);
      const plan=JSON.parse(row.plan);assert(plan.ready&&plan.previewHash===previewHash&&row.expires_at>Date.now(),'IMPORT_NOT_READY','请先完成导入预览和余额核定',409);
      const family=this.get('SELECT * FROM families WHERE id=?',familyId);assert(family.seq===row.base_seq,'IMPORT_STALE','家人在预览后更新了数据，请重新预览',409);
      const seq=family.seq+1,records=plan.records.map(r=>this.writeRecord(familyId,r,seq));
      for(const s of plan.sources)this.run('INSERT INTO source_map VALUES (?,?,?,?) ON CONFLICT(family_id,source_key) DO UPDATE SET target_key=excluded.target_key,source_hash=excluded.source_hash',familyId,s.sourceKey,s.targetKey,s.sourceHash);
      this.publish(familyId,records);
      const result={id,status:'applied',commitSeq:seq,summary:plan.summary};this.run('UPDATE migrations SET result=? WHERE id=?',stable(result),id);this.checkFamilyQuota(familyId);return result;
    });
  };
}
