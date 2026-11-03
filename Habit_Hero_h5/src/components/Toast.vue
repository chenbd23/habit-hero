<template>
  <div
    :class="[
      'fixed top-6 left-1/2 -translate-x-1/2 px-8 py-4 rounded-2xl border-[3px] border-black shadow-cartoon-lg z-50 animate-in slide-in-from-top-4 fade-in duration-300 font-black flex items-center gap-3 text-lg min-w-[300px] justify-center',
      type === 'success' ? 'bg-success text-slate-900' :
      type === 'info' ? 'bg-blue-400 text-white' : 'bg-red-400 text-white'
    ]"
  >
    <Sparkles v-if="type === 'success'" :size="24" class="text-white fill-white animate-spin-slow" />
    <AlertCircle v-else :size="24" />
    {{ message }}
  </div>
</template>

<script setup lang="ts">
import { Sparkles, AlertCircle } from 'lucide-vue-next';
import type { ToastType } from '../composables/useToast';

interface Props {
  message: string;
  type: ToastType;
}

defineProps<Props>();
</script>

