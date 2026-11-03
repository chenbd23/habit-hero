<template>
  <div class="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
    <div class="grid grid-cols-2 gap-4">
      <div class="bg-green-50 p-4 rounded-[2rem] border-[3px] border-black shadow-cartoon text-center">
        <p class="text-slate-500 font-bold text-sm mb-1">累计获得</p>
        <p class="text-3xl font-black text-green-600">+{{ totalEarned }}</p>
      </div>
      <div class="bg-pink-50 p-4 rounded-[2rem] border-[3px] border-black shadow-cartoon text-center">
        <p class="text-slate-500 font-bold text-sm mb-1">累计消费</p>
        <p class="text-3xl font-black text-pink-600">-{{ totalSpent }}</p>
      </div>
    </div>

    <div class="bg-white p-6 md:p-8 rounded-[2rem] border-[3px] border-black shadow-cartoon">
      <div class="flex justify-between items-center mb-6">
        <h3 class="font-black text-xl text-slate-800 flex items-center gap-2">
          <History :size="24" /> 历史明细 ({{ transactions.length }})
        </h3>
      </div>

      <div v-if="transactions.length === 0">
        <p class="text-slate-400 text-center py-10 font-bold">暂无活动记录</p>
      </div>
      <template v-else>
        <div class="space-y-3">
          <TransactionItem
            v-for="t in paginatedData"
            :key="t.id"
            :item="t"
          />
        </div>

        <!-- Pagination Controls -->
        <div v-if="totalPages > 1" class="flex justify-center items-center gap-4 mt-8 pt-4 border-t-2 border-slate-100">
          <Button
            variant="ghost"
            size="sm"
            :disabled="currentPage === 1"
            @click="currentPage = Math.max(1, currentPage - 1)"
          >
            <ChevronLeft /> 上一页
          </Button>
          <span class="font-bold text-slate-500">
            {{ currentPage }} / {{ totalPages }}
          </span>
          <Button
            variant="ghost"
            size="sm"
            :disabled="currentPage === totalPages"
            @click="currentPage = Math.min(totalPages, currentPage + 1)"
          >
            下一页 <ChevronRight />
          </Button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { History, ChevronLeft, ChevronRight } from 'lucide-vue-next';
import type { Transaction } from '../../types';
import TransactionItem from './TransactionItem.vue';
import Button from './ui/Button.vue';

interface Props {
  transactions: Transaction[];
}

const props = defineProps<Props>();

const ITEMS_PER_PAGE = 20;
const currentPage = ref(1);

const totalEarned = computed(() =>
  props.transactions
    .filter((t) => t.type === 'earn')
    .reduce((acc, curr) => acc + curr.amount, 0)
);

const totalSpent = computed(() =>
  props.transactions
    .filter((t) => t.type === 'spend')
    .reduce((acc, curr) => acc + curr.amount, 0)
);

const totalPages = computed(() => Math.ceil(props.transactions.length / ITEMS_PER_PAGE));

const paginatedData = computed(() =>
  props.transactions.slice(
    (currentPage.value - 1) * ITEMS_PER_PAGE,
    currentPage.value * ITEMS_PER_PAGE
  )
);
</script>

