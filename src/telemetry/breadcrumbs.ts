/**
 * Lo último que hizo la persona, en una lista corta que vive solo en memoria. Si ella reporta un problema, esto es lo que dice
 * qué pasó justo antes («abrí Nueva factura, agregué una línea, falló»). Solo se envía si la persona marca la casilla.
 *
 * Es deliberadamente pobre en datos: ruta (con plantilla, sin ids), método, estado, duración y el id de traza para saltar a la
 * traza completa en SigNoz. Nunca cuerpos, ni valores de campos, ni lo que escribió.
 */

export type BreadcrumbKind = 'http' | 'route' | 'error';

export interface Breadcrumb {
  at: number;
  kind: BreadcrumbKind;
  text: string;
  status?: number;
  ms?: number;
  traceId?: string;
}

const MAX = 30;
const buffer: Breadcrumb[] = [];

export function addBreadcrumb(crumb: Omit<Breadcrumb, 'at'>): void {
  buffer.push({ at: Date.now(), ...crumb });
  if (buffer.length > MAX) buffer.shift();
}

export function recentBreadcrumbs(): Breadcrumb[] {
  return [...buffer];
}

export function clearBreadcrumbs(): void {
  buffer.length = 0;
}

const two = (n: number): string => String(n).padStart(2, '0');

/** Una línea por paso, la más reciente al final: `21:33:24 POST /invoices/:id/lines → 400 (120 ms) traza=bf89…`. */
export function formatBreadcrumbs(crumbs: Breadcrumb[] = buffer): string {
  return crumbs
    .map((c) => {
      const d = new Date(c.at);
      const hora = `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
      const estado = c.status !== undefined ? ` → ${c.status}` : '';
      const dur = c.ms !== undefined ? ` (${Math.round(c.ms)} ms)` : '';
      const traza = c.traceId && !/^0+$/.test(c.traceId) ? ` traza=${c.traceId}` : '';
      return `${hora} ${c.text}${estado}${dur}${traza}`;
    })
    .join('\n');
}
