import { ref } from 'vue';

/**
 * La celebración al completar una tarea, como la de Asana: un detalle que la gente asocia con el producto y se nota en una demo.
 * Se puede apagar (preferencia de cada persona, en este navegador) y no se muestra a quien pidió menos movimiento en su sistema.
 *
 * El estado es de módulo: cualquier pantalla llama a `celebrate()` y el `<TaskCelebration>` montado en ella reacciona.
 *
 * El confeti sale de donde se marcó la tarea (el check de la tarjeta, de la subtarea, «Marcar como finalizada»), no del centro de
 * la pantalla: con el panel de la tarea abierto, el centro queda detrás del velo y la animación se veía lejos de lo que se hizo (lo
 * vio un cliente). El store no sabe qué se pulsó, así que se recuerda el último clic; con el teclado, el control enfocado.
 */
const KEY = 'projects.celebrations';

function readEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

const enabled = ref(readEnabled());
/** Sube en cada celebración: el componente la observa y dispara una nueva animación. */
const tick = ref(0);
/** Punto de la pantalla (px) desde el que sale la última celebración; `null` = centro, como antes. */
const origin = ref<{ x: number; y: number } | null>(null);

/** Un clic más viejo que esto ya no es el que completó la tarea (la respuesta del servidor llega en menos). */
const POINTER_MAX_AGE_MS = 5_000;
let lastPointer: { x: number; y: number; at: number } | null = null;
let listening = false;

function listen(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  // En captura y pasivo: se anota antes de que nadie detenga el evento y sin frenar el clic.
  window.addEventListener('pointerdown', (e) => (lastPointer = { x: e.clientX, y: e.clientY, at: Date.now() }), { capture: true, passive: true });
}

function currentOrigin(): { x: number; y: number } | null {
  if (lastPointer && Date.now() - lastPointer.at < POINTER_MAX_AGE_MS) return { x: lastPointer.x, y: lastPointer.y };
  const el = typeof document !== 'undefined' ? document.activeElement : null;
  if (el instanceof HTMLElement && el !== document.body) {
    const r = el.getBoundingClientRect();
    if (r.width || r.height) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return null;
}

function prefersReducedMotion(): boolean {
  // Por JS y no con `@media` en una hoja de estilos: el guardián de UI no admite media queries propias.
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function useCelebration() {
  listen();

  function celebrate(): void {
    if (!enabled.value || prefersReducedMotion()) return;
    origin.value = currentOrigin();
    tick.value += 1;
  }

  function setEnabled(value: boolean): void {
    enabled.value = value;
    try {
      localStorage.setItem(KEY, value ? 'on' : 'off');
    } catch {
      // Sin almacenamiento (modo privado): vale para esta sesión.
    }
  }

  return { enabled, tick, origin, celebrate, setEnabled };
}
