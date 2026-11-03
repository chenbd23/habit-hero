import {createServer} from 'node:http';
import {isIP} from 'node:net';
import {timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {SyncStore,Fault} from './store.mjs';
import {installMigrations} from './migrations.mjs';
installMigrations(SyncStore);
const secretEqual=(a,b)=>typeof a==='string'&&typeof b==='string'&&b.length>=32&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function createApp({dbPath=process.env.HH_DB_PATH??'data/habit-hero.sqlite',store=null,gatewayKey=process.env.HH_GATEWAY_KEY??''}={}){
 if(gatewayKey&&gatewayKey.length<32)throw Error('HH_GATEWAY_KEY must contain at least 32 characters');
 const db=store??new SyncStore(dbPath),attempts=new Map();
 const limit=(key,max)=>{
  const now=Date.now();for(const [k,v]of attempts)if(now-v.start>=60000)attempts.delete(k);
  if(!attempts.has(key)&&attempts.size>=10000)throw new Fault('RATE_LIMIT','请求繁忙，请稍后再试',429);
  const a=attempts.get(key)??{start:now,count:0};a.count++;attempts.set(key,a);
  if(a.count>max)throw new Fault('RATE_LIMIT','请求过于频繁，请一分钟后重试',429);
 };
 const server=createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const reply=(status,data)=>{res.writeHead(status);res.end(JSON.stringify(data));};
  try{
   const path=new URL(req.url,'http://localhost').pathname,url=new URL(req.url,'http://localhost'),method=req.method;
   if(method==='GET'&&path==='/healthz')return reply(200,{ok:true,version:'3.1.0'});
   if(method==='GET'&&path==='/api/v1/info')return reply(200,db.info());
   if(!['GET','POST'].includes(method))throw new Fault('METHOD_NOT_ALLOWED','不支持的请求方法',405);
   const authPaths=['/api/v1/auth/login','/api/v1/auth/register','/api/v1/auth/child'];
   const accountPaths=['/api/v1/auth/logout','/api/v1/auth/password','/api/v1/auth/revoke'];
   if(path.startsWith('/api/v1/auth/')&&(![...authPaths,...accountPaths].includes(path)||method!=='POST'))throw new Fault('NOT_FOUND','接口不存在',404);
   const trusted=secretEqual(req.headers['x-hh-gateway-key'],gatewayKey),forwarded=req.headers['x-hh-client-ip'];
   const source=trusted&&typeof forwarded==='string'&&isIP(forwarded)?forwarded:req.socket.remoteAddress;
   const publicAuth=authPaths.includes(path);
   if(publicAuth)limit('auth-source:'+source,60);
   const token=req.headers.authorization?.replace(/^Bearer /,''),preKid=publicAuth?null:db.childAuthenticate(token),preSession=publicAuth||preKid?null:db.authenticate(token);
   if(method==='POST'&&preKid)limit('child-write:'+preKid.id,30);
   if(method==='POST'&&preSession&&!accountPaths.includes(path))limit('write:'+preSession.user_id,120);
   if(method==='POST'&&preSession&&['/api/v1/assets','/api/v1/migrations/preview'].includes(path))limit('heavy:'+preSession.user_id,20);
   const max=publicAuth?16384:path==='/api/v1/assets'||path==='/api/v1/migrations/preview'?24*1024*1024:2*1024*1024;
   const raw=[];let size=0;
   for await(const part of req){size+=part.length;if(size>max)throw new Fault('BODY_TOO_LARGE','请求数据过大',413);raw.push(part);}
   let body={};try{if(size)body=JSON.parse(Buffer.concat(raw).toString('utf8'));}catch{throw new Fault('INVALID_JSON','请求格式错误');}
   if(!body||typeof body!=='object'||Array.isArray(body))throw new Fault('INVALID_JSON','请求须为对象');
   if(publicAuth){
    // Combine account and verified source: a remote attacker cannot lock a target account globally.
    limit('auth-account:'+source+':'+String(body.username??'child').trim().toLowerCase().slice(0,80),10);
    if(path.endsWith('/register'))return reply(200,db.register(body));
    if(path.endsWith('/child'))return reply(200,db.childLogin(body.code));
    return reply(200,db.login(body));
   }
   const kid=preKid;
   const familyId=url.searchParams.get('familyId')??body.familyId;
   if(kid){
    if(method==='GET'&&path==='/api/v1/session')return reply(200,db.childInfo(kid));
    if(method==='POST'&&path==='/api/v1/auth/logout'){db.run('DELETE FROM child_sessions WHERE id=?',kid.id);return reply(200,{ok:true});}
    if(method==='GET'&&path==='/api/v1/sync/snapshot'&&familyId===kid.family_id)return reply(200,db.childSnapshot(kid));
    if(method==='POST'&&path==='/api/v1/child/actions')return reply(200,db.childAction(kid,body));
    if(method==='GET'&&path.startsWith('/api/v1/assets/')&&familyId===kid.family_id){
     const hash=path.split('/').at(-1);if(!db.childSnapshot(kid).records.some(r=>Object.values(r.fields).includes('asset:'+hash)))throw new Fault('FORBIDDEN','无权读取此附件',403);
     return reply(200,db.asset(kid.user_id,kid.family_id,hash));
    }
    throw new Fault('FORBIDDEN','儿童设备无此权限，请在家长设备操作',403);
   }
   const session=preSession,userId=session.user_id;
   if(method==='GET'&&path==='/api/v1/session')return reply(200,db.sessionInfo(userId));
   if(method==='POST'&&path==='/api/v1/auth/logout')return reply(200,db.logout(token));
   if(method==='POST'&&['/api/v1/auth/password','/api/v1/auth/revoke'].includes(path)){
    limit('password:'+userId,5);
    if(path.endsWith('/password'))return reply(200,db.changePassword(userId,body));
    db.verifyPassword(userId,body.currentPassword);return reply(200,db.revokeSessions(userId));
   }
   if(path==='/api/v1/families')return reply(200,method==='GET'?{families:db.families(userId)}:db.createFamily(userId,body));
   if(method==='POST'&&path==='/api/v1/families/join')return reply(200,db.join(userId,body.code));
   if(method==='POST'&&path==='/api/v1/operations')return reply(200,db.operation(userId,body));
   if(method==='GET'&&path==='/api/v1/members')return reply(200,{members:db.members(userId,familyId)});
   if(method==='POST'&&path==='/api/v1/members/remove')return reply(200,db.removeMember(userId,familyId,body.userId));
   if(path==='/api/v1/child-devices'){
    db.access(userId,familyId,true);
    return reply(200,method==='POST'?db.issueChild(userId,body):{devices:db.all('SELECT id,name,child_id,expires_at FROM child_sessions WHERE family_id=? AND expires_at>?',familyId,Date.now())});
   }
   if(method==='POST'&&path==='/api/v1/child-devices/revoke'){db.access(userId,familyId,true);db.run('DELETE FROM child_sessions WHERE id=? AND family_id=?',body.id,familyId);return reply(200,{ok:true});}
   if(method==='GET'&&path==='/api/v1/usage'){db.access(userId,familyId,true);return reply(200,db.familyUsage(familyId));}
   if(method==='POST'&&path==='/api/v1/invites')return reply(200,db.invite(userId,familyId));
   if(method==='GET'&&path==='/api/v1/sync/snapshot')return reply(200,db.snapshot(userId,familyId));
   if(method==='GET'&&path==='/api/v1/sync/changes')return reply(200,db.changes(userId,familyId,Number(url.searchParams.get('cursor')??0),url.searchParams.has('until')?Number(url.searchParams.get('until')):null,url.searchParams.get('limit')));
   if(method==='GET'&&path.startsWith('/api/v1/operations/'))return reply(200,db.receipt(userId,familyId,path.split('/').at(-1)));
   if(method==='POST'&&path==='/api/v1/assets')return reply(200,db.uploadAsset(userId,familyId,body));
   if(method==='GET'&&path.startsWith('/api/v1/assets/'))return reply(200,db.asset(userId,familyId,path.split('/').at(-1)));
   if(method==='POST'&&path==='/api/v1/migrations/preview')return reply(200,db.previewImport(userId,familyId,body));
   if(method==='POST'&&path==='/api/v1/migrations/commit')return reply(200,db.commitImport(userId,familyId,body.id,body.previewHash));
   throw new Fault('NOT_FOUND','接口不存在',404);
  }catch(e){if(!(e instanceof Fault))console.error('request failed:',e.name,e.message);if(e.code==='RATE_LIMIT')res.setHeader('Retry-After','60');if(!res.headersSent)reply(e instanceof Fault?e.status:500,{error:{code:e instanceof Fault?e.code:'INTERNAL_ERROR',message:e instanceof Fault?e.message:'服务暂时不可用，请重试',details:e.details??{}}});else res.end();}
 });
 server.requestTimeout=30000;server.headersTimeout=10000;server.maxRequestsPerSocket=1000;return {server,store:db};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const app=createApp();const port=Number(process.env.PORT??4318);app.server.listen(port,process.env.HOST??'0.0.0.0',()=>console.log(`Habit Hero Sync 3.1.0 listening on ${port}`));const stop=()=>app.server.close(()=>{app.store.close();process.exit(0);});process.on('SIGTERM',stop);process.on('SIGINT',stop);}
