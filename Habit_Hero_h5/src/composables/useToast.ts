import { ref } from 'vue';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  message: string;
  type: ToastType;
}

export function useToast() {
  const toast = ref<Toast | null>(null);

  const showToast = (message: string, type: ToastType = 'success') => {
    toast.value = { message, type };
    setTimeout(() => {
      toast.value = null;
    }, 3000);
  };

  return {
    toast,
    showToast,
  };
}

