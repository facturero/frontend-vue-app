/**
 * Aritmética de fechas del cronograma y del calendario. Todo con fechas SIN hora (`YYYY-MM-DD`), como las guarda projects-service:
 * una entrega no cambia de día por la zona horaria. Se calcula con `Date.UTC` para que el cambio de hora (en otros países) no
 * convierta un día en 23 o 25 horas.
 */
const DAY = 86_400_000;

function utc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

export function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Días de `a` a `b` (positivo si `b` es posterior). */
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / DAY);
}

export function shiftDay(iso: string, days: number): string {
  return fromUtc(utc(iso) + days * DAY);
}

/** Lunes de la semana de esa fecha (la semana empieza el lunes, como en Ecuador y en Asana en español). */
export function mondayOf(iso: string): string {
  const weekday = new Date(utc(iso)).getUTCDay(); // 0 = domingo
  return shiftDay(iso, -((weekday + 6) % 7));
}

export function isWeekend(iso: string): boolean {
  const weekday = new Date(utc(iso)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

export interface Span {
  start: string;
  end: string;
}

/** De qué día a qué día va la barra. Con solo una de las dos fechas, la barra ocupa ese día. Sin ninguna: no hay barra. */
export function spanOf(task: { startOn: string | null; dueOn: string | null }): Span | null {
  const start = task.startOn ?? task.dueOn;
  const end = task.dueOn ?? task.startOn;
  if (!start || !end) return null;
  return start <= end ? { start, end } : { start: end, end: start };
}

export type DragMode = 'move' | 'start' | 'end';

/**
 * Fechas nuevas al arrastrar `delta` días: mover desplaza las dos; estirar el inicio o el fin cambia solo esa punta y nunca la cruza
 * con la otra (se queda como mucho en el mismo día). Una tarea que solo tenía entrega gana fecha de inicio al estirar su inicio.
 */
export function dragDates(task: { startOn: string | null; dueOn: string | null }, delta: number, mode: DragMode): { startOn: string | null; dueOn: string | null } {
  const span = spanOf(task);
  if (!span) return { startOn: task.startOn, dueOn: task.dueOn };
  if (mode === 'move') {
    return {
      startOn: task.startOn ? shiftDay(task.startOn, delta) : null,
      dueOn: task.dueOn ? shiftDay(task.dueOn, delta) : null,
    };
  }
  if (mode === 'start') {
    const start = shiftDay(span.start, delta);
    return { startOn: start > span.end ? span.end : start, dueOn: task.dueOn ?? span.end };
  }
  const end = shiftDay(span.end, delta);
  return { startOn: task.startOn, dueOn: end < span.start ? span.start : end };
}

/** Las 42 casillas (6 semanas, de lunes a domingo) que muestran un mes completo. */
export function monthGrid(year: number, month: number): string[] {
  const first = fromUtc(Date.UTC(year, month - 1, 1));
  const start = mondayOf(first);
  return Array.from({ length: 42 }, (_, i) => shiftDay(start, i));
}

/** Recorrido en ángulo recto de la flecha de una dependencia: sale del fin de la bloqueante y entra al inicio de la que espera. */
export function arrowPath(x1: number, y1: number, x2: number, y2: number, gap = 8): string {
  if (x2 - gap >= x1 + gap) {
    const mid = x1 + gap;
    return `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`;
  }
  // La que espera empieza antes de que termine la otra: la flecha da la vuelta por debajo de la fila de origen.
  const below = y1 + (y2 >= y1 ? 14 : -14);
  return `M ${x1} ${y1} H ${x1 + gap} V ${below} H ${x2 - gap} V ${y2} H ${x2}`;
}
