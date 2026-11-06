import { shallowRef } from 'vue';

/**
 * Toda confirmación de la app (REGLAS-FRONT.md R-22): nunca `window.confirm()`, que no sigue el tema, ni el idioma de sus botones,
 * ni se ve bien en el teléfono. Un solo `ConfirmDialog` en App.vue la pinta; quien pregunta solo espera la respuesta:
 *
 *   if (!(await confirm({ title: t('…'), text: t('…'), confirmText: t('common.delete'), destructive: true }))) return;
 *
 * Qué se confirma: lo IRREVERSIBLE o lo que afecta a otros. Lo reversible (archivar, mover, completar) no se pregunta: se hace y se
 * ofrece «Deshacer» con `notify.undoable`.
 */
export interface ConfirmOptions {
  /** La pregunta, con el nombre de lo afectado: «¿Eliminar el proyecto «Cierre mensual»?» */
  title: string;
  /** La consecuencia: «Se eliminan sus 34 tareas. No se puede deshacer.» */
  text?: string;
  /** El verbo del botón («Eliminar», «Desactivar»). Por defecto, «Confirmar». */
  confirmText?: string;
  /** Pinta el botón en `error`: para borrar, desactivar, revocar. */
  destructive?: boolean;
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

const pending = shallowRef<Pending | null>(null);

export function confirm(options: ConfirmOptions): Promise<boolean> {
  // Si ya había una pregunta abierta (doble clic), la anterior cuenta como cancelada.
  pending.value?.resolve(false);
  return new Promise((resolve) => {
    pending.value = { ...options, resolve };
  });
}

export function useConfirm(): typeof confirm {
  return confirm;
}

/** Solo para ConfirmDialog.vue. */
export function usePendingConfirm() {
  return {
    pending,
    answer(ok: boolean): void {
      const current = pending.value;
      pending.value = null;
      current?.resolve(ok);
    },
  };
}
