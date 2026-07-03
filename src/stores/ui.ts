import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * Estado de la UI del panel (layout). Compartido entre el app bar y el
 * navigation drawer para que la hamburguesa y el sidebar estén sincronizados.
 *
 * - drawer: abierto/cerrado (relevante sobre todo en móvil, modo temporary).
 * - rail:   colapsado a solo-iconos (relevante en desktop, modo permanent).
 */
export const useUiStore = defineStore('ui', () => {
  const drawer = ref(true);
  const rail = ref(true);

  function toggleDrawer(): void {
    drawer.value = !drawer.value;
  }
  function toggleRail(): void {
    rail.value = !rail.value;
  }
  function setDrawer(value: boolean): void {
    drawer.value = value;
  }

  return { drawer, rail, toggleDrawer, toggleRail, setDrawer };
});
