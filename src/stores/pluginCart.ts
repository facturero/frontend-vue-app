import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { pluginApi } from '@/api/plugins';
import { usePluginsStore } from '@/stores/plugins';
import { extractError } from '@/utils/error';
import type { CartQuote } from '@/types/plugins';

/**
 * El carrito de módulos: los que la organización quiere activar juntos. Vive en el SERVIDOR (por organización), no en el
 * navegador: quien lo arma puede recargar, cambiar de equipo o dejarlo para otro día y lo encuentra igual, y lo ve
 * cualquier administrador de la organización. Aquí se guarda una copia para pintar al instante; cada cambio se envía al
 * servidor y, si lo rechaza, se revierte. El precio, lo que comparten los módulos y lo que ya está activo los calcula el
 * servidor en cada cotización (IVA, descuento y prueba gratis incluidos).
 */
export const usePluginCartStore = defineStore('pluginCart', () => {
  const codes = ref<string[]>([]);
  const loaded = ref(false);
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

  /** Trae el carrito guardado de la organización. Un fallo aquí no bloquea nada: el carrito arranca vacío. */
  async function load(): Promise<void> {
    try {
      codes.value = (await pluginApi.cartGet()).map((i) => i.code);
      loaded.value = true;
    } catch {
      /* el carrito es una comodidad */
    }
  }

  async function add(code: string): Promise<void> {
    if (has(code)) return;
    codes.value = [...codes.value, code];
    try {
      await pluginApi.cartAdd(code);
    } catch (e) {
      codes.value = codes.value.filter((c) => c !== code);
      error.value = extractError(e);
    }
  }

  async function remove(code: string): Promise<void> {
    if (!has(code)) return;
    const before = codes.value;
    codes.value = codes.value.filter((c) => c !== code);
    try {
      await pluginApi.cartRemove(code);
    } catch (e) {
      codes.value = before;
      error.value = extractError(e);
      return;
    }
    await refresh();
  }

  async function toggle(code: string): Promise<void> {
    if (has(code)) await remove(code);
    else await add(code);
  }

  /** Vacía el carrito, también en el servidor. */
  async function clear(): Promise<void> {
    const before = codes.value;
    resetLocal();
    try {
      await pluginApi.cartClear();
    } catch (e) {
      codes.value = before;
      error.value = extractError(e);
    }
  }

  function resetLocal(): void {
    codes.value = [];
    quote.value = null;
    discountInput.value = '';
    error.value = null;
    dropped.value = [];
  }

  /** Al cerrar sesión: la copia local no debe sobrevivir a la siguiente sesión. El carrito guardado sigue en el servidor. */
  function reset(): void {
    resetLocal();
    loaded.value = false;
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
      // Lo que ya no se puede activar, o que ya está activo, sobra en el carrito: se quita (también del servidor) y se avisa.
      const activeSelected = q.items.filter((i) => i.kind === 'already_active').map((i) => i.plugin.code);
      const gone = [...q.invalid.map((i) => i.code), ...activeSelected.filter((c) => codes.value.includes(c))];
      if (gone.length) {
        dropped.value = gone;
        codes.value = codes.value.filter((c) => !gone.includes(c));
        for (const g of gone) void pluginApi.cartRemove(g).catch(() => undefined);
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
      // El servidor saca del carrito guardado lo que activa, en la misma operación.
      const done = await pluginApi.cartActivate(codes.value, quote.value?.discount?.code);
      lastActivated.value = done.length;
      const plugins = usePluginsStore();
      await Promise.all([plugins.fetchMy(), plugins.fetchCatalog()]);
      resetLocal();
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
    loaded,
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
    load,
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
