import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { pluginApi } from '@/api/plugins';
import { usePluginsStore } from '@/stores/plugins';
import { extractError } from '@/utils/error';
import type { CartQuote } from '@/types/plugins';

const STORAGE_KEY = 'crm.plugin-cart';

function load(): string[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

function save(codes: string[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
  } catch {
    /* el carrito sigue funcionando en memoria */
  }
}

/**
 * El carrito de módulos: los que la persona quiere activar juntos. Vive en la sesión del navegador (no en el servidor):
 * es una intención, no un dato. Cada cambio se vuelve a cotizar en el servidor, que es quien sabe qué comparten los
 * módulos, qué ya está activo y cuánto cuesta con IVA, descuento y prueba gratis.
 */
export const usePluginCartStore = defineStore('pluginCart', () => {
  const codes = ref<string[]>(load());
  const quote = ref<CartQuote | null>(null);
  const quoting = ref(false);
  const activating = ref(false);
  const open = ref(false);
  /** Código de descuento escrito; solo viaja al activar si la cotización lo aceptó (`quote.discount`). */
  const discountInput = ref('');
  const error = ref<string | null>(null);
  /** Módulos que se quitaron solos del carrito porque ya no se pueden activar, para avisarlo. */
  const dropped = ref<string[]>([]);
  /** Cuántos módulos activó la última compra; la pantalla lo muestra una vez. */
  const lastActivated = ref<number | null>(null);

  const count = computed(() => codes.value.length);
  const has = (code: string): boolean => codes.value.includes(code);

  function persist(): void {
    save(codes.value);
  }

  function add(code: string): void {
    if (!has(code)) codes.value = [...codes.value, code];
    persist();
  }

  function remove(code: string): void {
    codes.value = codes.value.filter((c) => c !== code);
    persist();
    void refresh();
  }

  function toggle(code: string): void {
    if (has(code)) remove(code);
    else add(code);
  }

  function clear(): void {
    codes.value = [];
    quote.value = null;
    discountInput.value = '';
    error.value = null;
    dropped.value = [];
    persist();
  }

  /** Al cerrar sesión: el carrito de una organización no debe sobrevivir a la siguiente. */
  function reset(): void {
    clear();
    open.value = false;
    lastActivated.value = null;
  }

  /** Vuelve a cotizar el carrito. `discountCode`: el que se acaba de escribir; si no, se conserva el aceptado. */
  async function refresh(discountCode?: string): Promise<void> {
    error.value = null;
    if (codes.value.length === 0) {
      quote.value = null;
      return;
    }
    quoting.value = true;
    try {
      const code = discountCode ?? quote.value?.discount?.code;
      const q = await pluginApi.cartQuote(codes.value, code);
      // Lo que ya no se puede activar, o que ya está activo, sobra en el carrito: se quita y se avisa.
      const activeSelected = q.items.filter((i) => i.kind === 'already_active').map((i) => i.plugin.code);
      const gone = [...q.invalid.map((i) => i.code), ...activeSelected.filter((c) => codes.value.includes(c))];
      if (gone.length) {
        dropped.value = gone;
        codes.value = codes.value.filter((c) => !gone.includes(c));
        persist();
        if (codes.value.length === 0) {
          quote.value = null;
          return;
        }
        return refresh(code);
      }
      quote.value = q;
    } catch (e) {
      error.value = extractError(e);
    } finally {
      quoting.value = false;
    }
  }

  async function openCart(): Promise<void> {
    open.value = true;
    dropped.value = [];
    await refresh();
  }

  async function applyDiscount(): Promise<void> {
    if (!discountInput.value.trim()) return;
    await refresh(discountInput.value.trim());
  }

  async function removeDiscount(): Promise<void> {
    discountInput.value = '';
    quote.value = quote.value ? { ...quote.value, discount: undefined, discount_error: undefined } : null;
    await refresh('');
  }

  /** Activa todo el carrito. Todo o nada: si el servidor rechaza algo, no se activa nada y el carrito queda como estaba. */
  async function checkout(): Promise<boolean> {
    if (codes.value.length === 0) return false;
    activating.value = true;
    error.value = null;
    try {
      const done = await pluginApi.cartActivate(codes.value, quote.value?.discount?.code);
      lastActivated.value = done.length;
      const plugins = usePluginsStore();
      await Promise.all([plugins.fetchMy(), plugins.fetchCatalog()]);
      clear();
      open.value = false;
      return true;
    } catch (e) {
      error.value = extractError(e);
      return false;
    } finally {
      activating.value = false;
    }
  }

  return {
    codes,
    quote,
    quoting,
    activating,
    open,
    discountInput,
    error,
    dropped,
    lastActivated,
    count,
    has,
    add,
    remove,
    toggle,
    clear,
    reset,
    refresh,
    openCart,
    applyDiscount,
    removeDiscount,
    checkout,
  };
});
