<template>
  <nav v-if="childCards.length>1" class="flex flex-wrap items-center gap-2" aria-label="切换小朋友">
    <a v-for="child in childCards" :key="child.id" :href="link(child.id)"
      :aria-label="`切换到${child.name}`" :aria-current="session?.childId===child.id?'page':undefined"
      :aria-disabled="busy || pending>0" @click="select($event,child.id)"
      :class="['max-w-full rounded-xl border-2 px-3 py-1 text-sm font-bold transition-colors',session?.childId===child.id?'border-black bg-accent':'border-transparent text-slate-500 hover:bg-black/5',{'opacity-50':busy || pending>0}]">
      {{ child.name }}
    </a>
  </nav>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { useSync } from '../composables/useAppData';
import { childLink } from '../composables/childLinks';
const {childCards,session,busy,pending}=useSync();
const route=useRoute(),router=useRouter();
const link=(id:string)=>childLink(route.name==='parent'?'parent':'kid',session.value!.familyId!,id);
function select(event:MouseEvent,id:string){
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();
  if(busy.value||pending.value||id===session.value?.childId)return;
  // A profile switch stays on the same screen; keep one back step to home.
  void router.replace(link(id));
}
</script>
