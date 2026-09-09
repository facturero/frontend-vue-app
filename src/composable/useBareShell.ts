import { computed, type ComputedRef } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

/**
 * Si la aplicación se enseña desnuda: sin menú lateral y con la barra superior
 * reducida a idioma, modo nocturno y cerrar sesión.
 *
 * Pasa por dos motivos distintos, y conviene no mezclarlos:
 *
 * - **Por estado**: el alta obligatoria sin terminar (`auth.isOnboarding`). No
 *   hay organización todavía, así que no hay nada que navegar.
 * - **Por ruta**: las pantallas del alta que son omitibles (`meta.bareShell`).
 *   Ahí sí hay organización, y el usuario recupera la aplicación entera en
 *   cuanto sale de esas pantallas, elija o no.
 *
 * Distinguirlos es justo lo que evita el fallo que tuvimos: colgar el adorno de
 * "aún no ha elegido perfil de negocio" dejaba la aplicación desnuda para
 * siempre a quien omitiera el paso.
 */
export function useBareShell(): ComputedRef<boolean> {
  const route = useRoute();
  const auth = useAuthStore();

  return computed(() => auth.isOnboarding || route.meta.bareShell === true);
}
