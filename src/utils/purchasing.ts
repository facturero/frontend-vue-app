import type { OrderStatus } from '@/types/purchasing';

/**
 * Cálculos de una orden de compra. Replican los del servidor (purchasing-service, `domain/money.ts`) para que la pantalla muestre
 * el mismo importe que se guardará; el servidor vuelve a calcularlo y manda. Las cantidades llevan hasta 6 decimales y se
 * multiplican en `bigint` (nada de `0.1 + 0.2`); el redondeo es UNO, a la mitad hacia arriba, sobre el producto final.
 */
const QTY_SCALE = 1_000_000n;
const QTY_PATTERN = /^(\d{1,12})(?:\.(\d{1,6}))?$/;

/** `"2.5"` → 2500000n; `null` si no es una cantidad positiva con hasta 6 decimales. Acepta coma decimal. */
export function parseQuantityMicros(text: string): bigint | null {
  const match = QTY_PATTERN.exec(text.trim().replace(',', '.'));
  if (!match) return null;
  const micros = BigInt(match[1]!) * QTY_SCALE + BigInt((match[2] ?? '').padEnd(6, '0') || '0');
  return micros > 0n ? micros : null;
}

/** cantidad × costo unitario en centavos, a la mitad hacia arriba. */
export function grossCents(quantityMicros: bigint, unitCostCents: number): number {
  return Number((quantityMicros * BigInt(unitCostCents) + QTY_SCALE / 2n) / QTY_SCALE);
}

/** `"15.00"` → 1500 (centésimas de punto porcentual). */
function percentHundredths(percent: string): number {
  const [whole, frac = ''] = percent.trim().split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0').slice(0, 2));
}

export interface LineAmounts {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

/** Los importes de una línea; `null` si falta algo válido (cantidad, costo) o el descuento supera el valor. */
export function lineAmounts(input: { quantity: string; unitCostCents: number | null; discountCents: number; taxPercent: string }): LineAmounts | null {
  const micros = parseQuantityMicros(input.quantity);
  if (micros === null || input.unitCostCents === null || input.unitCostCents < 0) return null;
  const gross = grossCents(micros, input.unitCostCents);
  if (input.discountCents < 0 || input.discountCents > gross) return null;
  const subtotalCents = gross - input.discountCents;
  const taxCents = Math.floor((subtotalCents * percentHundredths(input.taxPercent) + 5000) / 10_000);
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

export function sumAmounts(lines: Array<LineAmounts | null>): LineAmounts {
  return lines.reduce<LineAmounts>(
    (sum, l) => ({
      subtotalCents: sum.subtotalCents + (l?.subtotalCents ?? 0),
      taxCents: sum.taxCents + (l?.taxCents ?? 0),
      totalCents: sum.totalCents + (l?.totalCents ?? 0),
    }),
    { subtotalCents: 0, taxCents: 0, totalCents: 0 },
  );
}

/** Color de la etiqueta de estado (familia tonal del tema: ver docs/UI-UX.md). */
export const ORDER_STATUS_COLOR: Record<OrderStatus, string> = {
  draft: 'lightwarning',
  pending_approval: 'lightinfo',
  approved: 'lightsuccess',
  partially_received: 'lightprimary',
  received: 'lightsuccess',
  closed: 'lightsecondary',
  cancelled: 'lighterror',
  rejected: 'lighterror',
};

/** Las acciones de una orden según su estado y lo que la persona puede hacer. */
export function orderActions(
  order: { status: OrderStatus; createdBy: string },
  can: (permission: string) => boolean,
  userId: string | null,
): { edit: boolean; submit: boolean; approve: boolean; reject: boolean; reopen: boolean; cancel: boolean } {
  const maker = can('purchase:create');
  const approver = can('purchase:approve');
  // Quien preparó la orden no la aprueba ni la rechaza: se le ocultan los botones en vez de dejarle toparse con el error.
  const notMine = userId === null || order.createdBy !== userId;
  return {
    edit: order.status === 'draft' && maker,
    submit: order.status === 'draft' && maker,
    approve: order.status === 'pending_approval' && approver && notMine,
    reject: order.status === 'pending_approval' && approver && notMine,
    reopen: order.status === 'rejected' && maker,
    cancel: (order.status === 'draft' || order.status === 'pending_approval' || order.status === 'rejected') && maker
      || (order.status === 'approved' && can('purchase:cancel')),
  };
}
