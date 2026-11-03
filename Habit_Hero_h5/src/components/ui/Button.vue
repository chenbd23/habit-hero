<template>
  <button
    :class="[baseStyle, variants[variant], sizes[size], className]"
    :disabled="isLoading || disabled"
    @click="$emit('click', $event)"
  >
    <span v-if="isLoading" class="flex items-center gap-2">
      <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
      加载中...
    </span>
    <slot v-else />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'accent';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  isLoading: false,
  disabled: false,
  className: '',
});

defineEmits<{
  click: [event: MouseEvent];
}>();

const baseStyle = 'inline-flex items-center justify-center font-black transition-all transform active:scale-95 active:shadow-cartoon-sm disabled:opacity-50 disabled:pointer-events-none border-[3px] border-black rounded-2xl';

const variants = {
  primary: 'bg-primary text-white shadow-cartoon hover:bg-violet-600 hover:-translate-y-1 hover:shadow-cartoon-lg',
  secondary: 'bg-white text-slate-800 shadow-cartoon hover:bg-slate-50 hover:-translate-y-1 hover:shadow-cartoon-lg',
  danger: 'bg-red-400 text-white shadow-cartoon hover:bg-red-500 hover:-translate-y-1 hover:shadow-cartoon-lg',
  success: 'bg-success text-slate-900 shadow-cartoon hover:bg-green-500 hover:-translate-y-1 hover:shadow-cartoon-lg',
  accent: 'bg-accent text-slate-900 shadow-cartoon hover:bg-yellow-400 hover:-translate-y-1 hover:shadow-cartoon-lg',
  ghost: 'bg-transparent border-transparent text-slate-600 hover:bg-black/5 shadow-none active:translate-y-0 active:scale-100',
};

const sizes = {
  sm: 'px-3 py-1 text-sm rounded-xl border-2',
  md: 'px-5 py-3 text-base rounded-2xl',
  lg: 'px-8 py-4 text-xl rounded-3xl',
  xl: 'px-10 py-6 text-2xl rounded-[2rem]',
};
</script>

