import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { pluginApi } from '@/api/plugins';
import { extractError } from '@/utils/error';
import type {
  ApiErrorBody,
  BatchActivationResult,
  BusinessProfile,
  BusinessProfileRecommendations,
  CatalogPlugin,
  MyBusinessProfile,
  OrganizationPlugin,
  PluginCustomRequest,
  Quote,
} from '@/types/plugins';

export const usePluginsStore = defineStore('plugins', () => {
  const catalog = ref<CatalogPlugin[]>([]);
  const myPlugins = ref<OrganizationPlugin[]>([]);
  const requests = ref<PluginCustomRequest[]>([]);
  const currentQuote = ref<Quote | null>(null);
  /** Los plugins de la organización ya se cargaron al menos una vez en esta sesión. */
  const myLoaded = ref(false);

  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  const errorCode = ref<string | null>(null);
  const errorDetails = ref<string[]>([]);

  /**
   * Perfil de negocio de la organización: lo que decide qué se recomienda en
   * el alta. Se carga una vez por sesión junto a `ensureMyLoaded()`, igual que
   * los plugins activos, para no pedirlo en cada navegación.
   */
  const businessProfiles = ref<BusinessProfile[]>([]);
  const myProfile = ref<MyBusinessProfile | null>(null);
  const recommendations = ref<BusinessProfileRecommendations | null>(null);
  /** Resultado de la última activación en lote, para enseñarlo al llegar a inicio. */
  const lastBatchResults = ref<BatchActivationResult[] | null>(null);
  const profileLoaded = ref(false);
  const profileSaving = ref(false);

  const activeCodes = computed(
    () => new Set(myPlugins.value.filter((p) => p.status === 'active').map((p) => p.pluginCode ?? '')),
  );

  /** La organización aún no ha decidido su perfil: el alta no ha terminado. */
  const profilePending = computed(() => myProfile.value?.status === 'pending');

  /** Un módulo sin código de plugin es parte del núcleo: siempre disponible. */
  function isActive(pluginCode?: string): boolean {
    if (!pluginCode) return true;
    return activeCodes.value.has(pluginCode);
  }

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
      myLoaded.value = true;
    } catch (e) {
      setError(e);
    } finally {
      loading.value = false;
    }
  }

  /**
   * Carga los plugins de la organización una sola vez. La usa el guard del
   * router antes de decidir si una ruta es accesible: sin esto, el menú y las
   * rutas se evaluarían contra una lista vacía y todo parecería desactivado.
   * El perfil de negocio viaja con ella: el guard y las pantallas del alta lo
   * necesitan cargado desde el primer momento.
   */
  async function ensureMyLoaded(): Promise<void> {
    // Cada mitad lleva su propio "ya está" (`myLoaded`, `profileLoaded`). Un
    // único guardado arriba dejaba el perfil de negocio sin cargar para siempre
    // en cuanto los plugins se hubieran cargado por su cuenta, y con `myProfile`
    // en null nadie llevaba al usuario a elegirlo: se iba directo al inicio.
    await Promise.all([
      myLoaded.value ? Promise.resolve() : fetchMy(),
      ensureProfileLoaded(),
    ]);
  }

  /** Al cerrar sesión, lo de la organización anterior no debe sobrevivir. */
  function reset(): void {
    catalog.value = [];
    myPlugins.value = [];
    requests.value = [];
    currentQuote.value = null;
    businessProfiles.value = [];
    myProfile.value = null;
    recommendations.value = null;
    lastBatchResults.value = null;
    profileLoaded.value = false;
    myLoaded.value = false;
    clearError();
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

  async function ensureProfileLoaded(): Promise<void> {
    if (profileLoaded.value) return;
    try {
      myProfile.value = await pluginApi.getMyBusinessProfile();
      profileLoaded.value = true;
    } catch (e) {
      setError(e);
    }
  }

  async function fetchBusinessProfiles(): Promise<void> {
    loading.value = true;
    clearError();
    try {
      businessProfiles.value = await pluginApi.businessProfiles();
    } catch (e) {
      setError(e);
    } finally {
      loading.value = false;
    }
  }

  /**
   * Elige (o descarta, `code: null`) el perfil de negocio y refresca el estado
   * local. Devuelve false si el backend lo rechazó (p. ej. sin plugins:manage).
   */
  async function chooseProfile(code: string | null, source: 'onboarding' | 'settings'): Promise<boolean> {
    profileSaving.value = true;
    clearError();
    try {
      myProfile.value = await pluginApi.chooseBusinessProfile(code, source);
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      profileSaving.value = false;
    }
  }

  async function fetchRecommendations(code: string): Promise<boolean> {
    clearError();
    loading.value = true;
    try {
      recommendations.value = await pluginApi.recommendations(code);
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      loading.value = false;
    }
  }

  /** Activa un lote de códigos y deja el resultado en `lastBatchResults` para la alerta de inicio. */
  async function activateBatch(codes: string[]): Promise<boolean> {
    saving.value = true;
    clearError();
    try {
      lastBatchResults.value = await pluginApi.activateBatch(codes);
      await fetchMy();
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
    businessProfiles,
    myProfile,
    recommendations,
    lastBatchResults,
    loading,
    saving,
    profileSaving,
    error,
    errorCode,
    errorDetails,
    activeCodes,
    myLoaded,
    profileLoaded,
    profilePending,
    isActive,
    ensureMyLoaded,
    reset,
    clearError,
    fetchCatalog,
    fetchMy,
    fetchRequests,
    fetchQuote,
    activate,
    deactivate,
    requestCustom,
    ensureProfileLoaded,
    fetchBusinessProfiles,
    chooseProfile,
    fetchRecommendations,
    activateBatch,
  };
});
