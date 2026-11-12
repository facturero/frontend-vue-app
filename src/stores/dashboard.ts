import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { dashboardApi, type DashboardItem } from '@/api/dashboard';
import { useAuthStore } from '@/stores/auth';
import { usePluginsStore } from '@/stores/plugins';
import { clampSize, GRID_COLUMNS, widgetByCode, WIDGETS, type WidgetDef } from '@/widgets/registry';
import { extractError } from '@/utils/error';

/**
 * El tablero de Inicio de la persona (por usuario y organización, guardado en auth-service).
 *
 * - Lo guardado puede tener widgets que ahora no se pueden ver (plugin desactivado, permiso quitado): no se pintan, pero SE CONSERVAN
 *   (al reactivar el plugin vuelven a su sitio). Por eso `items` es todo lo guardado y `visible` lo que se pinta.
 * - Sin tablero guardado se arma uno por defecto con los widgets `inDefault` disponibles; se guarda la primera vez que la persona lo
 *   cambia, no antes (así un cambio del tablero por defecto llega a quien nunca tocó el suyo).
 * - Los cambios se guardan solos, con un pequeño retardo para juntar los de un arrastre.
 */
const SAVE_DELAY_MS = 800;

export const useDashboardStore = defineStore('dashboard', () => {
  const items = ref<DashboardItem[]>([]);
  const loaded = ref(false);
  /** true cuando lo que se ve es el tablero por defecto (nunca guardado). */
  const isDefault = ref(false);
  const error = ref<string | null>(null);
  const saving = ref(false);

  function available(def: WidgetDef): boolean {
    const auth = useAuthStore();
    const plugins = usePluginsStore();
    return plugins.isActive(def.plugin) && (!def.permission || auth.can(def.permission));
  }

  /** Los widgets que esta persona puede añadir ahora. */
  const catalog = computed(() => WIDGETS.filter(available));

  /** Lo que se pinta: lo guardado que se reconoce y se puede ver, con su tamaño dentro de los límites del widget. */
  const visible = computed(() =>
    items.value.flatMap((item) => {
      const def = widgetByCode(item.widget);
      if (!def || !available(def)) return [];
      return [{ item: { ...item, ...clampSize(def, item.w, item.h) }, def }];
    }),
  );

  /** Coloca los widgets uno tras otro, de izquierda a derecha y por filas, sin huecos. */
  function pack(defs: WidgetDef[]): DashboardItem[] {
    const out: DashboardItem[] = [];
    let x = 0;
    let y = 0;
    let rowH = 0;
    for (const def of defs) {
      const { w, h } = def.size;
      if (x + w > GRID_COLUMNS) {
        x = 0;
        y += rowH;
        rowH = 0;
      }
      out.push({ i: newId(), widget: def.code, x, y, w, h });
      x += w;
      rowH = Math.max(rowH, h);
    }
    return out;
  }

  function defaultLayout(): DashboardItem[] {
    return pack(catalog.value.filter((d) => d.inDefault));
  }

  async function load(): Promise<void> {
    error.value = null;
    try {
      const saved = await dashboardApi.get();
      isDefault.value = !saved;
      items.value = saved ?? defaultLayout();
    } catch (err) {
      error.value = extractError(err);
      // Sin el servidor, el tablero por defecto: Inicio no se queda en blanco.
      isDefault.value = true;
      items.value = defaultLayout();
    } finally {
      loaded.value = true;
    }
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  function scheduleSave(): void {
    isDefault.value = false;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), SAVE_DELAY_MS);
  }

  async function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    saving.value = true;
    try {
      await dashboardApi.save(items.value);
      error.value = null;
    } catch (err) {
      error.value = extractError(err);
    } finally {
      saving.value = false;
    }
  }

  /** Al final del tablero, a lo ancho que mida el widget. */
  function add(code: string): void {
    const def = widgetByCode(code);
    if (!def) return;
    const bottom = items.value.reduce((n, it) => Math.max(n, it.y + it.h), 0);
    items.value = [...items.value, { i: newId(), widget: code, x: 0, y: bottom, w: def.size.w, h: def.size.h }];
    scheduleSave();
  }

  function remove(i: string): void {
    items.value = items.value.filter((it) => it.i !== i);
    scheduleSave();
  }

  /** Posiciones y tamaños tras arrastrar o redimensionar (solo los visibles cambian; los ocultos se quedan donde estaban). */
  function applyLayout(next: Array<{ i: string | number; x: number; y: number; w: number; h: number }>): void {
    const byId = new Map(next.map((n) => [String(n.i), n]));
    let changed = false;
    items.value = items.value.map((it) => {
      const n = byId.get(it.i);
      if (!n || (n.x === it.x && n.y === it.y && n.w === it.w && n.h === it.h)) return it;
      changed = true;
      return { ...it, x: n.x, y: n.y, w: n.w, h: n.h };
    });
    if (changed) scheduleSave();
  }

  function setConfig(i: string, config: Record<string, string | number | boolean>): void {
    items.value = items.value.map((it) => (it.i === i ? { ...it, config } : it));
    scheduleSave();
  }

  function reset(): void {
    items.value = defaultLayout();
    scheduleSave();
  }

  function clear(): void {
    items.value = [];
    loaded.value = false;
  }

  return { items, loaded, isDefault, error, saving, catalog, visible, load, add, remove, applyLayout, setConfig, reset, flush, clear, available };
});

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}
