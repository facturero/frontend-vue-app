import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { pluginApi } from '@/api/plugins';
import { extractError } from '@/utils/error';
import type { ApiErrorBody, CatalogPlugin, OrganizationPlugin, PluginCustomRequest, Quote } from '@/types/plugins';

export const usePluginsStore = defineStore('plugins', () => {
  const catalog = ref<CatalogPlugin[]>([]);
  const myPlugins = ref<OrganizationPlugin[]>([]);
  const requests = ref<PluginCustomRequest[]>([]);
  const currentQuote = ref<Quote | null>(null);

  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  const errorCode = ref<string | null>(null);
  const errorDetails = ref<string[]>([]);

  const activeCodes = computed(
    () => new Set(myPlugins.value.filter((p) => p.status === 'active').map((p) => p.pluginCode ?? '')),
  );

  function setError(e: unknown): void {
    const body = (e as { response?: { data?: ApiErrorBody } })?.response?.data;
    error.value = extractError(e);
    errorCode.value = body?.code ?? null;
    errorDetails.value = (body?.details ?? []).map((d) => d.message);
  }

  function clearError(): void {
    error.value = null;
    errorCode.value = null;
    errorDetails.value = [];
  }

  async function fetchCatalog(): Promise<void> {
    loading.value = true;
    clearError();
    try {
      catalog.value = await pluginApi.catalog();
    } catch (e) {
      setError(e);
    } finally {
      loading.value = false;
    }
  }

  async function fetchMy(): Promise<void> {
    loading.value = true;
    try {
      myPlugins.value = await pluginApi.listMine();
    } catch (e) {
      setError(e);
    } finally {
      loading.value = false;
    }
  }

  async function fetchRequests(): Promise<void> {
    loading.value = true;
    try {
      requests.value = await pluginApi.listRequests();
    } catch (e) {
      setError(e);
    } finally {
      loading.value = false;
    }
  }

  async function fetchQuote(code: string): Promise<boolean> {
    clearError();
    loading.value = true;
    try {
      currentQuote.value = await pluginApi.quote(code);
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function activate(code: string): Promise<boolean> {
    saving.value = true;
    clearError();
    try {
      await pluginApi.activate(code);
      currentQuote.value = null;
      await Promise.all([fetchMy(), fetchCatalog()]);
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      saving.value = false;
    }
  }

  async function deactivate(code: string): Promise<boolean> {
    saving.value = true;
    clearError();
    try {
      await pluginApi.deactivate(code);
      await Promise.all([fetchMy(), fetchCatalog()]);
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      saving.value = false;
    }
  }

  async function requestCustom(description: string, basedOnPluginCodes: string[]): Promise<boolean> {
    saving.value = true;
    clearError();
    try {
      await pluginApi.requestCustom({ description, basedOnPluginCodes });
      await fetchRequests();
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      saving.value = false;
    }
  }

  return {
    catalog,
    myPlugins,
    requests,
    currentQuote,
    loading,
    saving,
    error,
    errorCode,
    errorDetails,
    activeCodes,
    clearError,
    fetchCatalog,
    fetchMy,
    fetchRequests,
    fetchQuote,
    activate,
    deactivate,
    requestCustom,
  };
});
