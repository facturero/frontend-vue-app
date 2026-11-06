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
