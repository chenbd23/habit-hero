<template>
  <main v-if="loading || !ready || managing || recovery" class="min-h-screen grid place-items-center p-5">
    <section class="bg-white border-[3px] border-black rounded-[2rem] shadow-cartoon w-full max-w-lg p-6 space-y-5">
      <h1 class="text-2xl font-black">习惯小英雄 · 家庭同步</h1>
      <p v-if="loading">正在读取家庭资料…</p>
      <template v-else-if="(!session || expired) && !recovery">
        <p class="text-slate-500">请用部署者创建的账户登录，或通过家人的邀请码注册。</p>
        <p v-if="expired" class="text-orange-700">登录已过期，请用原账户重新登录，待确认操作会保留。</p>
        <form class="space-y-4" @submit.prevent="login">
          <label class="block font-bold">用户名<input v-model="username" name="username" autocomplete="username" required minlength="3" class="connection-input" /></label>
          <label class="block font-bold">密码<input v-model="password" name="password" :autocomplete="register?'new-password':'current-password'" required minlength="10" type="password" class="connection-input" /></label>
          <label v-if="!expired" class="flex gap-2"><input v-model="register" type="checkbox" />注册新账户（需家人邀请码，或部署者已开放注册）</label>
          <label v-if="register" class="block">家人邀请码<input v-model="registrationInvite" class="connection-input" autocomplete="off" /></label>
          <p class="text-sm text-slate-500">在此浏览器保持登录，退出账户后清除。</p>
          <Button type="submit" :disabled="busy" class="w-full">{{ register&&!expired?'注册并继续':'登录并继续' }}</Button>
        </form>
        <details><summary>儿童设备登录</summary><form @submit.prevent="run(async()=>{await client.loginChild(childCode);childCode='';})" class="space-y-3"><input v-model="childCode" aria-label="儿童设备码" placeholder="家长生成的儿童设备码" class="connection-input" required /><Button type="submit">连接儿童设备</Button></form></details>
      </template>
      <template v-else>
        <p class="font-bold">已登录：{{ session?.username }}</p>
        <p v-if="session?.role==='child'">当前为儿童设备，管理操作仅限家长账户。</p>
        <template v-if="session && session.role!=='child' && !recovery">
        <label class="block font-bold">家庭
          <select aria-label="家庭" class="connection-input" :value="session.familyId || ''" :disabled="busy || pending>0" @change="selectFamily">
            <option value="" disabled>请选择家庭</option><option v-for="family in session.families" :key="family.id" :value="family.id">{{ family.name }}</option>
          </select>
        </label>
        <p v-if="!session.families.length" class="text-slate-600">还没有家庭，可以创建新家庭，或用家人的邀请码加入。</p>
        <template v-if="session.familyId">
          <p v-if="children.length" class="text-slate-600">家庭里有 {{ children.length }} 位小朋友，首页会一起展示。</p>
          <p v-else class="text-slate-600">家庭还没有孩子资料，请先创建孩子；已有备份可在家长设置中导入。</p>
          <details class="border-t pt-3"><summary class="font-bold cursor-pointer">添加小朋友</summary>
            <form class="space-y-3 mt-3" @submit.prevent="run(async()=>{await client.createChild(childName);childName='';})"><input v-model="childName" aria-label="孩子姓名" placeholder="孩子姓名" required maxlength="60" class="connection-input" /><Button type="submit" :disabled="busy || !childName.trim()">创建孩子</Button></form>
          </details>
          <Button v-if="ready" class="w-full" :disabled="busy || pending>0" @click="finish">返回家庭首页</Button>
        </template>
        <details class="border-t pt-3"><summary class="font-bold cursor-pointer">创建或加入其他家庭</summary>
          <form class="space-y-3 my-3" @submit.prevent="run(async()=>{await client.createFamily(familyName);familyName='';})"><input v-model="familyName" aria-label="新家庭名称" placeholder="新家庭名称" required maxlength="60" class="connection-input" /><Button type="submit" variant="secondary" :disabled="busy || !familyName.trim()">创建家庭</Button></form>
          <form class="space-y-3" @submit.prevent="run(async()=>{await client.joinFamily(invite);invite='';})"><input v-model="invite" aria-label="家庭邀请码" placeholder="家人发来的家庭邀请码" required class="connection-input" /><Button type="submit" variant="secondary" :disabled="busy || !invite.trim()">加入家庭</Button></form>
        </details>
        </template>
        <Button v-if="ready && session?.role==='child'" @click="finish">返回孩子首页</Button>
        <div class="flex flex-wrap gap-2"><Button variant="secondary" :disabled="busy" @click="run(()=>client.reconcile())">核对并刷新</Button><Button variant="ghost" :disabled="busy || pending>0" @click="run(()=>client.logout())">退出账户</Button></div>
      </template>
      <RecoveryPanel v-if="session && (recovery || pending>0)" />
      <p v-if="pending" class="text-orange-700 font-bold">{{ pending }} 项操作待确认，核对前请勿清除浏览器数据。</p>
      <p v-if="error" role="alert" class="text-red-700 whitespace-pre-wrap break-words">{{ error }}</p>
    </section>
  </main>
  <template v-else>
    <slot />
    <div v-if="error || pending || cached" class="fixed left-3 right-3 bottom-24 z-40 rounded-2xl bg-orange-50 border-2 border-black p-3 shadow-cartoon text-sm" role="alert">
      <p>{{ error || (cached ? '显示本机缓存，正在后台核对最新资料；核对完成后可保存操作。' : '上次操作结果待确认，联网后核对即可。') }}</p>
      <button class="font-black underline mr-4" @click="managing=true">恢复与账户</button>
      <button class="font-black underline mt-1" :disabled="busy" @click="run(()=>client.reconcile())">核对并刷新</button>
    </div>
  </template>
  <div v-if="busy && !loading" class="fixed inset-0 z-[100] bg-white/60 grid place-items-center" aria-live="polite"><span class="bg-white p-5 rounded-2xl border-2 border-black font-bold">{{ selectingFamily ? '正在读取家庭资料…' : '正在确认…' }}</span></div>
</template>

<script setup lang="ts">
import {ref,computed,onMounted,onUnmounted,watch} from 'vue';
import {useRouter,useRoute} from 'vue-router';
import {useSync,useAppData,pollSync,initializeSync} from '../composables/useAppData';
import {useAuth} from '../composables/useAuth';
import Button from './ui/Button.vue';
import RecoveryPanel from './RecoveryPanel.vue';
const {session,children,cached,loading,busy,error,expired,managing,pending,recovery,action,client}=useSync();
const {data}=useAppData();const router=useRouter();const route=useRoute();const {clearAuth}=useAuth();
const username=ref(session.value?.username??''),password=ref(''),register=ref(false),familyName=ref(''),childName=ref(''),invite=ref('');
const selectingFamily=ref(false),childCode=ref(''),registrationInvite=ref('');
const ready=computed(()=>!!session.value?.familyId&&!!data.value&&!expired.value&&(!route.params.childId||(route.params.childId===session.value.childId&&route.params.familyId===session.value.familyId)));
const run=async(fn:()=>Promise<unknown>)=>{try{await action(fn);}catch{}};
const revisit=()=>router.replace({path:route.path,query:route.query,hash:route.hash,force:true});
const login=async()=>{await run(async()=>{await client.login(username.value,password.value,register.value&&!expired.value,registrationInvite.value);password.value='';clearAuth();});await revisit();};
const selectFamily=async(event:Event)=>{const id=(event.target as HTMLSelectElement).value;selectingFamily.value=true;try{await run(async()=>{clearAuth();await client.selectFamily(id);});await revisit();}finally{selectingFamily.value=false;}};
watch(managing,value=>{if(value)void router.replace('/');});
const finish=()=>{managing.value=false;clearAuth();router.push('/');};
let timer:ReturnType<typeof setInterval>;
onMounted(async()=>{await initializeSync();timer=setInterval(()=>{void pollSync();},15000);window.addEventListener('online',pollSync);window.addEventListener('focus',pollSync);});
onUnmounted(()=>{clearInterval(timer);window.removeEventListener('online',pollSync);window.removeEventListener('focus',pollSync);});
</script>

<style>
.connection-input {display:block;width:100%;margin-top:.4rem;border:2px solid #cbd5e1;border-radius:1rem;padding:.8rem;background:white;font-weight:600;}
.connection-input:focus {outline:2px solid #8b5cf6;outline-offset:2px;}
</style>
