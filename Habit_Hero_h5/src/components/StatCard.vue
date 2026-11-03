<template>
  <div
    :class="[
      'bg-white p-4 rounded-3xl shadow-cartoon border-[3px] border-black flex flex-col items-center justify-center gap-1 relative overflow-hidden group hover:scale-105 transition-transform',
    ]"
  >
    <div :class="['absolute inset-0 opacity-10', color]"></div>
    <span class="text-slate-500 text-xs font-black uppercase tracking-wider mt-2 relative z-10">{{ label }}</span>
    <div class="flex items-center gap-2 relative z-10">
      <slot name="icon" />
      <span class="text-3xl font-black">{{ value }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  label: string;
  value: string | number;
  color: string;
}

defineProps<Props>();
</script>

