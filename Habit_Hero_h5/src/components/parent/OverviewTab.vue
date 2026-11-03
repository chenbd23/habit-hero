<template>
  <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard label="当前积分" :value="data.totalPoints" color="bg-primary">
        <template #icon>
          <Coins class="text-primary" />
        </template>
      </StatCard>
      <StatCard label="待审核" :value="data.pendingTasks.length" color="bg-yellow-400">
        <template #icon>
          <AlertCircle class="text-yellow-600" />
        </template>
      </StatCard>
      <StatCard label="活跃任务" :value="data.habits.length" color="bg-success">
        <template #icon>
          <CheckCircle2 class="text-success" />
        </template>
      </StatCard>
      <StatCard label="历史记录" :value="data.transactions.length" color="bg-slate-400">
        <template #icon>
          <History class="text-slate-500" />
        </template>
      </StatCard>
    </div>

    <!-- Pending Approvals -->
    <div class="bg-yellow-50 p-6 md:p-8 rounded-[2rem] border-[3px] border-black shadow-cartoon relative overflow-hidden">
      <div class="absolute top-0 right-0 p-10 opacity-10 pointer-events-none">
        <Clock :size="100" />
      </div>
      <div class="flex items-center gap-3 mb-6 relative z-10">
        <div class="bg-yellow-400 p-2 rounded-xl border-2 border-black text-black">
          <AlertCircle :size="24" :stroke-width="3" />
        </div>
        <h3 class="font-black text-2xl text-slate-800">
          待审核任务 <span class="text-slate-500 text-lg ml-2">({{ data.pendingTasks.length }})</span>
        </h3>
      </div>

      <div v-if="data.pendingTasks.length === 0" class="text-slate-400 font-bold bg-white/60 p-8 rounded-2xl border-2 border-dashed border-slate-300 text-center">
        <Sparkles class="mx-auto mb-2 opacity-50" />
        暂时没有待审核的任务，孩子正在努力中！
      </div>
      <div v-else class="grid gap-4 relative z-10">
        <div
          v-for="task in data.pendingTasks"
          :key="task.id"
          class="bg-white p-5 rounded-2xl border-[3px] border-black shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4"
        >
          <div class="flex items-center gap-4 w-full sm:w-auto">
            <div class="w-16 h-16 bg-slate-50 border-2 border-black rounded-2xl flex items-center justify-center text-4xl shadow-sm">
              {{ task.emoji }}
            </div>
            <div>
              <p class="font-black text-xl text-slate-800">{{ task.habitName }}</p>
              <p class="text-sm text-slate-500 font-bold flex items-center gap-1">
                <Clock :size="14" /> {{ formatDate(task.timestamp) }}
              </p>
            </div>
            <span class="ml-auto sm:ml-4 bg-indigo-100 text-indigo-700 font-black px-3 py-1 rounded-lg border border-indigo-200">+{{ task.points }}</span>
          </div>
          <div class="flex gap-3 w-full sm:w-auto">
            <Button
              variant="danger"
              size="sm"
              @click="handleReject(task.id)"
              class="flex-1 sm:flex-none justify-center"
              title="拒绝"
            >
              <ThumbsDown :size="20" :stroke-width="3" />
            </Button>
            <Button
              variant="success"
              size="sm"
              @click="handleApprove(task)"
              class="flex-1 sm:flex-none justify-center"
              title="批准"
            >
              <span class="mr-2">确认完成</span>
              <ThumbsUp :size="20" :stroke-width="3" />
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- Manual Points Adjustment -->
    <div class="bg-white p-6 md:p-8 rounded-[2rem] border-[3px] border-black shadow-cartoon">
      <h3 class="font-black text-slate-800 mb-6 text-xl flex items-center gap-2">
        <Coins :size="24" /> 直接积分调整
      </h3>
      <div class="flex flex-col sm:flex-row gap-4 items-start">
        <input
          v-model.number="manualAmount"
          type="number"
          placeholder="积分数量（正整数）"
          class="w-40 p-4 rounded-2xl border-2 border-slate-200 focus:outline-none focus:border-black font-bold bg-slate-50"
        />
        <input
          v-model="manualReason"
          type="text"
          placeholder="备注（可选，如奖励理由）"
          class="flex-1 p-4 rounded-2xl border-2 border-slate-200 focus:outline-none focus:border-black font-bold bg-slate-50"
        />
        <div class="flex gap-3 w-full sm:w-auto">
          <button @click="handleManualAward" class="flex-1 sm:flex-none px-5 py-3 rounded-2xl border-[3px] border-black bg-green-500 hover:bg-green-600 text-white font-black shadow-cartoon hover:-translate-y-1 hover:shadow-cartoon-lg transition-all active:scale-95">发放积分</button>
          <button @click="handleManualDeduct" class="flex-1 sm:flex-none px-5 py-3 rounded-2xl border-[3px] border-black bg-red-500 hover:bg-red-600 text-white font-black shadow-cartoon hover:-translate-y-1 hover:shadow-cartoon-lg transition-all active:scale-95">扣除积分</button>
        </div>
      </div>
      <p class="text-xs text-slate-500 mt-3 font-bold">操作会记录到历史记录中，类型分别为获得和消费。</p>
    </div>

    <!-- Quick Deductions -->
    <div v-if="(data.deductions || []).length > 0" class="bg-white p-6 md:p-8 rounded-[2rem] border-[3px] border-black shadow-cartoon">
      <h3 class="font-black text-slate-800 mb-6 text-xl flex items-center gap-2">
        <Zap :size="24" /> 快速扣分
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          v-for="deduction in (data.deductions || [])"
          :key="deduction.id"
          @click="handleQuickDeduct(deduction)"
          :disabled="data.totalPoints < deduction.points"
          :class="[
            'p-5 rounded-2xl border-[3px] border-black shadow-sm flex justify-between items-center group transition-all',
            data.totalPoints >= deduction.points
              ? 'bg-white hover:-translate-y-1 hover:bg-red-50 active:scale-95'
              : 'bg-slate-100 opacity-60 cursor-not-allowed shadow-none grayscale'
          ]"
        >
          <div class="flex items-center gap-4">
            <div class="w-14 h-14 bg-red-50 border-2 border-black rounded-2xl flex items-center justify-center text-3xl shadow-sm">
              {{ deduction.emoji }}
            </div>
            <div>
              <p class="font-black text-slate-800 text-lg">{{ deduction.name }}</p>
              <p class="text-xs text-slate-500 font-bold bg-slate-100 px-2 py-1 rounded inline-block mt-1">扣除 {{ deduction.points }} 分</p>
            </div>
          </div>
          <div
            :class="[
              'font-black text-xl px-4 py-2 rounded-xl border-[3px] border-black',
              data.totalPoints >= deduction.points ? 'bg-red-500 text-white' : 'bg-slate-300 text-slate-500'
            ]"
          >
            -{{ deduction.points }}
          </div>
        </button>
      </div>
      <p class="text-xs text-slate-500 mt-4 font-bold text-center">点击扣分项快速扣除积分，操作会记录到历史记录中。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, inject } from 'vue';
import {
  Coins,
  AlertCircle,
  CheckCircle2,
  History,
  Clock,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  Zap,
} from 'lucide-vue-next';
import { useAppData } from '../../composables/useAppData';
import { safeId } from '../../../services/id';
import type { AppData, PendingTask, Transaction, Deduction } from '../../../types';
import StatCard from '../StatCard.vue';
import Button from '../ui/Button.vue';

interface Props {
  data: AppData;
}

const props = defineProps<Props>();
const { updateData, handleApproveTask, handleRejectTask, handleQuickDeduct: quickDeduct } = useAppData();
const showToast = inject<(message: string, type?: 'success' | 'error' | 'info') => void>('showToast')!;

const manualAmount = ref<number | string>('');
const manualReason = ref('');

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('zh-CN');
};

const handleApprove = async (task: PendingTask) => {
  await handleApproveTask(task);
  showToast(`已批准: ${task.habitName}`, 'success');
};

const handleReject = async (taskId: string) => {
  await handleRejectTask(taskId);
  showToast('任务已退回', 'info');
};

const handleManualAward = async () => {
  const amt = typeof manualAmount.value === 'number' ? manualAmount.value : parseInt(String(manualAmount.value), 10);
  if (isNaN(amt) || amt <= 0) {
    showToast('请输入有效的正整数积分', 'error');
    return;
  }
  const newTransaction: Transaction = {
    id: safeId(),
    type: 'earn',
    amount: amt,
    description: manualReason.value ? `手动发放: ${manualReason.value}` : '手动发放',
    date: new Date().toISOString(),
  };
  await updateData((prev) => ({
    ...prev,
    totalPoints: prev.totalPoints + amt,
    transactions: [newTransaction, ...prev.transactions],
  }));
  manualAmount.value = '';
  manualReason.value = '';
  showToast(`已发放 ${amt} 积分`, 'success');
};

const handleManualDeduct = async () => {
  const amt = typeof manualAmount.value === 'number' ? manualAmount.value : parseInt(String(manualAmount.value), 10);
  if (isNaN(amt) || amt <= 0) {
    showToast('请输入有效的正整数积分', 'error');
    return;
  }
  if (props.data.totalPoints < amt) {
    showToast('当前积分不足，无法扣除', 'error');
    return;
  }
  const newTransaction: Transaction = {
    id: safeId(),
    type: 'spend',
    amount: amt,
    description: manualReason.value ? `手动扣除: ${manualReason.value}` : '手动扣除',
    date: new Date().toISOString(),
  };
  await updateData((prev) => ({
    ...prev,
    totalPoints: prev.totalPoints - amt,
    transactions: [newTransaction, ...prev.transactions],
  }));
  manualAmount.value = '';
  manualReason.value = '';
  showToast(`已扣除 ${amt} 积分`, 'success');
};

const handleQuickDeduct = async (deduction: Deduction) => {
  try {
    await quickDeduct(deduction);
    showToast(`已扣除: ${deduction.name} (-${deduction.points}分)`, 'success');
  } catch (error: any) {
    showToast(error.message || '扣除失败', 'error');
  }
};
</script>

