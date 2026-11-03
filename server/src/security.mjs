import {randomBytes,createHash,scryptSync,timingSafeEqual,randomUUID} from 'node:crypto';
import {statfsSync} from 'node:fs';
import {dirname} from 'node:path';
import {Fault} from './store.mjs';
const digest=x=>createHash('sha256').update(x).digest('hex');
const token=()=>randomBytes(32).toString('base64url');
const requireThat=(ok,code,message,status=400)=>{if(!ok)throw new Fault(code,message,status);};
const positive=(value,fallback)=>{const n=Number(value??fallback);if(!Number.isSafeInteger(n)||n<=0)throw Error('Quota settings must be positive integers');return n;};
export function installSecurity(Store){
 Store.prototype.configureSecurity=function(o){
  const registration=o.registration??process.env.HH_REGISTRATION??'invite';
  if(!['invite','open'].includes(registration))throw Error('HH_REGISTRATION must be invite or open');
  this.limits={registration,maxUsers:positive(o.maxUsers??process.env.HH_MAX_USERS,100),maxFamilies:positive(o.maxFamilies??process.env.HH_MAX_FAMILIES,100),assetBytes:positive(o.assetBytes??process.env.HH_ASSET_BYTES,268435456),familyBytes:positive(o.familyBytes??process.env.HH_FAMILY_BYTES,335544320),minFreeBytes:positive(o.minFreeBytes??process.env.HH_MIN_FREE_BYTES,268435456),dbBytes:positive(o.dbBytes??process.env.HH_DB_MAX_BYTES,2147483648)};
  if(this.limits.dbBytes<this.get('PRAGMA page_size').page_size)throw Error('HH_DB_MAX_BYTES must allow at least one SQLite page');
  this.db.exec(`PRAGMA max_page_count=${Math.floor(this.limits.dbBytes/this.get('PRAGMA page_size').page_size)}; CREATE TABLE IF NOT EXISTS child_sessions(id TEXT PRIMARY KEY,token_hash TEXT UNIQUE,code_hash TEXT UNIQUE,user_id TEXT NOT NULL,family_id TEXT NOT NULL,child_id TEXT NOT NULL,name TEXT NOT NULL,expires_at INTEGER NOT NULL,code_expires_at INTEGER NOT NULL);`);
 };
 Store.prototype.checkDisk=function(){if(this.path===':memory:')return;const s=statfsSync(dirname(this.path));requireThat(s.bavail*s.bsize>=this.limits.minFreeBytes,'DISK_RESERVE','磁盘剩余空间不足，已暂停新增数据，请联系部署者',507);};
 Store.prototype.familyUsage=function(id){
  let bytes=0;for(const [table,expression]of [['records','length(CAST(fields AS BLOB))+length(CAST(field_versions AS BLOB))+length(CAST(key AS BLOB))'],['assets','length(data)'],['changes','length(CAST(body AS BLOB))'],['receipts','length(CAST(result AS BLOB))+length(CAST(request_hash AS BLOB))'],['migrations','length(CAST(plan AS BLOB))+coalesce(length(CAST(result AS BLOB)),0)'],['source_map','length(CAST(source_key AS BLOB))+length(CAST(target_key AS BLOB))+length(CAST(source_hash AS BLOB))'],['streams','length(CAST(id AS BLOB))+64']])bytes+=this.get(`SELECT coalesce(sum(${expression}),0) n FROM ${table} WHERE family_id=?`,id).n;
  return {bytes,limit:this.limits.familyBytes,assetBytes:this.get('SELECT coalesce(sum(length(data)),0) n FROM assets WHERE family_id=?',id).n,assetLimit:this.limits.assetBytes};
 };
 Store.prototype.checkFamilyQuota=function(id){requireThat(this.familyUsage(id).bytes<=this.limits.familyBytes,'FAMILY_QUOTA','家庭累计空间已满，请联系部署者扩容；历史不会自动删除',409);};
 Store.prototype.verifyPassword=function(userId,password){const u=this.get('SELECT * FROM users WHERE id=?',userId);requireThat(typeof password==='string'&&password.length<=256&&u&&timingSafeEqual(scryptSync(password,u.salt,64),Buffer.from(u.password,'hex')),'INVALID_CREDENTIALS','当前密码错误',401);};
 Store.prototype.revokeSessions=function(userId){this.run('DELETE FROM sessions WHERE user_id=?',userId);this.run('DELETE FROM child_sessions WHERE user_id=?',userId);return {ok:true};};
 Store.prototype.resetPassword=function(userId,password){requireThat(typeof password==='string'&&password.trim().length>=10&&password.length<=256,'INVALID_PASSWORD','密码须为 10 至 256 字');const salt=randomBytes(16).toString('hex');return this.transaction(()=>{this.run('UPDATE users SET salt=?,password=? WHERE id=?',salt,scryptSync(password,salt,64).toString('hex'),userId);return this.revokeSessions(userId);});};
 Store.prototype.changePassword=function(userId,body){this.verifyPassword(userId,body.currentPassword);return this.resetPassword(userId,body.newPassword);};
 Store.prototype.members=function(userId,familyId){this.access(userId,familyId,true);return this.all('SELECT u.id,u.username,m.role FROM members m JOIN users u ON u.id=m.user_id WHERE family_id=?',familyId);};
 Store.prototype.removeMember=function(userId,familyId,target){this.access(userId,familyId,true);return this.transaction(()=>{const m=this.access(target,familyId);requireThat(m.role!=='admin'||this.get("SELECT count(*) n FROM members WHERE family_id=? AND role='admin'",familyId).n>1,'LAST_ADMIN','不能移除家庭最后一位管理员',409);this.run('DELETE FROM members WHERE family_id=? AND user_id=?',familyId,target);this.run('DELETE FROM child_sessions WHERE family_id=? AND user_id=?',familyId,target);this.run('DELETE FROM invites WHERE family_id=?',familyId);return {ok:true};});};
 Store.prototype.issueChild=function(userId,{familyId,childId,name='孩子设备'}){this.access(userId,familyId,true);requireThat(this.record(familyId,`${childId}/profiles/${childId}`)&&!this.record(familyId,`${childId}/profiles/${childId}`).deleted,'CHILD_MISSING','孩子不存在');this.run('DELETE FROM child_sessions WHERE expires_at<=? OR (token_hash IS NULL AND code_expires_at<=?)',Date.now(),Date.now());requireThat(this.get('SELECT count(*) n FROM child_sessions WHERE family_id=?',familyId).n<20,'DEVICE_QUOTA','儿童设备最多 20 个，请先撤销旧设备',409);const id=randomUUID(),code=token();this.run('INSERT INTO child_sessions VALUES (?,NULL,?,?,?,?,?,?,?)',id,digest(code),userId,familyId,childId,String(name).slice(0,60),Date.now()+30*86400000,Date.now()+600000);return {id,code,expiresIn:600};};
 Store.prototype.childLogin=function(code){requireThat(typeof code==='string'&&code.length<=100,'INVALID_CODE','儿童设备码无效',401);return this.transaction(()=>{const s=this.get('SELECT * FROM child_sessions WHERE code_hash=? AND code_expires_at>?',digest(code.trim()),Date.now());requireThat(s,'INVALID_CODE','儿童设备码无效或已使用',401);this.access(s.user_id,s.family_id,true);const t=token();this.run('UPDATE child_sessions SET token_hash=?,code_hash=NULL WHERE id=?',digest(t),s.id);return {token:t,...this.childInfo(s)};});};
 Store.prototype.childAuthenticate=function(t){if(typeof t!=='string')return null;const s=this.get('SELECT * FROM child_sessions WHERE token_hash=? AND expires_at>?',digest(t),Date.now());if(s){this.access(s.user_id,s.family_id,true);requireThat(this.record(s.family_id,`${s.child_id}/profiles/${s.child_id}`)?.deleted===false,'UNAUTHORIZED','儿童资料已停用',401);}return s;};
 Store.prototype.childInfo=function(s){const f=this.get('SELECT * FROM families WHERE id=?',s.family_id);return {...this.info(),userId:s.id,username:s.name,role:'child',familyId:f.id,childId:s.child_id,families:[{id:f.id,name:f.name,role:'child'}]};};
 Store.prototype.childSnapshot=function(s){return {...this.childInfo(s),records:this.records(s.family_id).filter(r=>r.childId===s.child_id&&['profiles','habits','rewards','transactions','pendingTasks'].includes(r.kind)),cursor:this.get('SELECT seq FROM families WHERE id=?',s.family_id).seq};};
 Store.prototype.childAction=function(s,body){
  requireThat(body&&['task','redeem'].includes(body.action)&&typeof body.requestId==='string'&&/^[a-z0-9-]{1,80}$/i.test(body.requestId),'INVALID_ACTION','儿童操作无效');
  requireThat(body.serverId===this.info().serverId&&body.datasetEpoch===this.info().datasetEpoch,'DATASET_CHANGED','服务已恢复，请重新连接',409);
  const operationId=digest(`${s.id}:${body.requestId}`),prior=this.get('SELECT request_hash,result FROM receipts WHERE family_id=? AND operation_id=?',s.family_id,operationId);
  // A bounded, stored request fingerprint makes a lost-response retry idempotent.
  const fingerprint=digest(JSON.stringify({action:body.action,id:body.id,expectedCost:body.expectedCost}));
  if(prior){requireThat(JSON.parse(prior.result).childFingerprint===fingerprint,'ID_REUSED','操作编号已使用',409);return JSON.parse(prior.result);}
  const kind=body.action==='task'?'habits':'rewards',r=this.record(s.family_id,`${s.child_id}/${kind}/${body.id}`);requireThat(r&&!r.deleted,'NOT_FOUND','任务或奖励已不存在',404);
  const amount=body.action==='task'?r.fields.points:r.fields.cost;requireThat(Number.isSafeInteger(amount)&&amount>=0&&amount<=1000000,'INVALID_AMOUNT','积分配置无效');
  const date=new Date().toISOString();let fields,recordKind;
  if(body.action==='task'){
   const timezone=this.get('SELECT timezone FROM families WHERE id=?',s.family_id).timezone;const day=x=>Number.isFinite(Date.parse(x))?new Intl.DateTimeFormat('en-CA',{timeZone:timezone}).format(new Date(x)):null;
   requireThat(!this.records(s.family_id).some(x=>x.childId===s.child_id&&(x.kind==='pendingTasks'&&x.fields.habitId===r.id&&day(x.fields.timestamp)===day(date)||x.kind==='transactions'&&x.fields.type==='earn'&&x.fields.title===r.fields.name&&day(x.fields.date)===day(date))),'ALREADY_REQUESTED','今天已提交这个任务',409);
   fields={habitId:r.id,habitName:r.fields.name,points:amount,emoji:r.fields.emoji??'⭐',timestamp:date};recordKind='pendingTasks';
  }else{requireThat(body.expectedCost===amount,'PRICE_CHANGED','奖励价格已变，请刷新后重新确认',409);requireThat(typeof body.validUntil==='string'&&Date.parse(body.validUntil)>=Date.now()&&Date.parse(body.validUntil)<=Date.now()+180000,'EXPIRED','兑换确认已过期，请重新选择');fields={type:'spend',amount,title:r.fields.name,date};recordKind='transactions';}
  const op={...this.info(),childFingerprint:fingerprint,protocolVersion:1,familyId:s.family_id,operationId,clientStreamId:operationId,clientSeq:1,changes:[{action:'create',record:{kind:recordKind,id:operationId,childId:s.child_id,fields}}]};
  const result=this.operation(s.user_id,op);
  return result;
 };
 Store.prototype.unreferencedAssets=function(familyId){
  return this.all('SELECT hash,length(data) bytes FROM assets WHERE family_id=?',familyId).filter(x=>{
   const ref='asset:'+x.hash;
   return !this.get('SELECT 1 FROM records WHERE family_id=? AND instr(fields,?)>0 LIMIT 1',familyId,ref)&&!this.get('SELECT 1 FROM changes WHERE family_id=? AND instr(body,?)>0 LIMIT 1',familyId,ref)&&!this.get('SELECT 1 FROM migrations WHERE family_id=? AND (result IS NOT NULL OR expires_at>?) AND instr(plan,?)>0 LIMIT 1',familyId,Date.now(),ref);
  });
 };
}
