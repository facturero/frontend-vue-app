import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { clearTokens, getAccessToken, http, setTokens } from '@/lib/http';

export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  authProvider: 'password' | 'google';
}

function extractError(e: unknown): string {
  const err = e as { response?: { data?: { message?: string } }; message?: string };
  return err?.response?.data?.message ?? err?.message ?? 'Error inesperado';
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const isAuthenticated = computed(() => !!getAccessToken());

  async function login(email: string, password: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await http.post('/auth/login', { email, password });
      setTokens(data.accessToken, data.refreshToken);
      user.value = data.user;
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
      const { data } = await http.post('/auth/register', { email, password });
      setTokens(data.accessToken, data.refreshToken);
      user.value = data.user;
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
      const { data } = await http.post('/auth/google', { idToken });
      setTokens(data.accessToken, data.refreshToken);
      user.value = data.user;
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchMe(): Promise<User> {
    const { data } = await http.get('/auth/me');
    user.value = data;
    return data;
  }

  function logout(): void {
    clearTokens();
    user.value = null;
  }

  return { user, loading, error, isAuthenticated, login, register, loginWithGoogle, fetchMe, logout };
});
