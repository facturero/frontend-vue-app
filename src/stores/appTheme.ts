import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import vuetify from '@/plugins/vuetify';
import { themesApi } from '@/api/themes';
import { useAuthStore } from '@/stores/auth';
import {
  configFromBase,
  deriveThemeColors,
  isBuiltinRef,
  isUsableConfig,
  presetOf,
  type AppThemeConfig,
  type AppThemeDTO,
  type ThemeRef,
  type ThemeSettings,
} from '@/types/appTheme';

/**
 * El tema con que se pinta la aplicación (docs/TEMAS.md): claro, oscuro, «como el sistema» o uno de los que creó la empresa.
 *
 * Qué tema toca: si la empresa lo fijó y quien mira no administra la organización, el de la empresa; si no, el que eligió la
 * persona; si no eligió, el de la empresa; y si nada, claro. Se pinta registrando el tema en Vuetify en caliente
 * (`theme.themes[nombre] = …` + `theme.change`), así todo lo que ya usa tokens cambia solo.
 *
 * El último tema pintado se guarda en el navegador y se aplica antes de montar la aplicación (`applyCachedTheme`): sin eso, cada
 * recarga enseñaría el claro un instante antes de pedir los temas al servidor.
 */

const CACHE_KEY = 'crm:app-theme';
const PREVIEW_NAME = 'app-preview';

interface CachedTheme {
  name: string;
  dark: boolean;
  colors: Record<string, string>;
}

function readCache(): CachedTheme | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const c = raw ? (JSON.parse(raw) as CachedTheme) : null;
    return c && typeof c.name === 'string' && typeof c.dark === 'boolean' && c.colors && typeof c.colors === 'object' ? c : null;
  } catch {
    return null;
  }
}

function writeCache(value: CachedTheme | null): void {
  try {
    if (value) localStorage.setItem(CACHE_KEY, JSON.stringify(value));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    // modo privado o almacenamiento lleno: solo se pierde el «sin destello» de la próxima recarga
  }
}

/** Colores del tema integrado de una base (`light`/`dark` de plugins/vuetify.ts): de ellos parte cada tema propio. */
export function baseColorsOf(base: 'light' | 'dark'): Record<string, string> {
  return { ...(vuetify.theme.themes.value[base]?.colors ?? {}) } as Record<string, string>;
}

function register(name: string, dark: boolean, colors: Record<string, string>): void {
  const base = vuetify.theme.themes.value[dark ? 'dark' : 'light'];
  vuetify.theme.themes.value[name] = { ...base, dark, colors: colors as typeof base.colors };
}

/** Velo de los diálogos según el tema (base.css, bloque 4 bis): en un tema oscuro, el 32 % de Vuetify no separa el diálogo. */
function setScrim(name: string): void {
  const dark = vuetify.theme.themes.value[name]?.dark ?? false;
  document.documentElement.style.setProperty('--app-scrim-opacity', dark ? '0.6' : '0.32');
}

function show(name: string): void {
  if (vuetify.theme.name.value !== name) void vuetify.theme.change(name);
  setScrim(name);
}

/** Antes de montar: el último tema pintado, si hay sesión. Sin sesión (inicio de sesión, alta) siempre claro. */
export function applyCachedTheme(hasSession: boolean): void {
  const cached = hasSession ? readCache() : null;
  if (!cached) return;
  if (!isBuiltinRef(cached.name)) register(cached.name, cached.dark, cached.colors);
  vuetify.theme.change(cached.name);
  setScrim(cached.name);
}

const systemDark = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export const useAppThemeStore = defineStore('appTheme', () => {
  const auth = useAuthStore();
  const themes = ref<AppThemeDTO[]>([]);
  const settings = ref<ThemeSettings>({ defaultTheme: 'light', enforced: false });
  const myChoice = ref<ThemeRef | null>(null);
  const loaded = ref(false);
  /** Mientras el editor está abierto, la aplicación entera se pinta con lo que se está editando: esa es la vista previa. */
  const preview = ref<AppThemeConfig | null>(null);

  const isAdmin = computed(() => auth.can('organization:admin'));
  /** La empresa fijó su tema y esta persona no lo puede cambiar. */
  const locked = computed(() => settings.value.enforced && !isAdmin.value);
  const effectiveRef = computed<ThemeRef>(() => (locked.value ? settings.value.defaultTheme : (myChoice.value ?? settings.value.defaultTheme)));

  function apply(): void {
    if (preview.value) {
      const colors = deriveThemeColors(preview.value, baseColorsOf(preview.value.base));
      register(PREVIEW_NAME, preview.value.base === 'dark', colors);
      show(PREVIEW_NAME);
      return;
    }
    let target = effectiveRef.value;
    if (target === 'system') target = systemDark?.matches ? 'dark' : 'light';
    if (target === 'light' || target === 'dark') {
      show(target);
      writeCache({ name: target, dark: target === 'dark', colors: {} });
      return;
    }
    // Un predefinido (`preset:*`, colores en types/appTheme.ts) o un tema propio de la empresa.
    const preset = presetOf(target);
    const own = preset ? null : themes.value.find((t) => t.id === target);
    const config = preset?.config ?? own?.config;
    if (!config || !isUsableConfig(config)) {
      show('light');
      writeCache(null);
      return;
    }
    const name = preset ? `preset-${preset.id}` : `app-${own!.id}`;
    const dark = config.base === 'dark';
    const colors = deriveThemeColors(config, baseColorsOf(config.base));
    register(name, dark, colors);
    show(name);
    writeCache({ name, dark, colors });
  }

  systemDark?.addEventListener('change', () => {
    if (effectiveRef.value === 'system') apply();
  });

  async function load(): Promise<void> {
    try {
      const state = await themesApi.getState();
      themes.value = state.themes;
      settings.value = state.settings;
      myChoice.value = state.myChoice;
      loaded.value = true;
    } catch {
      // Sin servicio de temas se queda lo que se ve (el de la caché o claro): el aspecto nunca bloquea el trabajo.
    }
    apply();
  }

  /** `null` = volver al de la empresa. Se pinta antes de que responda el servidor: elegir un tema tiene que sentirse inmediato. */
  async function choose(theme: ThemeRef | null): Promise<void> {
    const before = myChoice.value;
    myChoice.value = theme;
    apply();
    try {
      await themesApi.saveMyChoice(theme);
    } catch (e) {
      myChoice.value = before;
      apply();
      throw e;
    }
  }

  async function saveSettings(next: ThemeSettings): Promise<void> {
    settings.value = await themesApi.saveSettings(next);
    apply();
  }

  async function create(name: string, config: AppThemeConfig): Promise<AppThemeDTO> {
    const theme = await themesApi.create({ name, config });
    await load();
    return theme;
  }

  async function update(id: string, name: string, config: AppThemeConfig): Promise<void> {
    await themesApi.update(id, { name, config });
    await load();
  }

  async function remove(id: string): Promise<void> {
    await themesApi.remove(id);
    await load();
  }

  /**
   * Los colores del tema que se está viendo, como punto de partida de un tema nuevo: abrir el editor no tiene que cambiar nada en
   * pantalla. Claro, oscuro y «como el sistema» salen de los integrados; un predefinido o un tema propio, de su configuración.
   */
  function currentConfig(): AppThemeConfig {
    let target = effectiveRef.value;
    if (target === 'system') target = systemDark?.matches ? 'dark' : 'light';
    // Tal cual el integrado (sin separar el fondo de las tarjetas en oscuro): abrir el editor no cambia nada en pantalla.
    if (target === 'light' || target === 'dark') return configFromBase(target, baseColorsOf(target), { separateBackground: false });
    const config = presetOf(target)?.config ?? themes.value.find((t) => t.id === target)?.config;
    return config && isUsableConfig(config) ? structuredClone(config) : configFromBase('light', baseColorsOf('light'));
  }

  function startPreview(config: AppThemeConfig): void {
    preview.value = config;
    apply();
  }

  function stopPreview(): void {
    preview.value = null;
    apply();
  }

  /** Al cerrar sesión: el siguiente que entre en esta pestaña no hereda el tema de otra empresa. */
  function reset(): void {
    themes.value = [];
    settings.value = { defaultTheme: 'light', enforced: false };
    myChoice.value = null;
    loaded.value = false;
    preview.value = null;
    writeCache(null);
    show('light');
  }

  return {
    themes, settings, myChoice, loaded, preview, isAdmin, locked, effectiveRef,
    load, choose, saveSettings, create, update, remove, startPreview, stopPreview, reset, apply, currentConfig,
  };
});
