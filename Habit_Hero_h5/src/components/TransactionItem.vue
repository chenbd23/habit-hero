<template>
  <div class="flex justify-between items-center p-3 bg-white rounded-2xl border-[3px] border-black shadow-cartoon-sm mb-3 hover:translate-x-1 transition-transform">
    <div class="flex items-center gap-3">
      <div
        :class="[
          'p-2 rounded-xl border-2 border-black',
          item.type === 'earn' ? 'bg-success/20 text-green-700' : 'bg-secondary/20 text-pink-700'
        ]"
      >
        <CheckCircle2 v-if="item.type === 'earn'" :size="20" :stroke-width="3" />
        <Coins v-else :size="20" :stroke-width="3" />
      </div>
      <div class="flex flex-col">
        <span class="font-bold text-slate-800">{{ item.description || '历史积分记录' }}</span>
        <span class="text-xs text-slate-500 font-bold">{{ formatDate(item.date) }}</span>
      </div>
    </div>
    <span
      :class="[
        'font-black text-lg',
        item.type === 'earn' ? 'text-green-600' : 'text-pink-600'
      ]"
    >
      {{ item.type === 'earn' || item.type === 'adjust' && item.amount >= 0 ? '+' : '-' }}{{ Math.abs(item.amount) }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { CheckCircle2, Coins } from 'lucide-vue-next';
import type { Transaction } from '../../types';

interface Props {
  item: Transaction;
}

defineProps<Props>();

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('zh-CN');
};
</script>

