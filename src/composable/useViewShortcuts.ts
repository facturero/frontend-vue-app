import { onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * Atajos de Asana a nivel de pantalla: Tab+Q agrega una tarea (manteniendo Tab y pulsando Q) y «?» abre la lista de atajos. Los del
 * detalle de una tarea (Tab+M, Tab+C…) viven en TaskDetailPanel. Nada se dispara mientras se escribe en un campo.
 */
export function useViewShortcuts(handlers: { quickAdd: () => void }) {
  const helpOpen = ref(false);
  let tabHeld = false;

  const typing = (target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
  };

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
      tabHeld = true;
      return;
    }
    if (typing(event.target)) return;
    if (tabHeld && event.key.toLowerCase() === 'q') {
      event.preventDefault();
      handlers.quickAdd();
    } else if (event.key === '?') {
      event.preventDefault();
      helpOpen.value = true;
    }
  }

  function onKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Tab') tabHeld = false;
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  });

  return { helpOpen };
}
