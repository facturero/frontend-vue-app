import type { AddLineInput } from '@/types/invoices';
import type { BillingGroup } from '@/types/projects';

/** Lo que billing-service acepta como descripción de una línea. */
export const MAX_LINE_DESCRIPTION = 255;

export interface LineContext {
  /** El servicio con el que se facturan las horas («Servicios profesionales»). */
  productLabel: string;
  projectName: string;
  personName: (userId: string) => string;
  hoursLabel: (quantity: number) => string;
}

/**
 * Descripción de la línea, como la verá el cliente en el RIDE: «Servicios profesionales — Diseño del logo (12,5 h)». Por persona,
 * con su nombre; todo junto, con el nombre del proyecto; un hito, solo su título.
 */
export function lineDescription(g: BillingGroup, ctx: LineContext): string {
  let text: string;
  if (g.kind === 'milestone') text = g.label ?? '';
  else {
    const what = g.label ?? (g.key ? ctx.personName(g.key) : ctx.projectName);
    text = `${ctx.productLabel} — ${what} (${ctx.hoursLabel(g.quantity)})`;
  }
  return text.length > MAX_LINE_DESCRIPTION ? `${text.slice(0, MAX_LINE_DESCRIPTION - 1)}…` : text;
}

/** Líneas para el borrador de billing-service: la cantidad (horas con dos decimales) y el precio tal cual los calculó la reserva. */
export function toInvoiceLines(groups: BillingGroup[], productId: string, ctx: LineContext): AddLineInput[] {
  return groups.map((g) => ({
    productId,
    description: lineDescription(g, ctx),
    quantity: g.quantity,
    unitPrice: (g.unitPriceCents / 100).toFixed(2),
  }));
}

/** «25», «25,50», «1.500,00» o «1500.5» → centavos. Null si no es un importe. */
export function parseMoney(text: string): number | null {
  let t = text.trim().replace(/\s|\$/g, '');
  if (!t) return null;
  if (t.includes('.') && t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}
