import type { AppData, Transaction } from '../types.ts';
import type { FamilyCache } from './familyCache';
import { safeId } from './id.ts';
import { hashBase64 } from './hash.js';

export type WireRecord = {kind:string;id:string;childId:string;fields:Record<string,any>;version?:number;deleted?:boolean};
export type Family = {id:string;name:string;role:string};
type Session = {role?:string;token:string;userId:string;username:string;serverId:string;datasetEpoch:string;families:Family[];familyId?:string;childId?:string};
export type ImportDraft = {importId:string;sourceId:string;records:WireRecord[];assets:Record<string,{mime:string;base64:string}>;mappings:Record<string,string>;balances:Record<string,any>;decisions:Record<string,string>};
export class SyncError extends Error { code:string; constructor(message:string,code='NETWORK'){super(message);this.code=code;} }
const keyOf=(r:WireRecord)=>`${r.childId}/${r.kind}/${r.id}`;
const copy=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
const equal=(a:any,b:any)=>JSON.stringify(a??null)===JSON.stringify(b??null);
const media=new Set(['avatarData','imageData','medalImageData','prizeImageData','challengeMakeupCardImageData']);
const sessionKey='habit-hero-web-session-v1';

// The browser keeps its login and unconfirmed commands. Confirmed balances
// are always read from the service and never change optimistically.
export class SyncClient {
  session:Session|null=null;
  records:WireRecord[]=[];
  assets=new Map<string,string>();
  clockOffset=0;
  stale=true;
  recoveryRequired=false;
  fetcher:typeof fetch;
  storage:Storage;
  credentials:Storage;
  base:string;
  legacyCredentials?:Storage;
  backgroundImages:boolean;
  cache?:FamilyCache;
  cursor?:number;
  onBackgroundError?:(error:unknown)=>void;
  private cacheWrites:Promise<void>=Promise.resolve();
  private refreshWork?:{session:Session;familyId:string;promise:Promise<void>};
  onImagesChanged?:()=>void;
  private imageJobs=new Map<string,Promise<void>>();
  constructor({fetcher=globalThis.fetch.bind(globalThis),storage=localStorage,credentials=storage,legacyCredentials,backgroundImages=false,cache,base=''}:{fetcher?:typeof fetch;storage?:Storage;credentials?:Storage;legacyCredentials?:Storage;backgroundImages?:boolean;cache?:FamilyCache;base?:string}={}){
    this.fetcher=fetcher;this.storage=storage;this.credentials=credentials;this.legacyCredentials=legacyCredentials;this.backgroundImages=backgroundImages;this.cache=cache;this.base=base.replace(/\/$/,'');
    try{
      const saved=credentials.getItem(sessionKey)??legacyCredentials?.getItem(sessionKey)??'null';
      this.session=JSON.parse(saved);
      if(this.session){this.saveSession();legacyCredentials?.removeItem(sessionKey);}
    }catch{credentials.removeItem(sessionKey);legacyCredentials?.removeItem(sessionKey);}
  }
  saveSession(){this.credentials.setItem(sessionKey,JSON.stringify(this.session));}
  async request(path:string,body?:any,token=this.session?.token){
    let response:Response;
    try{response=await this.fetcher(`${this.base}/api/v1${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000),cache:'no-store',redirect:'error'});}
    catch{throw new SyncError('暂时无法连接服务器，请联网后重试。未确认操作会保留。');}
    let data:any;try{data=await response.json();}catch{throw new SyncError('服务器返回格式不正确，请检查 H5 的服务端连接配置。');}
    if(!response.ok)throw new SyncError(data.error?.message??'服务器请求失败',data.error?.code??'SERVER');
    return data;
  }
  async login(username:string,password:string,register=false,inviteCode=''){
    const info=await this.request('/info',undefined,'');
    if(info.protocolVersion!==1)throw new SyncError('服务器协议不兼容','PROTOCOL');
    const auth=await this.request(register?'/auth/register':'/auth/login',{username,password,inviteCode:inviteCode||undefined,deviceName:'Habit Hero H5'},'');
    const old=this.session;
    if(old&&this.pending().length&&(old.userId!==auth.userId||old.serverId!==auth.serverId))throw new SyncError('请先用原账户确认待处理操作，再切换账户。','PENDING');
    this.session={...auth,username:username.trim(),...(old&&old.userId===auth.userId&&old.serverId===auth.serverId?{familyId:old.familyId,childId:old.childId,datasetEpoch:old.datasetEpoch}:{})};
    this.clockOffset=Date.parse(auth.serverTime)-Date.now();this.saveSession();this.stale=true;
    await this.resume();
  }
  async resume(){
    if(!this.session)return;
    const current=this.session,info=await this.request('/session');
    if(current!==this.session)return;
    this.checkIdentity(info);
    this.session.families=info.families;this.session.username=info.username;
    if(this.session.familyId&&!info.families.some((f:Family)=>f.id===this.session?.familyId)&&this.pending().length){this.recoveryRequired=true;this.stale=true;throw new SyncError('家庭访问权限已变化，请先导出归档旧操作','FAMILY_REMOVED');}
    if(!info.families.some((f:Family)=>f.id===this.session?.familyId)){this.session.familyId=undefined;this.session.childId=undefined;this.records=[];this.cursor=undefined;}
    this.clockOffset=Date.parse(info.serverTime)-Date.now();this.saveSession();
    if(this.session.familyId)await this.refresh();
  }
  checkIdentity(info:any){
    if(info.serverId!==this.session?.serverId||info.datasetEpoch!==this.session?.datasetEpoch){
      this.stale=true;this.recoveryRequired=true;throw new SyncError('服务器已更换或恢复备份，请先核对待确认操作，再重新连接。','SERVER_CHANGED');
    }
  }
  async logout(){
    if(this.pending().length)throw new SyncError('仍有待确认操作，请先点击“核对并刷新”。','PENDING');
    if(this.session)await this.request('/auth/logout',{});
    this.recoveryRequired=false;this.session=null;this.cursor=undefined;this.records=[];this.assets.clear();this.stale=true;this.credentials.removeItem(sessionKey);this.legacyCredentials?.removeItem(sessionKey);this.legacyCredentials?.removeItem('habit-hero-parent-authenticated');this.credentials.removeItem('habit-hero-parent-authenticated');
  }
  async selectFamily(familyId:string){
    if(this.pending().length)throw new SyncError('请先确认当前家庭的待处理操作。','PENDING');
    if(!this.session?.families.some(f=>f.id===familyId))throw new SyncError('请选择可访问的家庭');
    this.session.familyId=familyId;this.session.childId=undefined;this.records=[];this.assets.clear();this.cursor=undefined;this.stale=true;this.saveSession();
    if(await this.restoreCachedFamily()){
      this.onImagesChanged?.();
      void this.refresh().then(()=>this.onImagesChanged?.()).catch(e=>this.onBackgroundError?.(e));
    }else{await this.refresh();}
  }
  selectChild(childId:string){
    if(this.pending().length)throw new SyncError('请先确认待处理操作。','PENDING');
    if(!this.children().some(r=>r.id===childId))throw new SyncError('孩子资料不存在');
    this.session!.childId=childId;this.saveSession();
  }
  children(){return this.records.filter(r=>r.kind==='profiles'&&!r.deleted);}
  async createFamily(name:string){
    const storageKey=`hh-web-create-family:${this.session?.serverId}:${this.session?.userId}`;
    let draft=JSON.parse(this.storage.getItem(storageKey)??'null');
    if(!draft||draft.name!==name){draft={name,requestId:safeId(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};this.storage.setItem(storageKey,JSON.stringify(draft));}
    const family=await this.request('/families',draft);await this.resume();this.storage.removeItem(storageKey);await this.selectFamily(family.id);
  }
  async joinFamily(code:string){const result=await this.request('/families/join',{code});await this.resume();await this.selectFamily(result.joinedFamilyId);}
  async createChild(name:string){const id=safeId();await this.commit([{action:'create',record:{kind:'profiles',id,childId:id,fields:{name:name.trim(),totalPoints:0,createdAt:new Date().toISOString()}}}]);this.selectChild(id);}
  cacheScope(){return `${this.scope()}:${this.session?.datasetEpoch??''}`;}
  async restoreCachedFamily(){
    if(!this.cache||!this.session?.familyId)return false;
    const current=this.session,familyId=current.familyId,scope=this.cacheScope();
    try{
      const cached=await this.cache.read(scope);
      if(!cached||!Array.isArray(cached.records)||!Number.isSafeInteger(cached.cursor)||cached.cursor<0)return false;
      const images=new Map<string,string>();
      const refs=this.imageRefs(cached.records);
      await Promise.all(refs.map(async ref=>{const value=await this.cache!.image(scope,ref);if(value)images.set(ref,value);}));
      if(current!==this.session||familyId!==this.session.familyId)return false;
      this.records=cached.records;this.cursor=cached.cursor;this.assets=images;this.stale=true;
      if(!this.children().some(r=>r.id===current.childId))current.childId=this.children()[0]?.id;
      this.saveSession();return true;
    }catch{return false;}
  }
  private persistCache(){
    if(!this.cache||this.cursor===undefined)return;
    const scope=this.cacheScope(),value={records:copy(this.records),cursor:this.cursor,savedAt:Date.now()};
    this.cacheWrites=this.cacheWrites.then(()=>this.cache!.write(scope,value)).catch(()=>{});
  }
  async flushCache(){await this.cacheWrites;}
  async refresh(){
    const current=this.session,familyId=current?.familyId;if(!current||!familyId)return;
    if(this.refreshWork?.session===current&&this.refreshWork.familyId===familyId)return this.refreshWork.promise;
    const promise=this.readLatest(current,familyId);
    const work={session:current,familyId,promise};this.refreshWork=work;
    try{await promise;}finally{if(this.refreshWork===work)this.refreshWork=undefined;}
  }
  private async readLatest(current:Session,familyId:string){
    const valid=()=>current===this.session&&familyId===this.session.familyId;
    let latest:any,nextRecords:WireRecord[],cursor=this.session?.role==='child'?undefined:this.cursor;
    if(cursor!==undefined){
      const merged=new Map(this.records.map(r=>[keyOf(r),r]));let until:number|undefined;
      try{
        do{
          latest=await this.request(`/sync/changes?familyId=${encodeURIComponent(familyId)}&cursor=${cursor}${until===undefined?'':`&until=${until}`}`);
          if(!valid())return;this.checkIdentity(latest);
          for(const group of latest.groups)for(const record of group.records){if(record.deleted)merged.delete(keyOf(record));else merged.set(keyOf(record),record);}
          cursor=latest.cursor;until=latest.until;
        }while(latest.hasMore);
        nextRecords=[...merged.values()];
      }catch(e){if(!(e instanceof SyncError)||e.code!=='CURSOR_EXPIRED')throw e;cursor=undefined;}
    }
    if(cursor===undefined){
      latest=await this.request(`/sync/snapshot?familyId=${encodeURIComponent(familyId)}`);
      if(!valid())return;this.checkIdentity(latest);nextRecords=latest.records;cursor=latest.cursor;
    }
    if(!valid())return;
    this.records=nextRecords!;this.cursor=cursor;this.clockOffset=Date.parse(latest.serverTime)-Date.now();this.stale=false;
    if(!this.children().some(r=>r.id===current.childId))current.childId=this.children()[0]?.id;
    this.saveSession();this.persistCache();
    const images=this.loadImages(current,familyId,this.records);
    if(this.backgroundImages){void images.catch(()=>{});}else{await images;}
  }
  private imageRefs(records:WireRecord[]){
    return [...new Set(records.filter(r=>['profiles','rewards'].includes(r.kind)).flatMap(row=>['avatarData','imageData'].map(field=>row.fields[field])).filter((ref):ref is string=>typeof ref==='string'&&ref.startsWith('asset:')))];
  }
  private async loadImages(current:Session,familyId:string,records:WireRecord[]){
    const refs=this.imageRefs(records).filter(ref=>!this.assets.has(ref));
    const scope=this.cacheScope();
    let index=0;
    const worker=async()=>{
      while(index<refs.length){
        const ref=refs[index++],jobKey=`${current.serverId}:${familyId}:${ref}`;
        if(current!==this.session||familyId!==this.session.familyId)return;
        let job=this.imageJobs.get(jobKey);
        if(!job){
          job=(async()=>{
            const cached=await this.cache?.image(scope,ref).catch(()=>undefined);
            if(cached){if(current===this.session&&familyId===this.session.familyId){this.assets.set(ref,cached);this.onImagesChanged?.();}return;}
            const asset=await this.request(`/assets/${ref.slice(6)}?familyId=${encodeURIComponent(familyId)}`);
            if(hashBase64(asset.base64)!==ref.slice(6))throw new SyncError('图片校验失败');
            if(current!==this.session||familyId!==this.session.familyId)return;
            const value=`data:${asset.mime};base64,${asset.base64}`;
            if(this.cache)await this.cache.saveImage(scope,ref,value).catch(()=>{});
            if(current!==this.session||familyId!==this.session.familyId)return;
            this.assets.set(ref,value);this.onImagesChanged?.();
          })().finally(()=>this.imageJobs.delete(jobKey));
          this.imageJobs.set(jobKey,job);
        }
        try{await job;}catch(e){if(!this.backgroundImages)throw e;}
      }
    };
    await Promise.all(Array.from({length:Math.min(4,refs.length)},worker));
  }

  scope(){const s=this.session;return s?`${s.serverId}:${s.userId}:${s.familyId??''}`:'';}
  pending(){
    const prefix=`hh-web-pending:${this.scope()}:`;const entries:{key:string;command:any}[]=[];
    for(let i=0;i<this.storage.length;i++){const key=this.storage.key(i)!;if(key.startsWith(prefix)){try{entries.push({key,command:JSON.parse(this.storage.getItem(key)!)});}catch{throw new SyncError('待确认操作无法读取，请保留浏览器数据。','CORRUPT');}}}
    return entries;
  }
  async commit(changes:any[]){
    if(!this.session?.familyId)throw new SyncError('请先选择家庭');
    if(this.stale)throw new SyncError('当前显示本机缓存，请联网核对后再保存');
    if(this.pending().length)throw new SyncError('上次操作尚未确认，请先点击“核对并刷新”。','PENDING');
    if(!changes.length)return;
    const s=this.session,id=safeId();
    const spending=changes.some(c=>c.action==='create'&&c.record.kind==='transactions'&&(c.record.fields.type==='spend'||c.record.fields.type==='adjust'&&c.record.fields.amount<0));
    const command={protocolVersion:1,serverId:s.serverId,datasetEpoch:s.datasetEpoch,familyId:s.familyId,operationId:id,clientStreamId:safeId(),clientSeq:1,changes,...(spending?{validUntil:new Date(Date.now()+this.clockOffset+120000).toISOString()}:{})};
    this.storage.setItem(`hh-web-pending:${this.scope()}:${id}`,JSON.stringify(command));
    await this.reconcile();
  }
  async reconcile(){
    if(!this.session?.familyId)return;
    const session=this.session,info=await this.request('/info');this.checkIdentity(info);
    let rejected:SyncError|undefined;
    for(const {key,command}of this.pending()){
      if(command.datasetEpoch!==session.datasetEpoch)throw new SyncError('待确认操作属于服务器恢复前的资料，请核对后处理。','SERVER_CHANGED');
      let receipt:any;
      if(command.transport==='child'){try{receipt=await this.request('/child/actions',command);}catch(e){if(!(e instanceof SyncError)||!['EXPIRED','PRICE_CHANGED','ALREADY_REQUESTED','NOT_FOUND','INVALID_AMOUNT','INVALID_ACTION'].includes(e.code))throw e;receipt={status:'rejected',code:e.code,message:e.message};}}
      else try{receipt=await this.request(`/operations/${command.operationId}?familyId=${encodeURIComponent(session.familyId!)}`);}
      catch(error){if(!(error instanceof SyncError)||error.code!=='NOT_FOUND')throw error;receipt=await this.request('/operations',command);}
      // Fetch authoritative data before forgetting a successful command. If
      // refresh fails, the same command remains recoverable after a reload.
      await this.refresh();
      this.storage.removeItem(key);
      if(receipt.status!=='applied'){
        this.storage.setItem(`hh-web-rejected:${this.scope()}:${command.operationId}`,JSON.stringify({command,receipt}));
        rejected=new SyncError(receipt.message??'修改未生效，请重新检查',receipt.code);
      }
    }
    if(rejected)throw rejected;
    await this.refresh();
  }
  async loginChild(code:string){
    if(this.pending().length)throw new SyncError('请先处理待确认操作','PENDING');
    if(this.session)await this.logout();
    const auth=await this.request('/auth/child',{code},'');this.session=auth;this.saveSession();this.stale=true;await this.resume();
  }
  async childAction(action:'task'|'redeem',id:string){
    if(!this.session||this.stale||this.pending().length)throw new SyncError('请先联网核对待确认操作','PENDING');
    const requestId=safeId(),s=this.session;
    const expectedCost=action==='redeem'?this.record('rewards',id)?.fields.cost:undefined;
    const command={transport:'child',action,id,expectedCost,requestId,operationId:requestId,serverId:s.serverId,datasetEpoch:s.datasetEpoch,validUntil:new Date(Date.now()+this.clockOffset+120000).toISOString()};
    this.storage.setItem(`hh-web-pending:${this.scope()}:${requestId}`,JSON.stringify(command));await this.reconcile();
  }
  async recoveryBundle(){
    const s=this.session;if(!s)throw new SyncError('请先登录');
    const entries=this.pending();let current:any=null;
    try{current=await this.request('/info',undefined,'');}catch{}
    const receipts=[];
    for(const entry of entries){let status:any={status:'unknown'};
      if(s.role!=='child'&&current?.serverId===s.serverId){try{status=await this.request(`/operations/${entry.command.operationId}?familyId=${encodeURIComponent(s.familyId!)}`);}catch(e){status={status:e instanceof SyncError&&e.code==='NOT_FOUND'?'not-in-restored-database':'unknown'};}}
      receipts.push({operationId:entry.command.operationId,...status});
    }
    return {format:'habit-hero-recovery-v1',createdAt:new Date().toISOString(),scope:this.scope(),identity:{serverId:s.serverId,datasetEpoch:s.datasetEpoch,userId:s.userId,familyId:s.familyId},current,entries,receipts,records:copy(this.records)};
  }
  async archiveAndDisconnect(bundle:any){
    if(bundle?.format!=='habit-hero-recovery-v1'||bundle.scope!==this.scope()||!equal(bundle.entries,this.pending()))throw new SyncError('待确认内容已变化，请重新导出');
    const key=`hh-web-archive:${this.scope()}:${safeId()}`,json=JSON.stringify(bundle);
    this.storage.setItem(key,json);if(this.storage.getItem(key)!==json)throw new SyncError('归档未保存，未清除任何操作');
    // Persist a copy before disconnecting. Never replay old spending into a new epoch.
    for(const entry of bundle.entries)this.storage.removeItem(entry.key);
    try{await this.request('/auth/logout',{});}catch{}
    this.session=null;this.records=[];this.cursor=undefined;this.assets.clear();this.recoveryRequired=false;this.stale=true;this.credentials.removeItem(sessionKey);this.legacyCredentials?.removeItem(sessionKey);
  }
  async installStarter(){
    if(!this.session?.childId)throw new SyncError('请先选择孩子');
    const changes:any[]=[];
    for(const [kind,items]of [['habits',[{name:'阅读 15 分钟',points:5,emoji:'📚'},{name:'整理玩具',points:3,emoji:'🧸'}]],['rewards',[{name:'亲子桌游时间',cost:20,emoji:'🎲'},{name:'选择周末活动',cost:50,emoji:'🌈'}]]] as const){
      for(const fields of items)if(!this.records.some(r=>r.childId===this.session!.childId&&r.kind===kind&&r.fields.name===fields.name))changes.push({action:'create',record:{kind,id:safeId(),childId:this.session!.childId,fields}});
    }
    await this.commit(changes);
  }
  record(kind:string,id:string){return this.records.find(r=>r.kind===kind&&r.id===id&&r.childId===this.session?.childId);}
  patch(row:WireRecord,set:Record<string,any>){return {action:'patch',key:keyOf(row),baseVersion:row.version??0,before:Object.fromEntries(Object.keys(set).map(k=>[k,row.fields[k]??null])),set};}
  remove(row:WireRecord){return {action:'delete',key:keyOf(row),baseVersion:row.version??0,before:copy(row.fields)};}
  tx(transaction:Transaction){return {action:'create',record:{kind:'transactions',id:transaction.id,childId:this.session!.childId,fields:{type:transaction.type,amount:transaction.amount,title:transaction.description,date:transaction.date,externalId:null}}};}
  view(childId=this.session?.childId):AppData|null{
    const profile=this.children().find(r=>r.id===childId);if(!profile)return null;
    const rows=(kind:string)=>this.records.filter(r=>r.kind===kind&&r.childId===profile.id&&!r.deleted);
    const image=(v:any)=>typeof v==='string'?(this.assets.get(v)??(v.startsWith('data:image/')?v:undefined)):undefined;
    return {childName:profile.fields.name,totalPoints:profile.fields.totalPoints,parentPin:this.storage.getItem(`hh-web-pin:${this.scope()}`)??'0000',avatar:image(profile.fields.avatarData),
      habits:rows('habits').map(r=>({id:r.id,name:r.fields.name,points:r.fields.points,emoji:r.fields.emoji})),
      rewards:rows('rewards').map(r=>({id:r.id,name:r.fields.name,cost:r.fields.cost,emoji:r.fields.emoji,image:image(r.fields.imageData)})),
      transactions:rows('transactions').map(r=>({id:r.id,type:r.fields.type,amount:r.fields.amount,description:r.fields.title,date:r.fields.date})).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)),
      pendingTasks:rows('pendingTasks').map(r=>({id:r.id,habitId:r.fields.habitId??rows('habits').find(h=>h.fields.name===r.fields.habitName)?.id??'',habitName:r.fields.habitName,points:r.fields.points,emoji:r.fields.emoji,timestamp:r.fields.timestamp})),
      deductions:rows('quickActions').filter(r=>['deduct','spend'].includes(r.fields.type)).map(r=>({id:r.id,name:r.fields.name,points:r.fields.points,emoji:r.fields.emoji}))};
  }
  async uploadImage(value:string|null|undefined){
    if(!value)return null;
    if(value.startsWith('asset:'))return value;
    const match=/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value);
    if(!match)throw new SyncError('请选择 PNG、JPEG、WebP 或 GIF 图片');
    const hash=hashBase64(match[2]);await this.request('/assets',{familyId:this.session!.familyId,hash,mime:match[1],base64:match[2]});return `asset:${hash}`;
  }
  async saveView(before:AppData,next:AppData){
    if(!/^\d{4}$/.test(next.parentPin))throw new SyncError('本浏览器家长密码须为 4 位数字');
    if(!next.childName.trim()||next.childName.trim().length>60)throw new SyncError('孩子名字须为 1 至 60 字');
    const childId=this.session!.childId!,profile=this.record('profiles',childId)!;const changes:any[]=[];
    const set:Record<string,any>={};
    if(before.childName!==next.childName)set.name=next.childName.trim();
    if(before.avatar!==next.avatar)set.avatarData=await this.uploadImage(next.avatar);
    if(Object.keys(set).length)changes.push(this.patch(profile,set));
    for(const [field,kind]of [['habits','habits'],['rewards','rewards'],['pendingTasks','pendingTasks'],['deductions','quickActions']] as const){
      const a=before[field],b=next[field];
      for(const row of a)if(!b.some(r=>r.id===row.id)){const old=this.record(kind,row.id);if(!old)throw new SyncError('资料已变化，请刷新后再操作');changes.push(this.remove(old));}
      for(const row of b){
        const previous=a.find(r=>r.id===row.id);if(equal(previous,row))continue;
        const amount='cost' in row?row.cost:row.points;
        if(!Number.isSafeInteger(amount)||amount<0||amount>1000000)throw new SyncError('积分须为 0 至 1000000 的整数');
        const name='habitName' in row?row.habitName:row.name;
        if(!name?.trim()||name.length>500)throw new SyncError('名称须为 1 至 500 字');
        const fields:Record<string,any>={...row};delete fields.id;
        if(kind==='rewards'){fields.imageData=await this.uploadImage(fields.image);delete fields.image;}
        if(kind==='quickActions'){fields.type='deduct';fields.category='扣分';}
        if(previous){
          const old=this.record(kind,row.id)!;const changed:Record<string,any>={};
          for(const [k,v]of Object.entries(fields)){
            // Diff only user-edited view fields. Extra mobile fields survive.
            const viewKey=k==='imageData'?'image':k;
            if(['type','category'].includes(k)&&kind==='quickActions')continue;
            if(!equal((previous as any)[viewKey],(row as any)[viewKey]))changed[k]=v??null;
          }
          if(Object.keys(changed).length)changes.push(this.patch(old,changed));
        }else changes.push({action:'create',record:{kind,id:row.id,childId,fields:{...fields,createdAt:new Date().toISOString()}}});
      }
    }
    // A new transaction and its related task removal are one atomic command.
    if(before.transactions.some(r=>!next.transactions.some(n=>n.id===r.id&&equal(n,r))))throw new SyncError('已确认流水不能覆盖或删除，请新增更正记录');
    for(const row of next.transactions)if(!before.transactions.some(r=>r.id===row.id))changes.push(this.tx(row));
    await this.commit(changes);
    if(next.parentPin!==before.parentPin)this.storage.setItem(`hh-web-pin:${this.scope()}`,next.parentPin);
  }
  async exportFamily(){
    await this.reconcile();const assets:Record<string,any>={};
    for(const row of this.records)for(const [field,value]of Object.entries(row.fields))if(media.has(field)&&typeof value==='string'&&value.startsWith('asset:')&&!assets[value]){
      const asset=await this.request(`/assets/${value.slice(6)}?familyId=${encodeURIComponent(this.session!.familyId!)}`);
      if(hashBase64(asset.base64)!==value.slice(6))throw new SyncError('导出图片校验失败');assets[value]={mime:asset.mime,base64:asset.base64};
    }
    return {format:'habit-hero-family-v1',sourceId:`${this.session!.serverId}:${this.session!.familyId}`,exportedAt:new Date().toISOString(),records:copy(this.records),assets};
  }
  async previewImport(draft:ImportDraft){
    if(this.pending().length)throw new SyncError('请先确认待处理操作');
    for(const [ref,asset]of Object.entries(draft.assets)){if(hashBase64(asset.base64)!==ref.slice(6))throw new SyncError('备份图片校验失败');await this.request('/assets',{familyId:this.session!.familyId,hash:ref.slice(6),...asset});}
    return this.request('/migrations/preview',{...draft,assets:undefined,familyId:this.session!.familyId});
  }
  async commitImport(preview:any){await this.request('/migrations/commit',{familyId:this.session!.familyId,id:preview.id,previewHash:preview.previewHash});await this.refresh();}
}

export function parseImport(text:string):ImportDraft{
  const raw=JSON.parse(text),assets:ImportDraft['assets']={};let records:WireRecord[],sourceId:string;
  const asset=(value:any)=>{if(!value)return null;const m=/^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(value);if(!m)throw new SyncError('旧备份中的图片不是内嵌图片，请先在原应用中重新导出。');const ref='asset:'+hashBase64(m[2]);assets[ref]={mime:m[1],base64:m[2]};return ref;};
  if(raw.format==='habit-hero-family-v1'&&Array.isArray(raw.records)&&typeof raw.sourceId==='string'){
    records=raw.records;sourceId=raw.sourceId;Object.assign(assets,raw.assets??{});
  }else{
    if(typeof raw.childName!=='string'||!Number.isSafeInteger(raw.totalPoints)||!Array.isArray(raw.transactions))throw new SyncError('不是受支持的家庭备份或旧 H5 备份');
    sourceId='legacy-h5:'+hashBase64(btoa(unescape(encodeURIComponent(text))));
    const childId='legacy-child';records=[{kind:'profiles',id:childId,childId,fields:{name:raw.childName,totalPoints:raw.totalPoints,avatarData:asset(raw.avatar)}}];
    for(const [field,kind]of [['habits','habits'],['rewards','rewards'],['pendingTasks','pendingTasks'],['deductions','quickActions'],['transactions','transactions']]){
      if(raw[field]!=null&&!Array.isArray(raw[field]))throw new SyncError('备份列表格式无效');
      for(const original of raw[field]??[]){const r={...original},id=String(r.id);delete r.id;if(!original.id)throw new SyncError('备份记录缺少标识');
        if(kind==='transactions'){r.title=r.description;delete r.description;}
        if(kind==='rewards'){r.imageData=asset(r.image);delete r.image;}
        if(kind==='quickActions'){r.type='deduct';r.category='扣分';}
        records.push({kind,id,childId,fields:r});
      }
    }
  }
  if(records.length>30000)throw new SyncError('单次导入最多 30000 条记录');
  return {importId:safeId(),sourceId,records,assets,mappings:{},balances:{},decisions:{}};
}
