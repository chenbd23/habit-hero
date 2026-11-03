<template>
  <div class="space-y-4">
    <label class="block cursor-pointer bg-primary text-white border-[3px] border-black rounded-2xl p-4 text-center font-black shadow-cartoon">
      选择备份并预览
      <input aria-label="选择备份文件" type="file" accept=".json,application/json" class="block mt-2 w-full text-sm" :disabled="busy" @change="readFile" />
    </label>
    <p class="text-sm text-slate-500">支持旧 H5 备份和新版家庭备份。先核对孩子、积分与重复记录，确认后才写入家庭。</p>
    <template v-if="draft">
      <div v-for="profile in sourceProfiles" :key="profile.id" class="border-2 rounded-2xl p-4 space-y-3">
        <p class="font-bold">{{ profile.fields.name }} · 本机 {{ profile.fields.totalPoints }} 分</p>
        <label class="block">导入方式<select v-model="draft.mappings[profile.id]" class="connection-input"><option value="skip">暂不导入</option><option value="new">作为新孩子加入</option><option v-for="child in children" :key="child.id" :value="child.id">合并到 {{ child.fields.name }}</option></select></label>
        <label v-if="draft.mappings[profile.id]!=='skip'" class="block">已有同源资料时的余额处理
          <select v-model="draft.balances[profile.id].mode" class="connection-input"><option value="remote">保留家庭当前余额</option><option value="local">使用备份余额</option><option value="projected">家庭余额加独有流水</option><option value="custom">自定义最终余额</option></select>
        </label>
        <input v-if="draft.balances[profile.id].mode==='custom'" v-model.number="draft.balances[profile.id].value" type="number" aria-label="最终积分" class="connection-input" />
      </div>
      <Button :disabled="busy || !hasSelected" class="w-full" @click="makePreview">预览合并结果</Button>
    </template>
    <div v-if="preview" class="border-[3px] border-black rounded-2xl p-4 space-y-4 bg-yellow-50">
      <h4 class="font-black">核对导入预览</h4>
      <p>新增 {{ preview.summary?.added }} · 更新 {{ preview.summary?.updated }} · 重复 {{ preview.summary?.duplicates }} · 跳过 {{ preview.summary?.skipped }}</p>
      <p v-for="balance in preview.balances" :key="balance.childId">{{ balance.name }}：备份 {{ balance.local }} 分／家庭 {{ balance.cloud??'无' }} → 最终 <strong>{{ balance.final }} 分</strong></p>
      <div v-for="conflict in preview.conflicts" :key="conflict.key" class="bg-white border rounded-xl p-3 space-y-2">
        <p class="font-bold break-words">{{ conflict.label || '历史记录' }}</p>
        <details><summary class="cursor-pointer">查看两份内容</summary><pre class="whitespace-pre-wrap break-words text-xs">备份：{{ JSON.stringify(conflict.local,null,2) }}
家庭：{{ JSON.stringify(conflict.remote,null,2) }}</pre></details>
        <select v-if="['possibleDuplicate','fields'].includes(conflict.type)" :value="draft!.decisions[conflict.key]||''" class="connection-input" @change="decide(conflict.key,$event)">
          <option value="">请选择</option><option value="remote">保留家庭记录</option><option :value="conflict.type==='possibleDuplicate'?'separate':'local'">{{ conflict.type==='possibleDuplicate'?'确认是独立记录，两份保留':'采用备份内容' }}</option>
        </select>
        <p v-else class="text-sm">保留家庭已确认的记录。</p>
      </div>
      <p v-if="dirty" class="font-bold text-orange-700">选择已变更，请重新预览后确认。</p>
      <Button :disabled="busy || !preview.ready || dirty" class="w-full" @click="commit">确认导入家庭</Button>
    </div>
  </div>
</template>
<script setup lang="ts">
import {ref,computed,watch,inject} from 'vue';
import {parseImport,type ImportDraft} from '../../../services/syncClient';
import {useSync} from '../../composables/useAppData';
import Button from '../ui/Button.vue';
const {client,children,busy,action}=useSync();
const showToast=inject<(message:string,type?:'success'|'error'|'info')=>void>('showToast')!;
const draft=ref<ImportDraft|null>(null),preview=ref<any>(null),dirty=ref(false);
const sourceProfiles=computed(()=>draft.value?.records.filter(r=>r.kind==='profiles')??[]);
const hasSelected=computed(()=>Object.values(draft.value?.mappings??{}).some(m=>m!=='skip'));
watch(draft,()=>{if(preview.value)dirty.value=true;},{deep:true,flush:'sync'});
const readFile=async(e:Event)=>{
  const input=e.target as HTMLInputElement,file=input.files?.[0];if(!file)return;
  try{
    if(file.size>64*1024*1024)throw new Error('备份文件超过 64 MB，请先在客户端分批导入');
    const parsed=parseImport(await file.text());
    for(const p of parsed.records.filter(r=>r.kind==='profiles')){parsed.mappings[p.id]='skip';parsed.balances[p.id]={mode:'remote',value:p.fields.totalPoints};}
    preview.value=null;draft.value=parsed;dirty.value=false;
  }catch(e){showToast(e instanceof Error?e.message:'读取失败','error');}finally{input.value='';}
};
const makePreview=async()=>{if(!draft.value)return;await action(async()=>{preview.value=await client.previewImport(draft.value!);dirty.value=false;});};
const decide=(key:string,e:Event)=>{draft.value!.decisions[key]=(e.target as HTMLSelectElement).value;};
const commit=async()=>{await action(()=>client.commitImport(preview.value));showToast('已导入家庭，原备份文件保留');preview.value=null;draft.value=null;};
</script>
