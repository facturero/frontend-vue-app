/**
 * Cálculos de los formularios de retención. Replican a propósito los del backend (fiscal-ecuador, `direct-documents.ts`) para que
 * la pantalla muestre el mismo valor que el SRI recibirá; el backend vuelve a calcularlo y manda.
 */

export const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;
export const DOCUMENT_NUMBER_PATTERN = /^\d{3}-\d{3}-\d{9}$/;

/** `"100.50"` → 10050; `null` si no es un importe válido (hasta dos decimales, sin signo). */
export function toCents(value: string): number | null {
  const v = value.trim();
  if (!MONEY_PATTERN.test(v)) return null;
  return Math.round(Number(v) * 100);
}

/** 10050 → `"100.50"`. */
export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** `base × porcentaje / 100`, en centavos y con la mitad hacia arriba, con enteros (sin errores de coma flotante). */
export function withheldCents(baseCents: number, ratePercent: number): number {
  return Math.floor((baseCents * Math.round(ratePercent * 100) + 5000) / 10000);
}

/** El IVA de una base a una tarifa. */
export function vatCents(baseCents: number, ratePercent: number): number {
  return withheldCents(baseCents, ratePercent);
}

/** El esquema del SRI admite tres cifras en el porcentaje a retener (10, 2.75, 100), sin contar ceros finales. */
export function isValidRate(ratePercent: number): boolean {
  if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) return false;
  if (Math.abs(ratePercent * 100 - Math.round(ratePercent * 100)) > 1e-9) return false;
  const digits = ratePercent.toFixed(2).replace(/\.?0+$/, '').replace('.', '').replace(/^0+/, '');
  return digits.length <= 3;
}

/** `AAAA-MM-DD` de hoy en hora local. */
export function todayIso(now = new Date()): string {
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}

/** `MM/AAAA` del mes en curso: el periodo fiscal por defecto. */
export function currentFiscalPeriod(now = new Date()): string {
  return `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
}
