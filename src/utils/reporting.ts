import type { AnnexType, FindingSeverity } from '@/types/reporting';

export const ANNEXES: { value: AnnexType; icon: string }[] = [
  { value: 'f104', icon: 'mdi-percent-outline' },
  { value: 'f103', icon: 'mdi-cash-minus' },
  { value: 'ats', icon: 'mdi-file-table-outline' },
];

/** Periodo `AAAA-MM` de una fecha (en la zona del navegador: el mes que la persona está viviendo). */
export function currentPeriod(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Los últimos `count` periodos, del más reciente al más antiguo, empezando en el mes de `now`. */
export function recentPeriods(count = 24, now: Date = new Date()): string[] {
  const out: string[] = [];
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  for (let i = 0; i < count; i += 1) {
    out.push(`${year}-${String(month).padStart(2, '0')}`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return out;
}

/** «octubre de 2026». Se formatea en UTC para que el mes no se corra por la zona horaria. */
export function formatPeriod(period: string, locale: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return period;
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)));
}

export const severityColor = (severity: FindingSeverity): string => (severity === 'error' ? 'error' : 'warning');
export const severityIcon = (severity: FindingSeverity): string => (severity === 'error' ? 'mdi-alert-circle-outline' : 'mdi-alert-outline');

/** Una cifra del resumen es un importe cuando su nombre termina en `Cents`. */
export const isMoneyKey = (key: string): boolean => key.endsWith('Cents');

// ── Casilleros manuales ──
// Los importes se escriben en dólares y viajan en centavos; el factor de proporcionalidad se escribe en % y viaja en puntos básicos.

export type ManualKind = 'money' | 'percent';
export const MANUAL_KIND: Record<string, ManualKind> = {
  factor_proporcionalidad_bps: 'percent',
  credito_anterior: 'money',
  iva_retenido_sufrido: 'money',
  ajustes: 'money',
};

/** «12,34» o «12.34» → 1234 centavos. `null` si no es un importe (vacío, letras, más de dos decimales). */
export function centsFromText(text: string): number | null {
  const t = text.trim().replace(/\s/g, '');
  if (!/^-?\d+([.,]\d{1,2})?$/.test(t)) return null;
  const negative = t.startsWith('-');
  const [whole, frac = ''] = t.replace('-', '').replace(',', '.').split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return negative ? -cents : cents;
}

export const textFromCents = (cents: number): string => (cents / 100).toFixed(2);

/** «50» o «62,5» (%) → 5000 o 6250 puntos básicos. `null` si no es un porcentaje de 0 a 100. */
export function bpsFromPercent(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const bps = Math.round(Number(t) * 100);
  return bps >= 0 && bps <= 10_000 ? bps : null;
}

export const percentFromBps = (bps: number): string => String(bps / 100);

/** Convierte lo que la persona escribió al valor que viaja al servidor, o `null` si no es válido. */
export function manualValue(fieldCode: string, text: string): number | null {
  return MANUAL_KIND[fieldCode] === 'percent' ? bpsFromPercent(text) : centsFromText(text);
}

/** Lo contrario: el valor guardado como texto editable. */
export function manualText(fieldCode: string, value: number): string {
  return MANUAL_KIND[fieldCode] === 'percent' ? percentFromBps(value) : textFromCents(value);
}

/** Un error con cuerpo JSON que llegó como Blob (porque la petición pedía `responseType: 'blob'`) se vuelve a leer para que muestre su mensaje. */
export async function unwrapBlobError(err: unknown): Promise<unknown> {
  const response = (err as { response?: { data?: unknown } } | null)?.response;
  if (response?.data instanceof Blob) {
    try {
      response.data = JSON.parse(await response.data.text());
    } catch {
      // no era JSON: se deja como estaba
    }
  }
  return err;
}

export { downloadBlob } from '@/utils/treasury';

/** Qué cifras van primero en cada anexo: lo que decide (saldo, retenido, compras) antes que los conteos. Lo que no esté en la lista va al final. */
const METRIC_ORDER: Record<AnnexType, string[]> = {
  f104: ['ivaGeneradoCents', 'creditoAplicableCents', 'saldoCents', 'ivaComprasCents', 'ivaRetenidoPracticadoCents', 'ventas', 'compras', 'retenciones'],
  f103: ['totalRetenidoCents', 'totalBaseCents', 'conceptos', 'retenciones', 'retencionesIvaEIsdNoIncluidasCents'],
  ats: ['compras', 'comprobantesVenta', 'clientes', 'anulados', 'retencionesEmitidas', 'retencionesSinCompra', 'comprasAnuladas', 'comprasIvaCents', 'ventasIvaCents', 'comprasBaseGravadaCents', 'comprasBase0Cents', 'ventasBaseGravadaCents', 'ventasBase0Cents'],
};

/** Las cifras del resumen en un orden con sentido (MySQL devuelve las claves de un JSON por longitud y luego alfabéticamente). */
export function orderedSummary(annex: AnnexType, summary: Record<string, number>): [string, number][] {
  const order = METRIC_ORDER[annex];
  const rank = (key: string) => {
    const i = order.indexOf(key);
    return i === -1 ? order.length : i;
  };
  return Object.entries(summary).sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
}

/** La cifra que mejor resume una versión en un listado: el saldo del 104, lo retenido del 103 y las compras del ATS. */
export function keyFigure(annex: AnnexType, summary: Record<string, number>): { key: string; value: number } {
  const key = annex === 'f104' ? 'saldoCents' : annex === 'f103' ? 'totalRetenidoCents' : 'compras';
  return { key, value: summary[key] ?? 0 };
}

/** Fecha y hora de una versión en el idioma de la interfaz. */
export function formatDateTime(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(locale);
}
