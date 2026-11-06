import { ref } from 'vue';
import { extractError } from '@/utils/error';

/**
 * Los avisos breves de toda la app (REGLAS-FRONT.md R-30, R-31). Hay UN solo lugar que los pinta: el `v-snackbar-queue` de
 * App.vue. Las vistas no escriben `<v-snackbar>`: llaman `notify.success(...)`, `notify.error(err)` o `notify.undoable(...)`.
 *
 * Tiempos fijos para que todo el CRM se comporte igual: éxito 4 s, «Deshacer» 6 s, error hasta que la persona lo cierra (un error
 * que se va solo a los 3 s nadie alcanza a leerlo). Se ven de a uno; los que llegan mientras hay otro esperan su turno.
 *
 * Funciona también fuera de componentes (stores, utilidades): es estado de módulo, como `extractError`.
 */
export interface NoticeItem {
  text: string;
  color: string;
  timeout: number;
  /** Texto y acción del botón extra (p. ej. «Deshacer»). Va con prefijo `data-` para que, si Vuetify lo pasa al DOM, sea inocuo. */
  'data-action-text'?: string;
  onAction?: () => void;
}

const queue = ref<NoticeItem[]>([]);

function push(item: NoticeItem): void {
  queue.value = [...queue.value, item];
}

export const notify = {
  success(text: string): void {
    push({ text, color: 'success', timeout: 4000 });
  },
  info(text: string): void {
    push({ text, color: 'info', timeout: 4000 });
  },
  /** Acepta el error tal cual (lo traduce `extractError`) o un texto ya escrito. */
  error(err: unknown): void {
    push({ text: typeof err === 'string' ? err : extractError(err), color: 'error', timeout: -1 });
  },
  /** Algo reversible que ya se hizo (archivar, mover, borrar en lote): el aviso ofrece deshacerlo. */
  undoable(text: string, actionText: string, onAction: () => void): void {
    push({ text, color: 'surface-variant', timeout: 6000, 'data-action-text': actionText, onAction });
  },
};

export function useNotify(): typeof notify {
  return notify;
}

/** Solo para App.vue: la cola que consume el `v-snackbar-queue`. */
export function useNoticeQueue() {
  return queue;
}
