import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { posApi } from '@/api/pos';
import { useAuthStore } from '@/stores/auth';
import { defaultPosThemeConfig, type PosThemeConfig } from '@/types/posTheme';
import { derivePosVars, resolvePosMode, sanitizePosTheme, type PosMode } from '@/utils/pos-theme';

/**
 * El aspecto de la caja web: el tema que la organización definió para sus cajas (colores, columnas, ancho del carrito, logo…), el
 * mismo que pinta la caja de escritorio. Si no se puede pedir (el cajero no tiene permiso de lectura de la organización, o no hay
 * red), la caja se ve con el tema integrado «Clásico» y sigue funcionando: el aspecto nunca bloquea una venta.
 *
 * La última versión pedida se guarda en el navegador para pintar al instante la próxima vez, sin destello del tema integrado.
 */
const MODE_KEY = 'pos:mode';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sin almacenamiento: el tema se pide en cada arranque y ya
  }
}

export const usePosCashierThemeStore = defineStore('posCashierTheme', () => {
  const auth = useAuthStore();

  const config = ref<PosThemeConfig>(defaultPosThemeConfig());
  const themeName = ref<string | null>(null);
  const cashierMode = ref<PosMode | null>(null);
  const now = ref(Date.now());

  const mode = computed<PosMode>(() => resolvePosMode(config.value, cashierMode.value, new Date(now.value)));
  const vars = computed(() => derivePosVars(config.value, mode.value));
  const canToggleMode = computed(() => config.value.allowCashierToggle);

  function scope(): string {
    const user = auth.user as { id?: string; orgId?: string | null } | null;
    return `${user?.orgId ?? 'sin-org'}:${user?.id ?? 'sin-usuario'}`;
  }

  /** Lo guardado la última vez, para pintar ya; después `load` lo corrige con lo que diga el CRM. */
  function restore(): void {
    const saved = read<unknown>(`pos:theme:${scope()}`);
    if (saved) config.value = sanitizePosTheme(saved);
    const m = read<PosMode>(MODE_KEY);
    cashierMode.value = m === 'light' || m === 'dark' ? m : null;
  }

  async function load(establishmentId: string, emissionPointId: string): Promise<void> {
    try {
      const res = await posApi.theme(establishmentId, emissionPointId);
      const next = res.config ? sanitizePosTheme(res.config) : defaultPosThemeConfig();
      config.value = next;
      themeName.value = res.name;
      write(`pos:theme:${scope()}`, next);
    } catch {
      // sin permiso o sin red: se queda con lo que había (lo guardado o el integrado)
    }
  }

  function toggleMode(): void {
    cashierMode.value = mode.value === 'dark' ? 'light' : 'dark';
    write(MODE_KEY, cashierMode.value);
  }

  /** Para el modo por horario: se llama cada minuto desde la pantalla. */
  function tick(): void {
    now.value = Date.now();
  }

  return { config, themeName, mode, vars, canToggleMode, restore, load, toggleMode, tick };
});
