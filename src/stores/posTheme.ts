import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { posThemeApi } from '@/api/posThemes';
import { extractError } from '@/utils/error';
import type { EmissionPointDTO } from '@/types/organization';
import type {
  ContrastPair,
  PosThemeConfig,
  PosThemeDTO,
  PosThemeErrorBody,
  PosThemeSummaryDTO,
} from '@/types/posTheme';

export const usePosThemeStore = defineStore('posTheme', () => {
  const themes = ref<PosThemeSummaryDTO[]>([]);
  const current = ref<PosThemeDTO | null>(null);
  const loaded = ref(false);

  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  const errorCode = ref<string | null>(null);
  const errorDetails = ref<string[]>([]);
  /** LOW_CONTRAST: los pares que no se leen, para señalar los campos concretos en
   * el editor en vez de soltar solo "contraste bajo". */
  const errorPairs = ref<ContrastPair[]>([]);
  /** POS_THEME_IN_USE: cuántos puntos lo tienen, para decir cuántos hay que
   * desvincular antes de poder borrarlo. */
  const errorAssignedPointsCount = ref<number | null>(null);

  const defaultTheme = computed(() => themes.value.find((t) => t.isDefault) ?? null);

  function setError(e: unknown): void {
    // OJO: el errorHandler de organization-service hace spread de `extra` en la
    // RAÍZ del body. Por eso `pairs` y `assignedPointsCount` se leen aquí y no
    // en `body.extra`: en la raíz, y por eso llegan en el tipo del body.
    const body = (e as { response?: { data?: PosThemeErrorBody } })?.response?.data;
    error.value = extractError(e);
    errorCode.value = body?.code ?? null;
    errorDetails.value = (body?.details ?? []).map((d) => d.message);
    errorPairs.value = body?.pairs ?? [];
    errorAssignedPointsCount.value = body?.assignedPointsCount ?? null;
  }

  function clearError(): void {
    error.value = null;
    errorCode.value = null;
    errorDetails.value = [];
    errorPairs.value = [];
    errorAssignedPointsCount.value = null;
  }

  async function fetchThemes(): Promise<void> {
    loading.value = true;
    clearError();
    try {
      themes.value = await posThemeApi.list();
      loaded.value = true;
    } catch (e) {
      setError(e);
    } finally {
      loading.value = false;
    }
  }

  async function fetchTheme(themeId: string): Promise<void> {
    loading.value = true;
    clearError();
    try {
      current.value = await posThemeApi.get(themeId);
    } catch (e) {
      setError(e);
      current.value = null;
    } finally {
      loading.value = false;
    }
  }

  /** Crea y devuelve el tema guardado para que el editor pueda seguir editando
   * sobre el `id` real (el `version` del alta es el que usa el ETag después). */
  async function createTheme(name: string, config: PosThemeConfig): Promise<PosThemeDTO | null> {
    saving.value = true;
    clearError();
    try {
      current.value = await posThemeApi.create({ name, config });
      await fetchThemes();
      return current.value;
    } catch (e) {
      setError(e);
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function updateTheme(themeId: string, name: string, config: PosThemeConfig): Promise<boolean> {
    saving.value = true;
    clearError();
    try {
      current.value = await posThemeApi.update(themeId, { name, config });
      await fetchThemes();
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      saving.value = false;
    }
  }

  async function deleteTheme(themeId: string): Promise<boolean> {
    saving.value = true;
    clearError();
    try {
      await posThemeApi.remove(themeId);
      if (current.value?.id === themeId) current.value = null;
      await fetchThemes();
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      saving.value = false;
    }
  }

  async function makeDefault(themeId: string): Promise<boolean> {
    saving.value = true;
    clearError();
    try {
      current.value = await posThemeApi.makeDefault(themeId);
      await fetchThemes();
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      saving.value = false;
    }
  }

  /**
   * Asigna (o quita, con `null`) el tema de un punto. No toca la lista de temas
   * pero sí la de puntos, así que quien la pinte debe recargarla: el `posThemeId`
   * que llega en el punto es el nuevo.
   */
  async function assignToPoint(
    establishmentId: string,
    pointId: string,
    themeId: string | null,
  ): Promise<EmissionPointDTO | null> {
    saving.value = true;
    clearError();
    try {
      return await posThemeApi.assignToPoint(establishmentId, pointId, { themeId });
    } catch (e) {
      setError(e);
      return null;
    } finally {
      saving.value = false;
    }
  }

  /**
   * Llega por el socket cuando otro usuario (o el propio POS) cambia un tema.
   * El aviso solo trae `{ event, organizationId, themeId }`: el config se pide
   * por REST, igual que lo hace la caja. Si el editor está abierto sobre ese
   * tema, se recarga para no estar guardando encima de la versión de otro.
   */
  async function onThemeChanged(themeId: string | null): Promise<void> {
    await fetchThemes();
    if (themeId && current.value?.id === themeId) {
      await fetchTheme(themeId);
    }
  }

  /** Al cerrar sesión no debe sobrevivir nada de la organización anterior. */
  function reset(): void {
    themes.value = [];
    current.value = null;
    loaded.value = false;
    clearError();
  }

  return {
    themes,
    current,
    loaded,
    loading,
    saving,
    error,
    errorCode,
    errorDetails,
    errorPairs,
    errorAssignedPointsCount,
    defaultTheme,
    setError,
    clearError,
    fetchThemes,
    fetchTheme,
    createTheme,
    updateTheme,
    deleteTheme,
    makeDefault,
    assignToPoint,
    onThemeChanged,
    reset,
  };
});
