import { createRouter, createWebHistory } from 'vue-router';
import Landing from '../views/Landing.vue';
import KidDashboard from '../views/KidDashboard.vue';
import ParentDashboard from '../views/ParentDashboard.vue';
import DeductionsSettings from '../views/DeductionsSettings.vue';
import { useAuth } from '../composables/useAuth';
import { initializeSync, selectLoadedChild, syncAction, syncFailure, useSync } from '../composables/useAppData';
import { childLink } from '../composables/childLinks';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {path:'/kid',name:'kid-legacy',component:KidDashboard},
    {path:'/parent',name:'parent-legacy',component:ParentDashboard,meta:{requiresAuth:true}},
    {
      path: '/',
      name: 'landing',
      component: Landing,
    },
    {
      path: '/kid/:familyId/:childId',
      name: 'kid',
      component: KidDashboard,

    },
    {
      path: '/parent/:familyId/:childId',
      name: 'parent',
      component: ParentDashboard,

      meta: { requiresAuth: true },
    },
    {
      path: '/deductions-settings',
      name: 'deductions-settings',
      component: DeductionsSettings,
      meta: { requiresAuth: true },
    },
  ],
});

router.beforeEach(async(to) => {
  await initializeSync();
  const {client,expired}=useSync();
  const {checkAuth,clearAuth}=useAuth();
  // SyncGate keeps the requested URL while login/family setup is on screen.
  if(!client.session||expired.value)return true;
  const familyId=typeof to.params.familyId==='string'?to.params.familyId:undefined;
  const childId=typeof to.params.childId==='string'?to.params.childId:undefined;
  try{
    if(familyId&&familyId!==client.session.familyId){
      clearAuth();
      await syncAction(()=>client.selectFamily(familyId));
    }
    if(childId)selectLoadedChild(childId);
  }catch(e){
    syncFailure(e);
    return {path:'/'};
  }
  const current=client.session;
  if(!current.familyId||!current.childId)return true;
  if(to.name==='kid-legacy'||to.name==='parent-legacy'){
    return {path:childLink(to.name==='kid-legacy'?'kid':'parent',current.familyId,current.childId),query:to.query,replace:true};
  }
  if(to.meta.requiresAuth&&current.role==='child')return {path:'/'};
  if(to.meta.requiresAuth&&!checkAuth()){
    return {name:'landing',query:{redirect:to.fullPath,requireAuth:'true'}};
  }
  return true;
});

export default router;

