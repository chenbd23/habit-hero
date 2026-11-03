<template>
  <div class="min-h-screen flex flex-col items-center justify-center px-5 py-20 relative overflow-hidden">
    <div class="absolute top-10 left-10 w-32 h-32 bg-accent rounded-full border-[3px] border-black opacity-60 animate-bounce-slow -z-10"></div>
    <div class="absolute top-40 right-20 w-16 h-16 bg-primary rounded-lg rotate-12 border-[3px] border-black opacity-60 animate-wiggle -z-10"></div>
    <div class="absolute bottom-20 left-20 w-24 h-24 bg-secondary rounded-full border-[3px] border-black opacity-60 animate-pulse -z-10"></div>

    <div class="absolute top-10 right-1/2 translate-x-1/2 -z-10 opacity-80">
      <svg width="200" height="120" viewBox="0 0 200 120" fill="#E0F2FE" stroke="black" stroke-width="3">
        <path d="M20,80 Q0,80 0,60 Q0,30 30,30 Q40,10 70,10 Q100,0 130,20 Q160,10 180,40 Q200,50 200,80 Q200,110 170,110 L30,110 Q10,110 20,80 Z" />
      </svg>
    </div>

    <div class="bg-white p-6 sm:p-8 rounded-[3rem] border-[4px] border-black shadow-cartoon-lg w-full max-w-sm text-center transform rotate-1 hover:rotate-0 transition-transform duration-300">
      <div class="bg-gradient-to-br from-primary to-violet-500 w-28 h-28 rounded-full border-[4px] border-black flex items-center justify-center mx-auto mb-6 shadow-cartoon relative -top-12">
        <Trophy :size="56" :stroke-width="2.5" class="text-white drop-shadow-md" />
        <div class="absolute -right-2 top-0 bg-accent p-2 rounded-full border-2 border-black animate-bounce">
          <Star :size="20" fill="black" class="text-black" />
        </div>
      </div>

      <div class="-mt-8 mb-8">
        <h1 class="text-4xl font-black text-slate-800 tracking-tight drop-shadow-sm mb-2">习惯小英雄</h1>
        <p class="text-slate-500 font-bold text-lg">今天也是棒棒的一天！</p>
      </div>

      <div class="space-y-5">
        <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <p class="text-sm font-bold text-slate-500">{{ session?.families.find(f=>f.id===session?.familyId)?.name }} · {{ childCards.length }} 位小英雄</p>
          <button class="font-bold underline text-slate-500 text-sm" @click="managing=true">{{ session?.role==='child'?'账户与退出':'管理家庭' }}</button>
        </div>
        <div class="space-y-4" aria-label="所有小朋友">
          <a v-for="child in childCards" :key="child.id" :href="childLink('kid',session!.familyId!,child.id)"
            :aria-label="child.name" :aria-disabled="busy || pending>0" @click="enterChild($event,child.id)"
            class="flex w-full items-center justify-between gap-3 px-5 py-4 text-xl font-black bg-accent text-slate-900 border-[3px] border-black rounded-[2rem] shadow-cartoon hover:bg-yellow-400 hover:-translate-y-1 transition-transform"
            :class="{'opacity-50':busy || pending>0}">
            <span class="flex items-center gap-3 min-w-0">
              <img v-if="child.avatar" :src="child.avatar" alt="" class="w-8 h-8 rounded-full object-cover shrink-0" />
              <User v-else :stroke-width="3" class="shrink-0" />
              <span class="break-words text-left">{{ child.name }}</span>
            </span>
            <ArrowRight :stroke-width="3" class="shrink-0" />
          </a>
        </div>

        <Button
          v-if="session?.role!=='child'" @click="handleParentEntry"
          variant="secondary"
          size="lg"
          class="w-full justify-between group rounded-[2rem]"
        >
          <span class="flex items-center gap-3">
            <Lock :size="20" :stroke-width="3" /> 家长入口
          </span>
          <div class="bg-slate-100 p-1 rounded-full border-2 border-black group-hover:bg-slate-200">
            <ArrowRight :size="16" :stroke-width="3" />
          </div>
        </Button>
      </div>
    </div>

    <p class="max-w-sm mt-6 text-sm text-slate-600" v-if="session?.role!=='child'">当前是家长账户。交给孩子前，请在家长设置中启用独立儿童设备；直接进入孩子页面只是预览。</p>
  </div>
</template>

<script setup lang="ts">
import { ref, inject, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { Trophy, Star, User, Lock, ArrowRight } from 'lucide-vue-next';
import { useAppData, useSync } from '../composables/useAppData';
import { useAuth } from '../composables/useAuth';
import { childLink } from '../composables/childLinks';
import Button from '../components/ui/Button.vue';
import Modal from '../components/ui/Modal.vue';

const router = useRouter();
const route = useRoute();
const { data, init } = useAppData();
const {session,managing,childCards,busy,pending}=useSync();
const enterChild=(event:MouseEvent,id:string)=>{
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();
  if(busy.value||pending.value)return;
  clearAuth();
  void router.push(childLink('kid',session.value!.familyId!,id));
};
const { checkAuth, setAuthenticated, clearAuth } = useAuth();
const showToast = inject<(message: string, type?: 'success' | 'error' | 'info') => void>('showToast')!;

onMounted(() => {init();});
const handleParentEntry = () => {setAuthenticated(true);router.push('/parent');};
</script>
