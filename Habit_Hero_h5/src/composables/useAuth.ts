import { ref } from 'vue';

const PARENT_AUTH_KEY = 'habit-hero-parent-authenticated';

export function useAuth() {
  const isAuthenticated = ref(false);

  // 检查是否已认证
  const checkAuth = (): boolean => {
    const authStatus = sessionStorage.getItem(PARENT_AUTH_KEY);
    isAuthenticated.value = authStatus === 'true';
    return isAuthenticated.value;
  };

  // 设置认证状态
  const setAuthenticated = (value: boolean) => {
    if (value) {
      sessionStorage.setItem(PARENT_AUTH_KEY, 'true');
    } else {
      sessionStorage.removeItem(PARENT_AUTH_KEY);
    }
    isAuthenticated.value = value;
  };

  // 清除认证状态
  const clearAuth = () => {
    sessionStorage.removeItem(PARENT_AUTH_KEY);
    isAuthenticated.value = false;
  };

  // 初始化时检查
  checkAuth();

  return {
    isAuthenticated,
    checkAuth,
    setAuthenticated,
    clearAuth,
  };
}

