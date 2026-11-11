import type { CustomField, DirectoryUser, FieldType, FieldValue, LinkEntity, MyTask, ProjectColor, ProjectHealth } from '@/types/projects';
import { localIsoDate } from './isoDate';

// Vive en utils/isoDate.ts (la usan otros módulos); se reexporta aquí para no tocar los imports de Proyectos.
export { localIsoDate };

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return localIsoDate(new Date(y!, m! - 1, d! + days));
}

export type DueState = 'overdue' | 'today' | 'soon' | 'later' | 'none';

/** Cómo se pinta una fecha de entrega: vencida en rojo, hoy/mañana en verde, como Asana. Una tarea finalizada ya no «vence». */
export function dueState(dueOn: string | null, today: string, completed = false): DueState {
  if (!dueOn || completed) return 'none';
  if (dueOn < today) return 'overdue';
  if (dueOn === today) return 'today';
  if (dueOn <= addDays(today, 1)) return 'soon';
  return 'later';
}

export const DUE_COLOR: Record<DueState, string | undefined> = {
  overdue: 'error',
  today: 'success',
  soon: 'success',
  later: undefined,
  none: undefined,
};

export type MyTasksGroup = 'recent' | 'today' | 'upcoming' | 'later';
export const MY_TASKS_GROUPS: MyTasksGroup[] = ['recent', 'today', 'upcoming', 'later'];

/**
 * Los grupos de «Mis tareas» de Asana:
 *   - Hoy: vence hoy o ya venció (lo urgente primero, aunque se haya asignado hace un minuto);
 *   - Próximas: vence en los próximos 7 días;
 *   - Recién asignadas: sin fecha (o con fecha lejana) y asignada en los últimos 3 días;
 *   - Más tarde: todo lo demás.
 * Dentro de cada grupo: por fecha de entrega y, sin fecha, por cuándo se asignó.
 */
export function groupMyTasks(tasks: MyTask[], today: string, now: Date = new Date()): Record<MyTasksGroup, MyTask[]> {
  const groups: Record<MyTasksGroup, MyTask[]> = { recent: [], today: [], upcoming: [], later: [] };
  const week = addDays(today, 7);
  const recentSince = now.getTime() - 3 * 24 * 3600 * 1000;
  for (const t of tasks) {
    if (t.dueOn && t.dueOn <= today) groups.today.push(t);
    else if (t.dueOn && t.dueOn <= week) groups.upcoming.push(t);
    else if (new Date(t.assignedAt ?? t.createdAt).getTime() >= recentSince) groups.recent.push(t);
    else groups.later.push(t);
  }
  const byDue = (a: MyTask, b: MyTask) =>
    (a.dueOn ?? '9999') .localeCompare(b.dueOn ?? '9999') || (a.assignedAt ?? a.createdAt).localeCompare(b.assignedAt ?? b.createdAt);
  for (const g of MY_TASKS_GROUPS) groups[g].sort(byDue);
  return groups;
}

/**
 * Vecinas de un elemento tras soltarlo en una lista: lo que el servidor necesita para darle su posición (`beforeId`/`afterId`). Se
 * calculan sobre la lista COMPLETA de la columna (también las tarjetas ocultas por un filtro): el servidor ordena contra la misma.
 */
export function neighbours<T extends { id: string }>(list: T[], id: string): { beforeId: string | null; afterId: string | null } {
  const i = list.findIndex((x) => x.id === id);
  if (i === -1) return { beforeId: null, afterId: null };
  return { beforeId: list[i - 1]?.id ?? null, afterId: list[i + 1]?.id ?? null };
}

const AVATAR_COLORS: ProjectColor[] = ['primary', 'secondary', 'success', 'warning', 'info', 'error'];

/** Color estable por persona (el mismo en todas las pantallas), siempre un token del tema. */
export function avatarColor(userId: string): ProjectColor {
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

export function displayName(user: DirectoryUser | undefined): string {
  return user ? (user.fullName?.trim() || user.email) : '';
}

export function initials(user: DirectoryUser | undefined): string {
  const name = displayName(user);
  if (!name) return '?';
  const parts = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

/** Color de cada estado del proyecto (como el semáforo de Asana), siempre un token del tema. */
export const HEALTH_COLOR: Record<ProjectHealth, string> = { on_track: 'success', at_risk: 'warning', off_track: 'error', complete: 'info' };

// ── Entregable 4 ──────────────────────────────────────────────────────────────
export const PROJECT_COLORS: ProjectColor[] = ['primary', 'secondary', 'success', 'warning', 'error', 'info'];

/** Colores para elegir al crear una etiqueta: sin `info`, que en el tema es casi el mismo azul que `primary` y no se distinguían. */
export const TAG_COLORS: ProjectColor[] = PROJECT_COLORS.filter((c) => c !== 'info');

/** Icono de cada tipo de registro del ERP al que se vincula una tarea. */
export const LINK_ICON: Record<LinkEntity, string> = {
  customer: 'mdi-account-tie-outline',
  invoice: 'mdi-receipt-text-outline',
  quote: 'mdi-file-document-edit-outline',
  purchase_order: 'mdi-cart-arrow-down',
  product: 'mdi-package-variant-closed',
};

/** Pantalla del registro vinculado; las cotizaciones aún no tienen pantalla propia. */
export function linkRoute(entityType: LinkEntity, entityId: string): string | null {
  switch (entityType) {
    case 'customer':
      return `/customers/${entityId}`;
    case 'invoice':
      return `/invoices/${entityId}`;
    case 'purchase_order':
      return `/purchasing/orders/${entityId}`;
    case 'product':
      return `/products/${entityId}`;
    default:
      return null;
  }
}

export const FIELD_ICON: Record<FieldType, string> = {
  text: 'mdi-form-textbox',
  number: 'mdi-pound',
  select: 'mdi-form-dropdown',
  date: 'mdi-calendar-outline',
  person: 'mdi-account-outline',
};

/** Texto de un valor de campo personalizado para la lista (la opción por su nombre, la persona por su nombre, el número con formato local). */
export function fieldValueText(field: CustomField, value: FieldValue | null | undefined, users: Map<string, DirectoryUser>, locale: string): string {
  if (value === null || value === undefined || value === '') return '';
  switch (field.type) {
    case 'select':
      return field.options.find((o) => o.id === value)?.label ?? '';
    case 'person':
      return displayName(users.get(String(value))) || '';
    case 'number':
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(Number(value));
    case 'date': {
      const [y, m, d] = String(value).split('-').map(Number);
      return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(y!, m! - 1, d!));
    }
    default:
      return String(value);
  }
}

/**
 * Icono y color de un archivo por su tipo, para reconocerlo de un vistazo (lo pidió un cliente). Los colores son los que la gente
 * asocia a cada programa, con los tokens del tema (nunca hexadecimales):
 *
 *   Excel / CSV / ODS  verde (`success`)      PDF          rojo (`error`)
 *   Word / ODT / RTF   azul (`primary`)       PowerPoint   naranja (`warning`)
 *   Imagen             celeste (`secondary`)  el resto     sin color: XML y JSON con icono de código (facturas electrónicas),
 *                                                          texto, video, audio y comprimidos con el suyo
 *
 * Ojo: en este tema `secondary` es celeste (#49BEFF), no morado; antes PowerPoint salía celeste. Se decide por la extensión antes que
 * por el tipo MIME, porque muchos navegadores suben los documentos de Office como `application/octet-stream`. Lo usan la lista de
 * adjuntos y la ficha de archivo dentro de la descripción y los comentarios; `projects.test.ts` recorre todos los tipos.
 */
const FILE_KINDS: Array<{ icon: string; color: string | undefined; exts: string[]; mime: (m: string) => boolean }> = [
  { icon: 'mdi-file-pdf-box', color: 'error', exts: ['pdf'], mime: (m) => m === 'application/pdf' },
  { icon: 'mdi-file-excel-outline', color: 'success', exts: ['xlsx', 'xlsm', 'xls', 'csv', 'ods'], mime: (m) => m.includes('spreadsheet') || m.includes('excel') || m === 'text/csv' },
  { icon: 'mdi-file-powerpoint-outline', color: 'warning', exts: ['pptx', 'ppt', 'odp'], mime: (m) => m.includes('presentation') || m.includes('powerpoint') },
  { icon: 'mdi-file-word-outline', color: 'primary', exts: ['docx', 'doc', 'odt', 'rtf'], mime: (m) => m.includes('wordprocessing') || m.includes('msword') || m.includes('opendocument.text') || m === 'application/rtf' },
  { icon: 'mdi-file-image-outline', color: 'secondary', exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic'], mime: (m) => m.startsWith('image/') },
  { icon: 'mdi-file-code-outline', color: undefined, exts: ['xml', 'json'], mime: (m) => m.endsWith('/xml') || m.endsWith('+xml') || m === 'application/json' },
  { icon: 'mdi-file-video-outline', color: undefined, exts: ['mp4', 'mov', 'avi', 'mkv', 'webm'], mime: (m) => m.startsWith('video/') },
  { icon: 'mdi-file-music-outline', color: undefined, exts: ['mp3', 'wav', 'ogg', 'm4a'], mime: (m) => m.startsWith('audio/') },
  { icon: 'mdi-folder-zip-outline', color: undefined, exts: ['zip', 'rar', '7z', 'gz', 'tar'], mime: (m) => m.includes('zip') || m.includes('compressed') || m.includes('x-tar') },
  { icon: 'mdi-file-document-outline', color: undefined, exts: ['txt', 'md', 'log'], mime: (m) => m.startsWith('text/') },
];

export function fileKind(mimeType: string, fileName: string): { icon: string; color: string | undefined } {
  const mime = mimeType.toLowerCase();
  const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';
  const found = FILE_KINDS.find((k) => k.exts.includes(ext)) ?? FILE_KINDS.find((k) => k.mime(mime));
  return found ? { icon: found.icon, color: found.color } : { icon: 'mdi-file-outline', color: undefined };
}
