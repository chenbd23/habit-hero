import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import {installSecurity} from './security.mjs';
import { dirname } from 'node:path';
import { PROTOCOL, KINDS, stable, equal, clone, keyOf, points, recordsMap } from '../../shared/sync-protocol.js';

export class Fault extends Error {
  constructor(code, message, status = 400, details = {}) { super(message); this.code=code; this.status=status; this.details=details; }
}
const fail = (condition, code, message, status=400, details={}) => { if(!condition) throw new Fault(code,message,status,details); };
const hash = value => createHash('sha256').update(value).digest('hex');
const opaque = () => randomBytes(32).toString('base64url');
const now = () => new Date().toISOString();
const parse = x => JSON.parse(x);
const idOK = x => typeof x === 'string' && /^[a-zA-Z0-9_.:-]{1,160}$/.test(x);
const int = (x,min=-1000000000,max=1000000000) => Number.isSafeInteger(x) && x>=min && x<=max;
const safeText = (s, min=1, max=120) => typeof s==='string' && s.trim().length>=min && s.length<=max;
const mediaFields = new Set(['avatarData','imageData','medalImageData','prizeImageData','challengeMakeupCardImageData']);
const secrets = new Set(['masterPin','parentPin','aiApiKey','aiImageApiKey','token','password','h5BaseURL','h5SyncEnabled','h5LastSyncAt']);

export class SyncStore {
  constructor(path, {testHook=null,...options}={}) {
    if(path!==':memory:') mkdirSync(dirname(path),{recursive:true});
    this.db=new DatabaseSync(path); this.testHook=testHook;this.path=path;this.options=options;
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,salt TEXT NOT NULL,password TEXT NOT NULL,is_admin INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),device_name TEXT NOT NULL,expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS families(id TEXT PRIMARY KEY,name TEXT NOT NULL,timezone TEXT NOT NULL,seq INTEGER NOT NULL DEFAULT 0,min_seq INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS members(family_id TEXT NOT NULL REFERENCES families(id),user_id TEXT NOT NULL REFERENCES users(id),role TEXT NOT NULL,PRIMARY KEY(family_id,user_id));
      CREATE TABLE IF NOT EXISTS invites(code_hash TEXT PRIMARY KEY,family_id TEXT NOT NULL,role TEXT NOT NULL,expires_at INTEGER NOT NULL,used_by TEXT);
      CREATE TABLE IF NOT EXISTS records(family_id TEXT NOT NULL,key TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,child_id TEXT NOT NULL,fields TEXT NOT NULL,field_versions TEXT NOT NULL,revision INTEGER NOT NULL,deleted INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(family_id,key));
      CREATE INDEX IF NOT EXISTS record_children ON records(family_id,child_id,kind);
      CREATE TABLE IF NOT EXISTS receipts(family_id TEXT NOT NULL,operation_id TEXT NOT NULL,stream_id TEXT NOT NULL,client_seq INTEGER NOT NULL,user_id TEXT NOT NULL,request_hash TEXT NOT NULL,result TEXT NOT NULL,commit_seq INTEGER NOT NULL,PRIMARY KEY(family_id,operation_id),UNIQUE(family_id,stream_id,client_seq));
      CREATE TABLE IF NOT EXISTS streams(family_id TEXT NOT NULL,id TEXT NOT NULL,user_id TEXT NOT NULL,last_seq INTEGER NOT NULL,PRIMARY KEY(family_id,id));
      CREATE TABLE IF NOT EXISTS changes(family_id TEXT NOT NULL,seq INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(family_id,seq));
      CREATE TABLE IF NOT EXISTS assets(family_id TEXT NOT NULL,hash TEXT NOT NULL,mime TEXT NOT NULL,data BLOB NOT NULL,PRIMARY KEY(family_id,hash));
      CREATE TABLE IF NOT EXISTS migrations(id TEXT PRIMARY KEY,family_id TEXT NOT NULL,user_id TEXT NOT NULL,request_hash TEXT NOT NULL,base_seq INTEGER NOT NULL,plan TEXT NOT NULL,result TEXT,expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS source_map(family_id TEXT NOT NULL,source_key TEXT NOT NULL,target_key TEXT NOT NULL,source_hash TEXT NOT NULL,PRIMARY KEY(family_id,source_key));
    `);
    for(const key of ['serverId','datasetEpoch']) this.run('INSERT OR IGNORE INTO meta VALUES (?,?)',key,randomUUID());
    this.run('INSERT OR IGNORE INTO meta VALUES (?,?)','schemaVersion','1');
    this.configureSecurity(options);
  }
  get(sql,...args){return this.db.prepare(sql).get(...args);}
  all(sql,...args){return this.db.prepare(sql).all(...args);}
  run(sql,...args){return this.db.prepare(sql).run(...args);}
  transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  info(){return {protocolVersion:PROTOCOL,version:'3.1.0',serverId:this.get('SELECT value FROM meta WHERE key=?','serverId').value,datasetEpoch:this.get('SELECT value FROM meta WHERE key=?','datasetEpoch').value,needsBootstrap:!this.get('SELECT id FROM users LIMIT 1'),allowRegistration:this.limits.registration==='open',serverTime:now()};}
  register({username,password,inviteCode,deviceName='设备'}, {operator=false}={}) {
    fail(safeText(username,3,80)&&safeText(password,10,256),'INVALID_CREDENTIALS','用户名至少 3 位，密码至少 10 位');
    fail(operator||this.limits.registration==='open'||this.validInvite(inviteCode),'REGISTRATION_CLOSED','注册受控，请向部署者申请账户或向家人索取邀请码',403);
    fail(this.get('SELECT count(*) n FROM users').n<this.limits.maxUsers,'USER_QUOTA','账户数量已达部署上限',409);
    this.checkDisk();
    const salt=randomBytes(16).toString('hex'),digest=scryptSync(password,salt,64).toString('hex');
    return this.transaction(()=>{
      const first=!this.get('SELECT id FROM users LIMIT 1');
      fail(!this.get('SELECT id FROM users WHERE username=?',username.trim().toLowerCase()),'USER_EXISTS','用户名已存在',409);
      const id=randomUUID(); this.run('INSERT INTO users VALUES (?,?,?,?,?)',id,username.trim().toLowerCase(),salt,digest,first?1:0);
      if(inviteCode)this.joinInternal(id,inviteCode);
      return this.createSession(id,deviceName);
    });
  }
  login({username,password,deviceName='设备'}) {
    fail(typeof username==='string'&&typeof password==='string'&&password.length<=256,'INVALID_CREDENTIALS','登录信息无效',401);
    const u=this.get('SELECT * FROM users WHERE username=?',username.trim().toLowerCase());
    const check=scryptSync(password,u?.salt??'unregistered-user',64);
    fail(u && timingSafeEqual(check,Buffer.from(u.password,'hex')),'INVALID_CREDENTIALS','用户名或密码错误',401);
    return this.createSession(u.id,deviceName);
  }
  createSession(userId,deviceName){this.run('DELETE FROM sessions WHERE expires_at<=?',Date.now());this.run('DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE user_id=? ORDER BY expires_at DESC LIMIT -1 OFFSET 19)',userId);const token=opaque();this.run('INSERT INTO sessions VALUES (?,?,?,?)',hash(token),userId,String(deviceName).slice(0,120),Date.now()+30*86400000);return {token,userId,families:this.families(userId),...this.info()};}
  authenticate(token){const session=typeof token==='string' && this.get('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?',hash(token),Date.now());fail(session,'UNAUTHORIZED','登录已失效，请重新登录',401);return session;}
  logout(token){this.run('DELETE FROM sessions WHERE token_hash=?',hash(token));return {ok:true};}
  families(userId){return this.all('SELECT f.id,f.name,f.timezone,m.role FROM families f JOIN members m ON f.id=m.family_id WHERE m.user_id=?',userId);}
  sessionInfo(userId){return {userId,username:this.get('SELECT username FROM users WHERE id=?',userId).username,families:this.families(userId),...this.info()};}
  access(userId,familyId,admin=false){const m=this.get('SELECT * FROM members WHERE family_id=? AND user_id=?',familyId,userId);fail(m && (!admin||m.role==='admin'),'FORBIDDEN','没有该家庭的访问或管理权限',403);return m;}
  createFamily(userId,{name,timezone='Asia/Shanghai',requestId}){
    fail(safeText(name,1,60)&&idOK(requestId),'INVALID_FAMILY','家庭名称或请求标识无效');
    try{new Intl.DateTimeFormat('en',{timeZone:timezone}).format();}catch{throw new Fault('INVALID_TIMEZONE','时区无效');}
    return this.transaction(()=>{
      const id=hash(userId+':'+requestId).slice(0,32), existing=this.get('SELECT * FROM families WHERE id=?',id);
      if(existing){fail(existing.name===name,'ID_REUSED','请求标识已用于其他家庭',409);return existing;}
      fail(this.families(userId).length<5&&this.get('SELECT count(*) n FROM families').n<this.limits.maxFamilies,'FAMILY_QUOTA','家庭数量已达上限',409);
      this.checkDisk();
      this.run('INSERT INTO families(id,name,timezone) VALUES (?,?,?)',id,name,timezone);this.run('INSERT INTO members VALUES (?,?,?)',id,userId,'admin');return this.get('SELECT * FROM families WHERE id=?',id);
    });
  }
  validInvite(code){return typeof code==='string' && this.get('SELECT * FROM invites WHERE code_hash=? AND expires_at>? AND used_by IS NULL',hash(code.trim()),Date.now());}
  invite(userId,familyId){this.access(userId,familyId,true);this.run('DELETE FROM invites WHERE expires_at<=? OR used_by IS NOT NULL',Date.now());fail(this.get('SELECT count(*) n FROM invites WHERE family_id=?',familyId).n<20,'INVITE_QUOTA','有效邀请码已达上限',409);const code=opaque();this.run('INSERT INTO invites VALUES (?,?,?,?,NULL)',hash(code),familyId,'admin',Date.now()+86400000);return {code,expiresAt:new Date(Date.now()+86400000).toISOString()};}
  joinInternal(userId,code){
    const row=this.get('SELECT * FROM invites WHERE code_hash=?',hash(String(code).trim()));
    if(row?.used_by===userId)return this.families(userId);
    fail(row && !row.used_by && row.expires_at>Date.now(),'INVALID_INVITE','邀请码无效或已过期',403);
    fail(this.families(userId).some(f=>f.id===row.family_id)||this.families(userId).length<5,'FAMILY_QUOTA','每个账户最多加入 5 个家庭',409);
    this.run('INSERT OR IGNORE INTO members VALUES (?,?,?)',row.family_id,userId,row.role);this.run('UPDATE invites SET used_by=? WHERE code_hash=?',userId,row.code_hash);return this.families(userId);
  }
  join(userId,code){return this.transaction(()=>{const families=this.joinInternal(userId,code);return {families,joinedFamilyId:this.get('SELECT family_id FROM invites WHERE code_hash=?',hash(String(code).trim())).family_id};});}
  decode(row){return row ? {kind:row.kind,id:row.id,childId:row.child_id,fields:parse(row.fields),version:row.revision,deleted:!!row.deleted} : null;}
  record(familyId,key){return this.decode(this.get('SELECT * FROM records WHERE family_id=? AND key=?',familyId,key));}
  records(familyId){return this.all('SELECT * FROM records WHERE family_id=? AND deleted=0 ORDER BY key',familyId).map(r=>this.decode(r));}
  snapshot(userId,familyId){this.access(userId,familyId);return this.transaction(()=>({records:this.records(familyId),cursor:this.get('SELECT seq FROM families WHERE id=?',familyId).seq,...this.info(),familyId}));}
  changes(userId,familyId,cursor,until,limit=100){
    this.access(userId,familyId);const f=this.get('SELECT * FROM families WHERE id=?',familyId);
    fail(int(cursor,0)&&cursor>=f.min_seq&&cursor<=f.seq,'CURSOR_EXPIRED','需要重新下载家庭快照',409);
    const high=until==null?f.seq:Number(until);fail(int(high,cursor,f.seq),'INVALID_CURSOR','同步边界无效');
    const rows=this.all('SELECT seq,body FROM changes WHERE family_id=? AND seq>? AND seq<=? ORDER BY seq LIMIT ?',familyId,cursor,high,Math.min(100,Math.max(1,Number(limit)||100)));
    const next=rows.length?rows.at(-1).seq:high;
    return {groups:rows.map(r=>{const group=parse(r.body);if(group.receipt?.userId!==userId)delete group.receipt;return group;}),cursor:next,until:high,hasMore:next<high,...this.info(),familyId};
  }
  receipt(userId,familyId,operationId){this.access(userId,familyId);const r=this.get('SELECT result,user_id FROM receipts WHERE family_id=? AND operation_id=?',familyId,operationId);fail(r&&r.user_id===userId,'NOT_FOUND','尚未找到操作结果',404);return parse(r.result);}
  validateRecord(r,familyId,{importing=false}={}){
    fail(r&&KINDS.includes(r.kind)&&idOK(r.id)&&idOK(r.childId)&&r.fields&&typeof r.fields==='object'&&!Array.isArray(r.fields),'INVALID_RECORD','记录格式无效');
    fail(stable(r.fields).length<=300000,'RECORD_TOO_LARGE','记录过大，请把图片作为附件上传');
    for(const [k,v]of Object.entries(r.fields)){
      fail(!secrets.has(k)&&!['__proto__','prototype','constructor','imagePath'].includes(k),'PRIVATE_FIELD','不可同步凭据或本机路径');
      if(mediaFields.has(k)&&v!==null){fail(typeof v==='string'&&/^asset:[0-9a-f]{64}$/.test(v),'INVALID_ASSET','图片必须作为附件上传');fail(this.get('SELECT hash FROM assets WHERE family_id=? AND hash=?',familyId,v.slice(6)),'ASSET_MISSING','附件未上传完成',409);}
      if(typeof v==='number')fail(Number.isFinite(v)&&Math.abs(v)<=1000000000,'INVALID_NUMBER','数值超出范围');
    }
    if(r.kind==='profiles')fail(r.id===r.childId&&safeText(r.fields.name,1,60)&&int(r.fields.totalPoints??0),'INVALID_PROFILE','孩子资料无效');
    if(r.kind==='transactions'){
      const check=(ok,field,message)=>fail(ok,'INVALID_TRANSACTION',message,400,{field});
      check(['earn','spend','adjust'].includes(r.fields.type),'type','积分记录的收支类型无效，应为收入、支出或调整');
      check(int(r.fields.amount,-1000000,1000000),'amount','积分记录的金额须为 -1000000 至 1000000 的整数');
      // Historical iOS/H5 remarks were unrestricted. Preserve them verbatim on
      // import; the per-record size limit above still applies. Never drop a
      // ledger entry or change its amount just to make migration succeed.
      check(importing ? typeof r.fields.title==='string' : safeText(r.fields.title,1,500),'title',importing?'积分记录的备注须为文本':'积分记录的备注须为 1 至 500 字');
      check(typeof r.fields.date==='string'&&Number.isFinite(Date.parse(r.fields.date)),'date','积分记录的日期无效');
    }
    if(r.kind==='ownedItems')fail(int(r.fields.count,0,1000000),'INVALID_STOCK','道具数量无效');
    if(r.kind==='ownedPokemons')fail(int(r.fields.level,1,100)&&safeText(r.fields.speciesId,1,160),'INVALID_POKEMON','宝可梦资料无效');
  }
  writeRecord(familyId,r,seq,changedFields=null){
    const key=keyOf(r), prior=this.get('SELECT field_versions FROM records WHERE family_id=? AND key=?',familyId,key),versions=prior?parse(prior.field_versions):{};
    for(const field of changedFields??Object.keys(r.fields))versions[field]=seq;
    this.run('INSERT INTO records VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(family_id,key) DO UPDATE SET fields=excluded.fields,field_versions=excluded.field_versions,revision=excluded.revision,deleted=excluded.deleted',familyId,key,r.kind,r.id,r.childId,stable(r.fields),stable(versions),seq,r.deleted?1:0);
    return {...r,version:seq};
  }
  publish(familyId,records,receipt=null){const f=this.get('SELECT seq FROM families WHERE id=?',familyId);const seq=f.seq+1;this.run('UPDATE families SET seq=? WHERE id=?',seq,familyId);const group={seq,records, ...(receipt?{receipt}: {})};this.run('INSERT INTO changes VALUES (?,?,?)',familyId,seq,stable(group));return seq;}
  operation(userId,op){
    fail(op&&op.protocolVersion===PROTOCOL&&idOK(op.operationId)&&idOK(op.clientStreamId)&&int(op.clientSeq,1)&&Array.isArray(op.changes)&&op.changes.length<=10000,'INVALID_OPERATION','操作协议或内容无效');
    const familyId=op.familyId;this.access(userId,familyId,true);this.checkDisk();const info=this.info();
    fail(op.serverId===info.serverId&&op.datasetEpoch===info.datasetEpoch,'DATASET_CHANGED','服务数据版本已变化，请重新核对家庭数据',409);
    const digest=hash(stable(op));
    return this.transaction(()=>{
      const existing=this.get('SELECT * FROM receipts WHERE family_id=? AND operation_id=?',familyId,op.operationId);
      if(existing){fail(existing.user_id===userId&&existing.request_hash===digest,'ID_REUSED','同一操作编号不能提交不同内容',409);return parse(existing.result);}
      const stream=this.get('SELECT * FROM streams WHERE family_id=? AND id=?',familyId,op.clientStreamId);
      fail(!stream||stream.user_id===userId,'STREAM_OWNER','设备流不属于当前账户',403);
      fail(op.clientSeq===(stream?.last_seq??0)+1,'SEQUENCE_GAP','设备操作序号不连续，请先恢复待提交操作',409,{expected:(stream?.last_seq??0)+1});
      const seq=this.get('SELECT seq FROM families WHERE id=?',familyId).seq+1;
      let output=[],result;
      this.db.exec('SAVEPOINT command');
      try{
        for(const dep of op.dependsOn??[]){const r=this.get('SELECT result FROM receipts WHERE family_id=? AND operation_id=?',familyId,dep);fail(r&&parse(r.result).status==='applied','DEPENDENCY_FAILED','前置操作未成功，请处理关联草稿',409);}
        if(op.validUntil)fail(Date.parse(op.validUntil)>=Date.now(),'EXPIRED','操作确认时间已过，请重新发起');
        output=this.mutate(familyId,op,seq);
        this.testHook?.('afterMutation');
        result={operationId:op.operationId,status:'applied',commitSeq:seq};
        this.db.exec('RELEASE command');
      }catch(e){
        this.db.exec('ROLLBACK TO command');this.db.exec('RELEASE command');
        if(!(e instanceof Fault))throw e;
        output=[];result={operationId:op.operationId,status:['CONFLICT','ENTITY_DELETED'].includes(e.code)?'conflict':'rejected',code:e.code,message:e.message,details:e.details,commitSeq:seq};
      }
      if(op.childFingerprint)result.childFingerprint=op.childFingerprint;
      this.run('INSERT INTO receipts VALUES (?,?,?,?,?,?,?,?)',familyId,op.operationId,op.clientStreamId,op.clientSeq,userId,digest,stable(result),seq);
      this.run('INSERT INTO streams VALUES (?,?,?,?) ON CONFLICT(family_id,id) DO UPDATE SET last_seq=excluded.last_seq',familyId,op.clientStreamId,userId,op.clientSeq);
      this.testHook?.('afterReceipt');
      this.publish(familyId,output,{...result,userId,clientStreamId:op.clientStreamId,clientSeq:op.clientSeq});
      this.checkFamilyQuota(familyId);
      this.testHook?.('afterPublish');return result;
    });
  }
  mutate(familyId,op,seq){
    const touched=new Map(),balances=new Map(),newChildren=new Set(),seen=new Set();
    const current=key=>touched.get(key)??this.record(familyId,key);
    for(const c of op.changes){
      fail(['create','patch','delete'].includes(c.action),'INVALID_CHANGE','不支持的修改类型');
      const key=c.action==='create'?keyOf(c.record):c.key;fail(typeof key==='string'&&!seen.has(key),'DUPLICATE_CHANGE','单个操作中记录重复');seen.add(key);
      const old=current(key);
      let next, fields;
      if(c.action==='create'){
        fail(!old,'CONFLICT','该记录已存在或已删除',409,{key,remote:old});
        next=clone(c.record);delete next.version;delete next.deleted;this.validateRecord(next,familyId);
        if(next.kind==='profiles'){fail((next.fields.totalPoints??0)===0,'IMPORT_REQUIRED','已有余额必须通过家庭融合导入');next.fields.totalPoints=0;newChildren.add(next.childId);}
        if(next.kind==='transactions')balances.set(next.childId,(balances.get(next.childId)??0)+points(next.fields));
      }else{
        fail(old&&!old.deleted,'ENTITY_DELETED','记录已被删除，原修改保留为草稿',409,{key});
        fail(old.kind!=='transactions','IMMUTABLE_LEDGER','已确认积分记录不可修改或删除，请新增更正记录');
        fail(int(c.baseVersion,0),'INVALID_VERSION','记录版本无效');
        let baseVersion=c.baseVersion;
        if(c.baseAfterOperationId){const dep=this.get('SELECT result FROM receipts WHERE family_id=? AND operation_id=?',familyId,c.baseAfterOperationId);fail(dep&&parse(dep.result).status==='applied','DEPENDENCY_FAILED','前置修改未确认',409);baseVersion=parse(dep.result).commitSeq;}
        const versions=parse(this.get('SELECT field_versions FROM records WHERE family_id=? AND key=?',familyId,key).field_versions);
        if(c.action==='delete'){
          fail(old.version<=baseVersion,'CONFLICT','删除前记录已被其他设备修改',409,{key,remote:old});next={...old,deleted:true};
        }else{
          fail(c.set&&typeof c.set==='object'&&!Array.isArray(c.set),'INVALID_PATCH','字段修改无效');
          fields=Object.keys(c.set);fail(!fields.includes('totalPoints'),'SERVER_BALANCE','余额由账本计算，不能直接覆盖');
          for(const field of fields)fail((versions[field]??0)<=baseVersion,'CONFLICT','同一字段已被其他设备修改',409,{key,field,remote:old});
          next={...old,fields:{...old.fields,...clone(c.set)}};this.validateRecord(next,familyId);
        }
      }
      touched.set(key,next);
    }
    for(const [childId,amount]of balances){
      const key=`${childId}/profiles/${childId}`,p=current(key);fail(p&&!p.deleted,'CHILD_MISSING','孩子不存在');
      fail(int(p.fields.totalPoints+amount),'INVALID_BALANCE','积分超出范围');
      // New spending cannot consume unconfirmed local income; all effects here commit together.
      if(amount<0)fail(p.fields.totalPoints+amount>=0,'INSUFFICIENT_POINTS','积分不足，其他设备可能已经使用',409);
      touched.set(key,{...p,fields:{...p.fields,totalPoints:p.fields.totalPoints+amount}});
    }
    for(const r of touched.values()){
      if(r.kind!=='profiles' && r.childId!=='global')fail(current(`${r.childId}/profiles/${r.childId}`)&&!current(`${r.childId}/profiles/${r.childId}`).deleted,'CHILD_MISSING','关联孩子不存在');
      if(r.kind==='profiles'&&r.deleted){
        // Deleting a child is a separate administrator migration, never cascade away an audit ledger.
        fail(!this.get('SELECT key FROM records WHERE family_id=? AND child_id=? AND kind=? AND deleted=0',familyId,r.childId,'transactions'),'CHILD_HAS_LEDGER','有积分历史的孩子请保留档案，不能直接删除');
        for(const row of this.all('SELECT * FROM records WHERE family_id=? AND child_id=? AND deleted=0',familyId,r.childId))if(row.key!==keyOf(r))touched.set(row.key,{...this.decode(row),deleted:true});
      }
      if(r.kind==='ownedPokemons'&&!r.deleted){
        const ref=current(`${r.childId}/pokemonSpecies/${r.fields.speciesId}`)??current(`global/pokemonSpecies/${r.fields.speciesId}`);
        fail(ref&&!ref.deleted,'REFERENCE_MISSING','宝可梦图鉴引用不存在');
      }
      if(r.kind==='ownedItems'&&!r.deleted){
        const itemId=r.fields.itemId??r.id,ref=current(`${r.childId}/pokemonItems/${itemId}`)??current(`global/pokemonItems/${itemId}`);
        fail(ref&&!ref.deleted,'REFERENCE_MISSING','道具定义不存在');
      }
      if(r.kind==='challengeCheckIns'&&!r.deleted){
        fail(current(`${r.childId}/habitChallenges/${r.fields.challengeId}`)&&!current(`${r.childId}/habitChallenges/${r.fields.challengeId}`).deleted,'REFERENCE_MISSING','签到对应的挑战不存在');
        const day=String(r.fields.day).slice(0,10);
        for(const row of this.all('SELECT * FROM records WHERE family_id=? AND child_id=? AND kind=? AND deleted=0',familyId,r.childId,r.kind)){const old=this.decode(row);fail(old.id===r.id||old.fields.challengeId!==r.fields.challengeId||String(old.fields.day).slice(0,10)!==day,'ALREADY_CHECKED','当天已经签到',409);}
      }
      if(r.kind==='achievementAwards'&&!r.deleted){
        for(const row of this.all('SELECT * FROM records WHERE family_id=? AND child_id=? AND kind=? AND deleted=0',familyId,r.childId,r.kind)){const old=this.decode(row);if(old.id!==r.id&&old.fields.key===r.fields.key)touched.delete(keyOf(r));}
      }
    }
    const output=[];for(const r of touched.values()){const old=this.record(familyId,keyOf(r));const fields=Object.keys(r.fields).filter(k=>!equal(old?.fields[k],r.fields[k]));output.push(this.writeRecord(familyId,r,seq,fields));}
    return output;
  }
  uploadAsset(userId,familyId,{hash:assetHash,base64,mime}){this.access(userId,familyId,true);fail(typeof base64==='string'&&base64.length<=12*1024*1024,'ASSET_SIZE','图片最大 8 MB');const bytes=Buffer.from(base64,'base64');fail(bytes.length<=8*1024*1024&&hash(bytes)===assetHash,'ASSET_HASH','附件校验失败');fail(['image/png','image/jpeg','image/webp','image/gif'].includes(mime),'ASSET_TYPE','不支持的图片类型');if(!this.get('SELECT hash FROM assets WHERE family_id=? AND hash=?',familyId,assetHash)){this.checkDisk();fail(this.get('SELECT count(*) n FROM assets WHERE family_id=?',familyId).n<1000,'ASSET_QUOTA','家庭附件数量已达 1000，请联系部署者清理未引用附件',409);fail(this.get('SELECT coalesce(sum(length(data)),0) n FROM assets WHERE family_id=?',familyId).n+bytes.length<=this.limits.assetBytes,'ASSET_QUOTA','家庭附件累计空间已满，请联系部署者',409);this.transaction(()=>{this.run('INSERT INTO assets VALUES (?,?,?,?)',familyId,assetHash,mime,bytes);this.checkFamilyQuota(familyId);});}return {assetId:`asset:${assetHash}`};}
  asset(userId,familyId,assetHash){this.access(userId,familyId);const a=this.get('SELECT mime,data FROM assets WHERE family_id=? AND hash=?',familyId,assetHash);fail(a,'NOT_FOUND','附件不存在',404);return {hash:assetHash,mime:a.mime,base64:Buffer.from(a.data).toString('base64')};}
  close(){this.db.close();}
}

installSecurity(SyncStore);
