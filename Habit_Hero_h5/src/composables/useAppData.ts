import { ref, shallowRef, computed } from 'vue';
import type { AppData, Habit, Reward, Transaction, PendingTask, Deduction } from '../../types';
import { syncClient } from '../../services/storageService';
import { SyncError } from '../../services/syncClient';
import { safeId } from '../../services/id';

const data=ref<AppData|null>(null),loading=ref(true),busy=ref(false),error=ref(''),expired=ref(false),managing=ref(false),pending=ref(0);
const cached=ref(false),recovery=ref(false);
const session=shallowRef(syncClient.session),children=shallowRef(syncClient.children());
const childCards=computed(()=>children.value.map(child=>{
  const view=syncClient.view(child.id)!;
  return {id:child.id,name:view.childName,avatar:view.avatar,points:view.totalPoints,pending:view.pendingTasks.length};
}));
let polling:Promise<void>|null=null;
let initialization:Promise<void>|null=null;
export function publishSync(){recovery.value=syncClient.recoveryRequired;cached.value=syncClient.stale&&!!syncClient.records.length;session.value=syncClient.session?{...syncClient.session}:null;children.value=syncClient.children();data.value=syncClient.view();pending.value=syncClient.pending().length;}
syncClient.onImagesChanged=publishSync;
syncClient.onBackgroundError=syncFailure;
export function syncFailure(e:unknown){recovery.value=syncClient.recoveryRequired;error.value=e instanceof Error?e.message:'操作失败，请重试';if(e instanceof SyncError&&e.code==='UNAUTHORIZED')expired.value=true;}
export async function syncAction<T>(fn:()=>Promise<T>):Promise<T>{
  if(busy.value)throw new Error('正在处理，请稍后再试');busy.value=true;error.value='';const previousToken=syncClient.session?.token;
  try{if(polling)await polling;const result=await fn();if(!syncClient.session||syncClient.session.token!==previousToken)expired.value=false;return result;}catch(e){syncFailure(e);throw e;}finally{publishSync();busy.value=false;loading.value=false;}
}
export async function refreshSync(){return syncAction(()=>syncClient.reconcile());}
export async function pollSync(){
  if(busy.value||polling||expired.value||!syncClient.session?.familyId||document.hidden)return;
  polling=(async()=>{try{await syncClient.refresh();publishSync();}catch(e){syncFailure(e);}})();
  try{await polling;}finally{polling=null;}
}
// Selecting already loaded data is synchronous and safe during a snapshot read.
// A write or an unconfirmed command still blocks selection to preserve ownership.
export function selectLoadedChild(id:string){
  if(id===syncClient.session?.childId)return;
  if(busy.value)throw new Error('正在保存，请完成后再切换小朋友');
  syncClient.selectChild(id);publishSync();
}
export function initializeSync(){
  return initialization??=(async()=>{
    if(await syncClient.restoreCachedFamily()){
      publishSync();loading.value=false;
      polling=(async()=>{try{await syncClient.resume();}catch(e){syncFailure(e);}finally{publishSync();}})();
      void polling.finally(()=>{polling=null;});
    }else{try{await syncAction(()=>syncClient.resume());}catch{}}
  })();
}

export function useSync(){return {session,children,childCards,cached,loading,busy,error,expired,managing,pending,recovery,refresh:refreshSync,action:syncAction,client:syncClient};}

export function useAppData(){
  const init=initializeSync;
  const updateData=async(updater:(prev:AppData)=>AppData)=>syncAction(async()=>{
    if(!data.value)throw new Error('请先选择孩子');
    const before=JSON.parse(JSON.stringify(data.value)) as AppData,next=updater(JSON.parse(JSON.stringify(before)));
    await syncClient.saveView(before,next);
  });
  const sameDay=(a:Date,b:Date)=>a.toLocaleDateString()===b.toLocaleDateString();
  const completedHabitsToday=computed(()=>{
    const ids=new Set<string>(),today=new Date();if(!data.value)return ids;
    for(const t of data.value.pendingTasks)if(sameDay(new Date(t.timestamp),today))ids.add(t.habitId);
    for(const t of data.value.transactions)if(t.type==='earn'&&sameDay(new Date(t.date),today)){
      const h=data.value.habits.find(h=>h.name===t.description);if(h)ids.add(h.id);
    }
    return ids;
  });
  const handleRequestTask=async(habit:Habit)=>syncClient.session?.role==='child'?syncAction(()=>syncClient.childAction('task',habit.id)):updateData(prev=>({...prev,pendingTasks:[...prev.pendingTasks,{id:safeId(),habitId:habit.id,habitName:habit.name,points:habit.points,emoji:habit.emoji,timestamp:new Date().toISOString()}]}));
  const transaction=(type:Transaction['type'],amount:number,description:string):Transaction=>({id:safeId(),type,amount,description,date:new Date().toISOString()});
  const handleApproveTask=async(task:PendingTask)=>updateData(prev=>{
    if(!prev.pendingTasks.some(t=>t.id===task.id))throw new Error('该任务已被处理');
    return {...prev,transactions:[transaction('earn',task.points,task.habitName),...prev.transactions],pendingTasks:prev.pendingTasks.filter(t=>t.id!==task.id)};
  });
  const handleRejectTask=async(id:string)=>updateData(prev=>({...prev,pendingTasks:prev.pendingTasks.filter(t=>t.id!==id)}));
  const handleSpend=async(reward:Reward)=>syncClient.session?.role==='child'?syncAction(()=>syncClient.childAction('redeem',reward.id)):updateData(prev=>({...prev,transactions:[transaction('spend',reward.cost,reward.name),...prev.transactions]}));
  const handleQuickDeduct=async(d:Deduction)=>updateData(prev=>({...prev,transactions:[transaction('spend',d.points,d.name),...prev.transactions]}));
  const addHabit=async(h:Habit)=>updateData(p=>({...p,habits:[...p.habits,h]}));
  const removeHabit=async(id:string)=>updateData(p=>({...p,habits:p.habits.filter(h=>h.id!==id)}));
  const updateHabit=async(id:string,h:Partial<Habit>)=>updateData(p=>({...p,habits:p.habits.map(old=>old.id===id?{...old,...h}:old)}));
  const addReward=async(r:Reward)=>updateData(p=>({...p,rewards:[...p.rewards,r]}));
  const removeReward=async(id:string)=>updateData(p=>({...p,rewards:p.rewards.filter(r=>r.id!==id)}));
  const updateReward=async(id:string,r:Partial<Reward>)=>updateData(p=>({...p,rewards:p.rewards.map(old=>old.id===id?{...old,...r}:old)}));
  const addDeduction=async(d:Deduction)=>updateData(p=>({...p,deductions:[...p.deductions,d]}));
  const removeDeduction=async(id:string)=>updateData(p=>({...p,deductions:p.deductions.filter(d=>d.id!==id)}));
  const updateDeduction=async(id:string,d:Partial<Deduction>)=>updateData(p=>({...p,deductions:p.deductions.map(old=>old.id===id?{...old,...d}:old)}));
  return {data,loading,init,updateData,isTaskCompletedToday:(id:string)=>completedHabitsToday.value.has(id),handleRequestTask,handleApproveTask,handleRejectTask,handleSpend,handleQuickDeduct,addHabit,removeHabit,updateHabit,addReward,removeReward,updateReward,addDeduction,removeDeduction,updateDeduction};
}
