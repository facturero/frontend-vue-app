import type { BillStatus, MatchStatus, OrderStatus, PurchaseBill } from '@/types/purchasing';
import type { WithholdingPrefill } from '@/types/fiscal';

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

/** Color de la etiqueta de estado de una factura de compra (misma familia tonal que la orden). */
export const BILL_STATUS_COLOR: Record<BillStatus, string> = {
  draft: 'lightwarning',
  posted: 'lightsuccess',
  blocked: 'lighterror',
  voided: 'lightsecondary',
};

/** Color de la etiqueta del resultado de la conciliación a tres vías. */
export const MATCH_STATUS_COLOR: Record<MatchStatus, string> = {
  matched: 'lightsuccess',
  blocked: 'lighterror',
  overridden: 'lightwarning',
  not_applicable: 'lightinfo',
};

/**
 * Las acciones sobre una factura según su estado y permisos. Ocultar el botón no es seguridad: el servidor también comprueba.
 * Quien registró la factura no la aprueba con excepción (separación de funciones): se le oculta en vez de dejarle toparse con el error.
 */
export function billActions(
  bill: Pick<PurchaseBill, 'status'> & { createdBy?: string },
  can: (permission: string) => boolean,
  userId: string | null = null,
): { edit: boolean; post: boolean; override: boolean; void: boolean; withhold: boolean } {
  const drafter = can('purchase_bill:create');
  const notMine = userId === null || bill.createdBy === undefined || bill.createdBy !== userId;
  return {
    edit: (bill.status === 'draft' || bill.status === 'blocked') && drafter,
    post: bill.status === 'draft' && drafter,
    override: bill.status === 'blocked' && can('purchase_bill:override') && notMine,
    void: (bill.status === 'posted' || bill.status === 'blocked') && can('purchase_bill:void'),
    withhold: bill.status === 'posted' && can('withholding:issue'),
  };
}

/** Recibir y cerrar lo pendiente: solo una orden aprobada o recibida en parte, y cada acción con su propio permiso. */
export function receivingActions(order: { status: OrderStatus }, can: (permission: string) => boolean): { receive: boolean; close: boolean } {
  const open = order.status === 'approved' || order.status === 'partially_received';
  return { receive: open && can('receipt:create'), close: open && can('purchase:close') };
}

/** Estados de una orden en los que ya tiene recepciones (o puede tenerlas): ahí se muestra el seguimiento por línea. */
export const RECEIVING_VISIBLE_STATUSES: OrderStatus[] = ['approved', 'partially_received', 'received', 'closed'];

/** Cantidad pendiente de facturar de una línea: lo recibido menos lo ya facturado (nunca negativo). Cantidades como texto de 6 decimales. */
export function toBillQuantity(received: string, billed: string): string {
  const r = parseQuantityMicros(received) ?? 0n;
  const b = parseQuantityMicros(billed) ?? 0n;
  const left = r > b ? r - b : 0n;
  const whole = left / QTY_SCALE;
  const frac = (left % QTY_SCALE).toString().padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/**
 * Los datos de una factura de compra con los que se abre el formulario de retención de fiscal. La persona revisa todo y elige los
 * códigos y porcentajes de retención (dependen de la actividad del proveedor, no de la factura): aquí solo va lo que la factura ya sabe.
 * Un proveedor del exterior no cabe en el formulario de retenciones (solo RUC, cédula y pasaporte): se deja el tipo sin fijar.
 */
export function withholdingPrefillFromBill(bill: Pick<PurchaseBill, 'supplier' | 'docType' | 'establishment' | 'emissionPoint' | 'sequential' | 'issueDate' | 'authorizationNumber' | 'subtotalCents' | 'lines'>): WithholdingPrefill {
  const kind = bill.supplier?.identificationType;
  const byRate = new Map<string, { percentageCode: string | null; ratePct: string; baseCents: number; amountCents: number }>();
  for (const line of bill.lines) {
    const key = `${line.taxPercentageCode ?? ''}|${Number(line.taxRatePct)}`;
    const row = byRate.get(key) ?? { percentageCode: line.taxPercentageCode, ratePct: String(Number(line.taxRatePct)), baseCents: 0, amountCents: 0 };
    row.baseCents += line.subtotalCents;
    row.amountCents += line.taxCents;
    byRate.set(key, row);
  }
  const authorization = bill.authorizationNumber?.trim() ?? '';
  return {
    subject: {
      identificationType: kind === 'RUC' || kind === 'CEDULA' || kind === 'PASAPORTE' ? kind : null,
      identification: bill.supplier?.identification ?? '',
      businessName: bill.supplier?.legalName ?? '',
    },
    support: {
      documentCode: bill.docType,
      number: `${bill.establishment}-${bill.emissionPoint}-${bill.sequential}`,
      issueDate: bill.issueDate,
      // El formulario fiscal pide 10 a 49 dígitos; cualquier otra cosa se deja vacía para que la persona la escriba.
      authorizationNumber: /^\d{10,49}$/.test(authorization) ? authorization : null,
      subtotalCents: bill.subtotalCents,
    },
    taxes: [...byRate.values()],
  };
}
