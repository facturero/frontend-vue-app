import { ref } from 'vue';

/**
 * La celebración al completar una tarea, como la de Asana: un detalle que la gente asocia con el producto y se nota en una demo.
 * Se puede apagar (preferencia de cada persona, en este navegador) y no se muestra a quien pidió menos movimiento en su sistema.
 *
 * El estado es de módulo: cualquier pantalla llama a `celebrate()` y el `<TaskCelebration>` montado en ella reacciona.
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

function prefersReducedMotion(): boolean {
  // Por JS y no con `@media` en una hoja de estilos: el guardián de UI no admite media queries propias.
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function useCelebration() {
  function celebrate(): void {
    if (enabled.value && !prefersReducedMotion()) tick.value += 1;
  }

  function setEnabled(value: boolean): void {
    enabled.value = value;
    try {
      localStorage.setItem(KEY, value ? 'on' : 'off');
    } catch {
      // Sin almacenamiento (modo privado): vale para esta sesión.
    }
  }

  return { enabled, tick, celebrate, setEnabled };
}
