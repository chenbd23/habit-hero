import {SyncStore} from './store.mjs';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {copyFileSync,existsSync,mkdirSync,chmodSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export function backupDatabase(source,target){
  if(!existsSync(source))throw Error('Source database does not exist');
  if(existsSync(target))throw Error('Backup target already exists; choose a new path');
  mkdirSync(dirname(resolve(target)),{recursive:true});
  const db=new DatabaseSync(source);try{db.exec('PRAGMA busy_timeout=10000');db.prepare('VACUUM INTO ?').run(resolve(target));}finally{db.close();}
  const check=new DatabaseSync(target);try{if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Backup integrity check failed');}finally{check.close();}chmodSync(target,0o600);return {status:'backed_up',path:resolve(target)};
}
export function restoreDatabase(backup,target){
  if(!existsSync(backup)||existsSync(target))throw Error('Restore requires an existing backup and a new, unused target path');
  const source=new DatabaseSync(backup,{readOnly:true});try{if(source.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Backup integrity check failed');}finally{source.close();}
  mkdirSync(dirname(resolve(target)),{recursive:true});copyFileSync(backup,target);chmodSync(target,0o600);
  const db=new DatabaseSync(target);try{db.exec('BEGIN IMMEDIATE');db.prepare("UPDATE meta SET value=? WHERE key='datasetEpoch'").run(randomUUID());db.exec('DELETE FROM sessions; DELETE FROM invites;');if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='child_sessions'").get())db.exec('DELETE FROM child_sessions');db.exec('COMMIT');}finally{db.close();}
  return {status:'restored_to_new_database',path:resolve(target),requiresClientReconciliation:true};
}
export function accountCommand(path,action,username,password){
 const db=new SyncStore(path);try{
  if(action==='create-user'){const auth=db.register({username,password},{operator:true});db.revokeSessions(auth.userId);return {status:'created',username};}
  const u=db.get('SELECT id FROM users WHERE username=?',String(username).trim().toLowerCase());if(!u)throw Error('Account not found');
  if(action==='reset-password'){db.resetPassword(u.id,password);return {status:'password_reset_all_sessions_revoked'};}
  if(action==='revoke-sessions')return db.revokeSessions(u.id);
  throw Error('Unknown account action');
 }finally{db.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [action,source,target,flag]=process.argv.slice(2);
 try{
  let result;
  if(['backup','restore'].includes(action)&&source&&target)result=action==='backup'?backupDatabase(source,target):restoreDatabase(source,target);
  else if(['create-user','reset-password','revoke-sessions'].includes(action)&&source){
   const password=action==='revoke-sessions'?undefined:readFileSync(0,'utf8').replace(/\r?\n$/,'');
   result=accountCommand(process.env.HH_DB_PATH??'data/habit-hero.sqlite',action,source,password);
  }else if(action==='storage'){
   const db=new SyncStore(process.env.HH_DB_PATH??'data/habit-hero.sqlite');try{
    result=db.all('SELECT id,name FROM families').map(f=>({...f,...db.familyUsage(f.id)}));
   }finally{db.close();}
  }else if(action==='prune-assets'&&source){
   const db=new SyncStore(process.env.HH_DB_PATH??'data/habit-hero.sqlite');try{
    result=db.transaction(()=>{const candidates=db.unreferencedAssets(source);if(target==='--apply')for(const a of candidates)db.run('DELETE FROM assets WHERE family_id=? AND hash=?',source,a.hash);return {familyId:source,applied:target==='--apply',candidates,bytes:candidates.reduce((n,a)=>n+a.bytes,0)};});
   }finally{db.close();}
  }else throw Error('Usage: backup|restore SOURCE NEW_TARGET; create-user|reset-password|revoke-sessions USERNAME (password on stdin); storage; prune-assets FAMILY_ID [--apply]');
  console.log(JSON.stringify(result));
 }catch(e){console.error(e.message);process.exit(1);}
}
