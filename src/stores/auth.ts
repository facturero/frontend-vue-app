import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { clearTokens, getAccessToken, setTokens } from '@/utils/http';
import { extractError } from '@/utils/error';
import { authApi } from '@/api/auth';
import type { CompleteProfileInput, Me, UserSummary } from '@/types/auth';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserSummary | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const needsOrg = ref(false);
  const isAuthenticated = computed(() => !!getAccessToken());

  async function login(email: string, password: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const data = await authApi.login({ email, password });
      setTokens(data.accessToken, data.refreshToken);
      user.value = data.user;
      needsOrg.value = data.needsOrg ?? false;
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function register(email: string, password: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const data = await authApi.register({ email, password });
      setTokens(data.accessToken, data.refreshToken);
      user.value = data.user;
      needsOrg.value = false;
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function loginWithGoogle(idToken: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const data = await authApi.google({ idToken });
      setTokens(data.accessToken, data.refreshToken);
      user.value = data.user;
      needsOrg.value = data.needsOrg ?? false;
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function completeProfile(input: CompleteProfileInput): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const data = await authApi.completeProfile(input);
      setTokens(data.accessToken, data.refreshToken);
      user.value = data.user;
      needsOrg.value = false;
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchMe(): Promise<Me> {
    const data = await authApi.me();
    user.value = data;
    needsOrg.value = !data.orgId;
    return data;
  }

  function can(permission: string): boolean {
    const perms = (user.value as Record<string, unknown>)?.permissions;
    return Array.isArray(perms) ? perms.includes(permission) : false;
  }

  function logout(): void {
    clearTokens();
    user.value = null;
    needsOrg.value = false;
  }

  return {
    user, loading, error, needsOrg, isAuthenticated,
    login, register, loginWithGoogle, completeProfile, fetchMe, can, logout,
  };
});
