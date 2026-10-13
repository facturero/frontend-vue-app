/**
 * Totales de una venta en caja, calculados igual que `billing-service` (add-line-in-transaction.ts) para que el total que se le
 * dice al cliente sea el de la factura. Todo en centavos enteros.
 *
 * La regla de billing: la línea guarda importes SIN impuestos. Si el precio del producto incluye IVA, se le quita primero
 * (al precio unitario y al descuento, cada uno redondeado) y el impuesto se calcula una sola vez sobre la base de la línea.
 * Puede haber un centavo de diferencia con el precio de góndola por el redondeo, pero la factura cuadra siempre.
 *
 * Si aun así el servidor recalculara otra cosa (un precio cambió en el CRM), la factura vale por lo del servidor y la diferencia
 * queda anotada en `posTotalsDiffCents`: la caja manda su total en `posTotalCents` justo para eso.
 */
export interface SaleLineInput {
  quantity: number;
  /** Precio de lista del producto, tal como lo muestra el catálogo (con IVA si `priceIncludesTax`). */
  unitPriceCents: number;
  discountCents: number;
  priceIncludesTax: boolean;
  /** Tarifas de los impuestos del producto, en porcentaje (15 = 15 %). */
  ratesPercent: number[];
}

export interface LineTotals {
  baseCents: number;
  taxCents: number;
  totalCents: number;
}

export function lineTotals(line: SaleLineInput): LineTotals {
  const includedRate = line.priceIncludesTax ? line.ratesPercent.reduce((sum, r) => sum + r, 0) : 0;
  const withoutTax = (cents: number) => Math.round(cents / (1 + includedRate / 100));
  const netUnit = withoutTax(line.unitPriceCents);
  const netDiscount = withoutTax(line.discountCents);
  const baseCents = Math.round(line.quantity * netUnit) - netDiscount;
  const taxCents = line.ratesPercent.reduce((sum, rate) => sum + Math.round(baseCents * (rate / 100)), 0);
  return { baseCents, taxCents, totalCents: baseCents + taxCents };
}

export function saleTotals(lines: SaleLineInput[]): LineTotals {
  return lines.reduce<LineTotals>(
    (acc, line) => {
      const t = lineTotals(line);
      return { baseCents: acc.baseCents + t.baseCents, taxCents: acc.taxCents + t.taxCents, totalCents: acc.totalCents + t.totalCents };
    },
    { baseCents: 0, taxCents: 0, totalCents: 0 },
  );
}

export interface TaxBreakdownRow {
  /** Tarifa en porcentaje (15 = 15 %). */
  ratePercent: number;
  /** Suma de las bases de las líneas que llevan esta tarifa. */
  baseCents: number;
  /** Impuesto de esta tarifa; las filas suman exactamente el `taxCents` de la venta (mismo redondeo por línea). */
  amountCents: number;
}

/** El IVA desglosado por tarifa («IVA 15 % (base $x)»), como lo enseña la caja de escritorio. De mayor a menor tarifa. */
export function taxBreakdown(lines: SaleLineInput[]): TaxBreakdownRow[] {
  const rows = new Map<number, TaxBreakdownRow>();
  for (const line of lines) {
    const { baseCents } = lineTotals(line);
    for (const rate of line.ratesPercent) {
      const row = rows.get(rate) ?? { ratePercent: rate, baseCents: 0, amountCents: 0 };
      row.baseCents += baseCents;
      row.amountCents += Math.round(baseCents * (rate / 100));
      rows.set(rate, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.ratePercent - a.ratePercent);
}

/** «12.5» o «12,50» → 1250. Devuelve null si no es un importe válido (letras, negativo, más de 2 decimales). */
export function parseMoneyToCents(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(parseFloat(normalized) * 100);
}

/** 1250 → «$12.50» (o «12,50 US$» según el idioma). */
export function formatCents(cents: number, locale: string, currency = 'USD'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}
