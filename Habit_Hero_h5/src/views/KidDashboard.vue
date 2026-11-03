<template>
  <div v-if="!data" class="min-h-screen flex flex-col items-center justify-center bg-paper text-slate-400 gap-4">
    <div class="w-16 h-16 border-4 border-slate-300 border-t-primary rounded-full animate-spin"></div>
    <span class="font-bold">加载数据中...</span>
  </div>

  <div v-else class="min-h-screen pb-24 bg-sky-50">
    <!-- Prominent Hero Header -->
    <div class="bg-primary pt-8 pb-10 px-4 rounded-b-[3rem] border-b-[4px] border-black shadow-cartoon relative overflow-hidden">
      <button
        aria-label="返回家庭首页"
        @click="$router.push('/')"
        class="absolute top-6 left-6 p-2 bg-black/10 rounded-full text-white/80 hover:bg-black/20 hover:text-white transition"
      >
        <Home :size="28" :stroke-width="3" />
      </button>

      <!-- Background Decorations -->
      <div class="absolute top-[-20px] right-[-20px] w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
      <div class="absolute bottom-10 left-[-20px] w-24 h-24 bg-accent/20 rounded-full blur-xl"></div>

      <div class="flex flex-col items-center justify-center relative z-10 gap-4 mt-6">
        <div class="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-2xl border-2 border-black shadow-cartoon overflow-hidden bg-white flex items-center justify-center">
          <img v-if="data.avatar" :src="data.avatar" alt="头像" class="w-full h-full object-cover" />
          <User v-else class="text-slate-400" />
        </div>
        <div class="bg-white px-8 py-3 rounded-full border-[3px] border-black shadow-cartoon-lg transform -rotate-2">
          <h1 class="text-3xl font-black text-slate-900 tracking-tight">{{ data.childName }}</h1>
        </div>

        <div class="bg-accent px-10 py-5 rounded-[2.5rem] border-[4px] border-black shadow-cartoon-lg flex items-center gap-4 transform rotate-1 hover:scale-105 transition-transform duration-300 cursor-default">
          <div class="bg-white p-3 rounded-full border-[3px] border-black">
            <Coins :size="36" class="text-yellow-500 fill-yellow-500" :stroke-width="3" />
          </div>
          <div class="flex flex-col items-start">
            <span class="text-xs font-black text-slate-800 uppercase tracking-widest opacity-60">当前积分</span>
            <span class="text-6xl font-black text-slate-900 leading-none">{{ data.totalPoints }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="p-4 space-y-8 max-w-2xl mx-auto mt-6">
      <ChildSwitcher />
      <!-- Pending Tasks Notification -->
      <div
        v-if="data.pendingTasks.length > 0"
        class="bg-white p-4 rounded-3xl border-[3px] border-black shadow-cartoon-sm flex items-center gap-4 animate-bounce-slow mx-2 relative"
      >
        <div class="absolute -left-2 -top-2 bg-red-400 text-white w-8 h-8 flex items-center justify-center rounded-full border-2 border-black font-black z-10">
          {{ data.pendingTasks.length }}
        </div>
        <div class="bg-blue-100 p-3 rounded-2xl border-2 border-black">
          <Clock class="text-blue-600" :size="24" :stroke-width="3" />
        </div>
        <div class="flex-1">
          <p class="font-black text-slate-800 text-lg">等待爸爸妈妈确认...</p>
          <div class="flex gap-1 mt-1 overflow-x-auto">
            <span
              v-for="t in data.pendingTasks.slice(0, 5)"
              :key="t.id"
              class="text-xl bg-slate-100 rounded-lg p-1 border border-slate-300"
            >{{ t.emoji }}</span>
          </div>
        </div>
      </div>

      <!-- Today's Tasks -->
      <section>
        <div class="flex items-center gap-3 mb-6 px-2">
          <div class="bg-success text-slate-900 p-2 rounded-xl border-[3px] border-black shadow-cartoon-sm transform -rotate-3">
            <CheckCircle2 :size="28" :stroke-width="3" />
          </div>
          <h2 class="text-3xl font-black text-slate-800 tracking-tight">今日任务</h2>
        </div>

        <div v-if="isAllDone" class="bg-white p-8 rounded-[2.5rem] border-[4px] border-black shadow-cartoon text-center relative overflow-hidden group">
          <div class="absolute inset-0 bg-yellow-50 opacity-50 pattern-grid-lg"></div>
          <div class="relative z-10">
            <div class="text-8xl mb-4 animate-bounce">🎉</div>
            <h3 class="text-2xl font-black text-slate-800 mb-2">哇！太厉害了！</h3>
            <p class="text-slate-500 font-bold text-lg">今天的任务全部完成啦！</p>
          </div>
        </div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <button
            v-for="habit in visibleHabits"
            :key="habit.id"
            @click="handleHabitClick(habit)"
            class="bg-white p-5 rounded-[2rem] border-[3px] border-black shadow-cartoon transition-all hover:-translate-y-2 hover:shadow-cartoon-lg hover:bg-green-50 active:translate-y-0 active:scale-95 flex items-center justify-between group relative overflow-hidden"
          >
            <div class="absolute -right-4 -bottom-4 w-20 h-20 bg-green-100 rounded-full opacity-50 z-0"></div>
            <div class="flex items-center gap-5 relative z-10">
              <span class="text-5xl filter drop-shadow-sm group-hover:scale-110 transition-transform duration-300">{{ habit.emoji }}</span>
              <div class="text-left">
                <span class="font-black text-xl text-slate-800 block">{{ habit.name }}</span>
                <span class="text-xs text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 mt-1 inline-block">点击完成</span>
              </div>
            </div>
            <div class="bg-success text-slate-900 font-black text-xl w-14 h-14 rounded-full border-[3px] border-black flex items-center justify-center shadow-sm relative z-10 group-hover:rotate-12 transition-transform">
              +{{ habit.points }}
            </div>
          </button>
        </div>
      </section>

      <!-- Confirm Completion Modal -->
      <Modal :is-open="isConfirmOpen" title="确认提交任务" @close="isConfirmOpen = false">
        <div v-if="confirmHabit" class="space-y-4">
          <div class="flex items-center gap-4">
            <div class="w-16 h-16 bg-slate-50 border-2 border-black rounded-2xl flex items-center justify-center text-4xl">
              {{ confirmHabit.emoji }}
            </div>
            <div>
              <p class="font-black text-xl text-slate-800">{{ confirmHabit.name }}</p>
              <p class="text-sm text-slate-600 font-bold">完成后将提交给家长审核，积分：+{{ confirmHabit.points }}</p>
            </div>
          </div>
          <div class="flex gap-3 justify-end">
            <Button variant="secondary" @click="isConfirmOpen = false">取消</Button>
            <Button
              variant="success"
              @click="handleConfirmTask"
            >
              确认完成
            </Button>
          </div>
        </div>
        <div v-else class="text-slate-600">请选择一个任务</div>
      </Modal>

      <!-- Rewards Section -->
      <section class="mt-12">
        <div class="flex items-center gap-3 mb-6 px-2">
          <div class="bg-secondary text-white p-2 rounded-xl border-[3px] border-black shadow-cartoon-sm transform rotate-2">
            <Gift :size="28" :stroke-width="3" />
          </div>
          <h2 class="text-3xl font-black text-slate-800 tracking-tight">兑换奖励</h2>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <button
            v-for="reward in data.rewards"
            :key="reward.id"
            :disabled="!canAfford(reward)"
            @click="handleRewardClick(reward)"
            :class="[
              'p-5 rounded-[2rem] border-[3px] border-black transition-all flex items-center justify-between group text-left relative overflow-hidden',
              canAfford(reward)
                ? 'bg-white shadow-cartoon hover:-translate-y-2 hover:shadow-cartoon-lg hover:bg-pink-50 active:scale-95'
                : 'bg-slate-100 opacity-60 cursor-not-allowed shadow-none grayscale'
            ]"
          >
            <div class="flex items-center gap-4 relative z-10">
              <div class="bg-white w-16 h-16 rounded-2xl border-2 border-black flex items-center justify-center text-4xl shadow-sm group-hover:rotate-6 transition-transform overflow-hidden">
                <img v-if="reward.image" :src="reward.image" :alt="reward.name" class="w-full h-full object-cover" />
                <span v-else>{{ reward.emoji }}</span>
              </div>
              <div>
                <span class="font-black text-xl text-slate-800 block">{{ reward.name }}</span>
                <span v-if="canAfford(reward)" class="text-pink-500 font-bold text-sm">可以兑换!</span>
                <div v-else class="h-2 w-20 bg-slate-200 rounded-full mt-2 border border-slate-300 overflow-hidden">
                  <div class="h-full bg-slate-400" :style="{ width: `${(data.totalPoints / reward.cost) * 100}%` }"></div>
                </div>
              </div>
            </div>
            <span
              :class="[
                'font-black text-lg px-3 py-1.5 rounded-xl border-[3px] border-black relative z-10',
                canAfford(reward) ? 'bg-secondary text-white transform -rotate-6' : 'bg-slate-300 text-slate-500'
              ]"
            >
              -{{ reward.cost }}
            </span>
          </button>
        </div>
      </section>

      <!-- Confirm Spend Modal -->
      <Modal :is-open="isSpendConfirmOpen" title="确认兑换奖励" @close="isSpendConfirmOpen = false">
        <div v-if="confirmReward" class="space-y-4">
          <div class="flex items-center gap-4">
            <div class="w-16 h-16 bg-slate-50 border-2 border-black rounded-2xl flex items-center justify-center text-4xl overflow-hidden">
              <img v-if="confirmReward.image" :src="confirmReward.image" :alt="confirmReward.name" class="w-full h-full object-cover" />
              <span v-else>{{ confirmReward.emoji }}</span>
            </div>
            <div>
              <p class="font-black text-xl text-slate-800">{{ confirmReward.name }}</p>
              <p class="text-sm text-slate-600 font-bold">将扣除积分：-{{ confirmReward.cost }}</p>
            </div>
          </div>
          <div class="flex gap-3 justify-end">
            <Button variant="secondary" @click="isSpendConfirmOpen = false">取消</Button>
            <Button
              variant="danger"
              @click="handleConfirmSpend"
            >
              确认兑换
            </Button>
          </div>
        </div>
        <div v-else class="text-slate-600">请选择一个奖励</div>
      </Modal>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  Home,
  User,
  Coins,
  CheckCircle2,
  Clock,
  Gift,
} from 'lucide-vue-next';
import { useAppData } from '../composables/useAppData';
import type { Habit, Reward } from '../../types';
import Button from '../components/ui/Button.vue';
import ChildSwitcher from '../components/ChildSwitcher.vue';
import Modal from '../components/ui/Modal.vue';

const router = useRouter();
const { data, init, isTaskCompletedToday, handleRequestTask, handleSpend } = useAppData();
const showToast = inject<(message: string, type?: 'success' | 'error' | 'info') => void>('showToast')!;

const isConfirmOpen = ref(false);
const confirmHabit = ref<Habit | null>(null);
const isSpendConfirmOpen = ref(false);
const confirmReward = ref<Reward | null>(null);

onMounted(() => {
  init();
});

const visibleHabits = computed(() => {
  if (!data.value) return [];
  return data.value.habits.filter((h) => !isTaskCompletedToday(h.id));
});

const isAllDone = computed(() => {
  if (!data.value) return false;
  return visibleHabits.value.length === 0 && data.value.habits.length > 0;
});

const canAfford = (reward: Reward) => {
  if (!data.value) return false;
  return data.value.totalPoints >= reward.cost;
};

const handleHabitClick = (habit: Habit) => {
  confirmHabit.value = habit;
  isConfirmOpen.value = true;
};

const handleConfirmTask = async () => {
  if (confirmHabit.value) {
    await handleRequestTask(confirmHabit.value);
    showToast(`太棒了！"${confirmHabit.value.name}" 完成啦！`, 'success');
    isConfirmOpen.value = false;
    confirmHabit.value = null;
  }
};

const handleRewardClick = (reward: Reward) => {
  if (!canAfford(reward)) return;
  confirmReward.value = reward;
  isSpendConfirmOpen.value = true;
};

const handleConfirmSpend = async () => {
  if (confirmReward.value) {
    try {
      await handleSpend(confirmReward.value);
      showToast(`成功兑换: ${confirmReward.value.name}!`, 'success');
      isSpendConfirmOpen.value = false;
      confirmReward.value = null;
    } catch (error: any) {
      showToast(error.message || '兑换失败', 'error');
    }
  }
};
</script>

