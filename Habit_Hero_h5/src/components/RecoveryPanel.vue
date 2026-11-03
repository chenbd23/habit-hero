<template>
 <section class="border-2 border-orange-400 bg-orange-50 rounded-xl p-4 space-y-3">
  <h2 class="font-black">恢复旧浏览器</h2>
  <p>恢复数据库会撤销旧会话；无法查到回执时先按未知状态保存，不据此判断操作未执行。</p>
  <p>先下载待确认操作及本机记录，再归档并重新登录。旧操作不会自动重放，请对照恢复后的流水手动核定，避免重复扣分或奖励。</p>
  <Button :disabled="busy" @click="prepare">1. 下载恢复记录</Button>
  <template v-if="bundle">
   <p>包含 {{ bundle.entries.length }} 项待确认操作。文件含家庭资料，请妥善保存。</p>
   <ul><li v-for="r in bundle.receipts" :key="r.operationId">{{ r.operationId.slice(0,8) }}：{{ r.status==='applied'?'恢复库已有成功回执':r.status==='not-in-restored-database'?'恢复库未找到回执，不能认定从未执行':'需要人工核定' }}</li></ul>
   <label class="flex gap-2"><input v-model="confirmed" type="checkbox" />我已保存下载文件，确认归档旧操作并重新登录</label>
   <Button :disabled="!confirmed || busy" @click="disconnect">2. 归档并断开旧连接</Button>
  </template>
 </section>
</template>
<script setup lang="ts">
import {ref} from 'vue';
import {useSync} from '../composables/useAppData';
import Button from './ui/Button.vue';
const {client,action,busy,managing}=useSync(),bundle=ref<any>(null),confirmed=ref(false);
const prepare=()=>{managing.value=true;return action(async()=>{bundle.value=await client.recoveryBundle();confirmed.value=false;const url=URL.createObjectURL(new Blob([JSON.stringify(bundle.value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='habit-hero-recovery-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);});};
const disconnect=()=>action(async()=>{await client.archiveAndDisconnect(bundle.value);bundle.value=null;});
</script>
