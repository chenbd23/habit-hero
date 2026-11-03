<template>
 <section class="bg-white p-6 rounded-[2rem] border-[3px] border-black space-y-4">
  <h3 class="font-black text-xl">账户、儿童设备与家庭成员</h3>
  <p>家长账户具有完整管理权限。儿童设备只能查看自己的资料、提交任务和按设定价格兑换奖励，不能发放积分。</p>
  <details class="space-y-3"><summary class="font-bold cursor-pointer">启用儿童设备</summary>
   <p>设备码 10 分钟内可使用一次。请只交给孩子；会话有效期 30 天，可随时撤销。</p>
   <input v-model="deviceName" aria-label="儿童设备名称" placeholder="设备名称" class="connection-input" maxlength="60" />
   <Button :disabled="busy" @click="issue">为当前孩子生成设备码</Button>
   <p v-if="code" class="break-all select-all">{{ code }}</p>
   <p v-if="code">在另一浏览器选择“儿童设备登录”输入设备码。也可切换本浏览器，家长登录会被撤销，返回管理需重新输入账户密码。</p>
   <Button v-if="code" :disabled="busy || pending>0" @click="switchChild">将本浏览器切换为儿童设备</Button>
   <Button variant="secondary" @click="load">刷新设备与成员</Button>
   <div v-for="d in devices" :key="d.id" class="flex gap-3 items-center"><span>{{ d.name }}</span><Button variant="danger" @click="revokeDevice(d.id)">撤销设备</Button></div>
  </details>
  <details class="space-y-3"><summary class="font-bold cursor-pointer" @click="load">家庭成员</summary>
   <p>移除成员会立即停止其家庭访问并撤销其儿童设备；既有流水保留，最后一位管理员不能移除。</p>
   <div v-for="m in members" :key="m.id" class="flex gap-3 items-center"><span>{{ m.username }} · {{ m.role }}</span><Button v-if="m.id!==session?.userId" variant="danger" @click="remove(m)">移除成员</Button></div>
   <p v-if="usage">已用 {{ (usage.bytes/1048576).toFixed(1) }} / {{ (usage.limit/1048576).toFixed(0) }} MiB（含历史与附件）</p>
  </details>
  <details class="space-y-3"><summary class="font-bold cursor-pointer">修改密码或撤销会话</summary>
   <p>修改密码或撤销会话会退出此账户的全部家长和儿童设备。忘记密码请联系部署者，使用服务器账户工具重置。</p>
   <label class="block">当前密码<input v-model="currentPassword" type="password" autocomplete="current-password" class="connection-input" /></label>
   <label class="block">新密码（至少 10 位）<input v-model="newPassword" type="password" autocomplete="new-password" class="connection-input" /></label>
   <Button :disabled="busy || pending>0 || newPassword.length<10 || !currentPassword" @click="passwordChange">修改密码并退出全部设备</Button>
   <Button variant="danger" :disabled="busy || pending>0 || !currentPassword" @click="revokeAll">撤销此账户全部会话</Button>
  </details>
  <p v-if="message" role="status" class="text-green-700 font-bold">{{ message }}</p>
  <Button variant="secondary" :disabled="busy || pending>0" @click="signOut">退出家长账户</Button>
  <Button variant="secondary" :disabled="busy" @click="addStarter">添加示例任务与奖励（不重复添加）</Button>
 </section>
</template>
<script setup lang="ts">
import {ref} from 'vue';
import {useRouter} from 'vue-router';
import {useSync} from '../../composables/useAppData';
import {useAuth} from '../../composables/useAuth';
import Button from '../ui/Button.vue';
const {client,session,action,busy,pending,managing}=useSync(),router=useRouter(),{clearAuth}=useAuth();
const message=ref('');
const deviceName=ref('孩子设备'),code=ref(''),devices=ref<any[]>([]),members=ref<any[]>([]),usage=ref<any>(null),currentPassword=ref(''),newPassword=ref('');
const addStarter=()=>action(async()=>{await client.installStarter();message.value='示例已添加，可以在任务与奖励页面查看和修改。';});
const signOut=()=>action(async()=>{await client.logout();clearAuth();await router.push('/');});
const family=()=>({familyId:client.session!.familyId});
const load=()=>action(async()=>{const f=encodeURIComponent(client.session!.familyId!);devices.value=(await client.request('/child-devices?familyId='+f)).devices;members.value=(await client.request('/members?familyId='+f)).members;usage.value=await client.request('/usage?familyId='+f);});
const issue=()=>action(async()=>{code.value=(await client.request('/child-devices',{...family(),childId:client.session!.childId,name:deviceName.value})).code;});
const switchChild=()=>action(async()=>{const value=code.value;await client.loginChild(value);code.value='';clearAuth();managing.value=false;await router.push('/');});
const revokeDevice=(id:string)=>action(async()=>{await client.request('/child-devices/revoke',{...family(),id});devices.value=devices.value.filter(x=>x.id!==id);});
const remove=(m:any)=>{if(window.confirm(`确认移除 ${m.username}？其家庭访问将立即停止。`))void action(async()=>{await client.request('/members/remove',{...family(),userId:m.id});members.value=members.value.filter(x=>x.id!==m.id);});};
const end=async()=>{const bundle=await client.recoveryBundle();await client.archiveAndDisconnect(bundle);currentPassword.value='';newPassword.value='';clearAuth();managing.value=false;await router.push('/');};
const passwordChange=()=>action(async()=>{await client.request('/auth/password',{currentPassword:currentPassword.value,newPassword:newPassword.value});await end();});
const revokeAll=()=>{if(window.confirm('确认退出此账户的全部家长和儿童设备？'))void action(async()=>{await client.request('/auth/revoke',{currentPassword:currentPassword.value});await end();});};
</script>
