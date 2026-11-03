<template>
  <div v-if="!data" class="min-h-screen flex flex-col items-center justify-center bg-paper text-slate-400 gap-4">
    <div class="w-16 h-16 border-4 border-slate-300 border-t-primary rounded-full animate-spin"></div>
    <span class="font-bold">加载数据中...</span>
  </div>

  <div v-else class="h-screen overflow-y-auto overscroll-y-none bg-indigo-50/50" style="overflow-anchor: none; padding-top: calc(env(safe-area-inset-top) + 6rem); padding-bottom: calc(env(safe-area-inset-bottom) + 5rem)">
    <header class="bg-slate-800 border-b-[4px] border-black px-6 py-4 flex justify-between items-center fixed top-0 left-0 right-0 z-30 shadow-lg text-white" style="padding-top: env(safe-area-inset-top)">
      <div class="flex items-center gap-3">
        <div class="bg-slate-700 p-2 rounded-xl border-2 border-slate-500"><Lock :size="18" /></div>
        <h1 class="font-bold text-xl tracking-tight">家长控制台</h1>
        <Button variant="ghost" size="sm" @click="isTabDrawerOpen = true" class="ml-2 bg-slate-700/50 hover:bg-slate-700 text-white border-2 border-slate-600 flex items-center gap-1">
          更多 <ChevronRight :size="16" />
        </Button>
      </div>
      <Button variant="ghost" size="sm" @click="handleLogout" class="text-white hover:bg-slate-700 hover:text-white border-2 border-transparent">返回首页</Button>
    </header>

    <!-- 左侧抽屉导航 -->
    <div class="fixed inset-0 z-30 pointer-events-none">
      <!-- 遮罩层 -->
      <div
        v-if="isTabDrawerOpen"
        class="absolute inset-0 bg-black/30 pointer-events-auto"
        @click="isTabDrawerOpen = false"
      ></div>
      <aside
        :class="[
          'absolute top-0 left-0 h-full w-72 max-w-[80vw] bg-white border-r-[3px] border-black shadow-cartoon transition-transform duration-300 pointer-events-auto',
          isTabDrawerOpen ? 'translate-x-0' : '-translate-x-full'
        ]"
      >
        <div class="p-4 border-b-[3px] border-black flex items-center justify-between">
          <span class="font-black text-slate-800">导航</span>
          <Button variant="ghost" size="sm" @click="isTabDrawerOpen = false" class="text-slate-600 hover:bg-slate-100">关闭</Button>
        </div>
        <div class="p-4 flex flex-col gap-3">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="activeTab = tab.id; isTabDrawerOpen = false"
            :class="[
              'px-4 py-3 rounded-xl font-black text-sm transition-all border-[3px] border-black text-left',
              activeTab === tab.id ? 'bg-accent text-slate-900 shadow-cartoon' : 'bg-white text-slate-600 hover:bg-slate-100'
            ]"
          >
            {{ tab.label }}
          </button>
        </div>
      </aside>
    </div>

    <!-- 底部导航栏 -->
    <nav class="fixed bottom-0 left-0 right-0 z-30 bg-white border-t-[4px] border-black shadow-cartoon-lg" style="padding-bottom: env(safe-area-inset-bottom)">
      <div class="max-w-5xl mx-auto px-4 py-2">
        <div class="grid grid-cols-5 gap-2">
          <button
            v-for="tab in bottomTabs"
            :key="tab.id"
            @click="activeTab = tab.id"
            :class="[
              'flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-2xl border-[3px] font-black transition-all',
              activeTab === tab.id
                ? 'bg-accent text-slate-900 border-black shadow-cartoon'
                : 'bg-white text-slate-600 border-black hover:bg-slate-50'
            ]"
          >
            <span class="flex items-center justify-center w-7 h-7"><component :is="tab.icon" /></span>
            <span class="text-xs">{{ tab.label }}</span>
          </button>
        </div>
      </div>
    </nav>

    <div class="p-4 md:p-8 max-w-5xl mx-auto">
      <ChildSwitcher class="mb-6" />
      <OverviewTab v-if="activeTab === 'overview'" :data="data" />
      <HabitsTab v-if="activeTab === 'habits'" :data="data" />
      <RewardsTab v-if="activeTab === 'rewards'" :data="data" />
      <HistoryTab v-if="activeTab === 'history'" :transactions="data.transactions" />
      <SettingsTab v-if="activeTab === 'settings'" :data="data" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, inject, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Lock, ChevronRight, Home, CheckCircle2, Gift, History, Settings } from 'lucide-vue-next';
import { useAppData } from '../composables/useAppData';
import { useAuth } from '../composables/useAuth';
import type { AppData } from '../../types';
import Button from '../components/ui/Button.vue';
import ChildSwitcher from '../components/ChildSwitcher.vue';
import OverviewTab from '../components/parent/OverviewTab.vue';
import HabitsTab from '../components/parent/HabitsTab.vue';
import RewardsTab from '../components/parent/RewardsTab.vue';
import HistoryTab from '../components/HistoryTab.vue';
import SettingsTab from '../components/parent/SettingsTab.vue';

const router = useRouter();
const { data, init } = useAppData();
const { clearAuth } = useAuth();

const activeTab = ref<'overview' | 'habits' | 'rewards' | 'history' | 'settings'>('overview');
const isTabDrawerOpen = ref(false);

const handleLogout = () => {
  clearAuth();
  router.push('/');
};

const tabs = [
  { id: 'overview', label: '总览 & 审核' },
  { id: 'habits', label: '任务管理' },
  { id: 'rewards', label: '奖励管理' },
  { id: 'history', label: '历史记录' },
  { id: 'settings', label: '设置 & 备份' },
] as const;

const bottomTabs = [
  { id: 'overview', label: '总览', icon: Home },
  { id: 'habits', label: '任务', icon: CheckCircle2 },
  { id: 'rewards', label: '奖励', icon: Gift },
  { id: 'history', label: '历史', icon: History },
  { id: 'settings', label: '设置', icon: Settings },
] as const;

onMounted(() => {
  init();
});
</script>

