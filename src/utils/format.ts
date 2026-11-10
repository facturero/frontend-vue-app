import i18n from '@/plugins/i18n';
import { parseIsoDate } from './isoDate';

/**
 * EL sitio donde se da formato a fechas, dinero y números en pantalla (REGLAS-FRONT.md R-60). Ninguna vista escribe `new Intl.*`,
 * `toLocaleString` ni `toFixed` para dinero: llama aquí, y así todo el CRM muestra lo mismo de la misma forma.
 *
 * - Fechas: siempre `dd/mm/yyyy` (decisión del dueño, 2026-11-06), en cualquier idioma: es como se escriben en Ecuador y como las
 *   escribe `DateField`. Una fecha sin hora (`YYYY-MM-DD`) se lee como día LOCAL (`utils/isoDate`); una fecha-hora ISO es un
 *   instante y se muestra en la hora local de quien mira.
 * - Dinero y números: con el separador decimal del idioma activo.
 *
 * Un valor vacío o inválido devuelve `''`: la vista decide qué poner (`—`, «Sin fecha»…).
 */

type DateInput = string | Date | null | undefined;

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` → día local; fecha-hora ISO (`…T…`) → el instante en hora local; `Date` → tal cual. */
function toDate(value: DateInput): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return parseIsoDate(value);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Idioma activo del CRM (es, en, fr), el mismo que elige la persona en la barra superior. */
function currentLocale(): string {
  const l = i18n.global.locale as unknown as string | { value: string };
  return typeof l === 'string' ? l : l.value;
}

/** `06/11/2026` */
export function formatDate(value: DateInput): string {
  const d = toDate(value);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '';
}

/** `06/11/2026 14:05` (24 horas, hora local). */
export function formatDateTime(value: DateInput): string {
  const d = toDate(value);
  return d ? `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
}

/** Centavos → `$1.234,50` (o `$1,234.50` en inglés). El dinero vive en centavos en el estado y la API. */
export function formatMoney(cents: number | null | undefined, currency = 'USD'): string {
  if (cents == null || Number.isNaN(cents)) return '';
  return new Intl.NumberFormat(currentLocale(), { style: 'currency', currency }).format(cents / 100);
}

/** Número con separadores del idioma; `maxDecimals` sin ceros de relleno (2,5 y no 2,50). */
export function formatNumber(value: number | null | undefined, maxDecimals = 2): string {
  if (value == null || Number.isNaN(value)) return '';
  return new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: maxDecimals }).format(value);
}

// ── Rótulos (no son «una fecha»: ejes, calendarios, cabeceras). Siguen el idioma, a diferencia de formatDate. ──

/** `14 sept` — semanas de un gráfico, columnas de la carga de trabajo. */
export function formatDayMonth(value: DateInput): string {
  const d = toDate(value);
  return d ? new Intl.DateTimeFormat(currentLocale(), { day: 'numeric', month: 'short' }).format(d) : '';
}

/** `Noviembre de 2026` — título de un mes (solo la primera letra en mayúscula; `text-capitalize` pondría «De»). */
export function formatMonthYear(value: DateInput): string {
  const d = toDate(value);
  if (!d) return '';
  const text = new Intl.DateTimeFormat(currentLocale(), { month: 'long', year: 'numeric' }).format(d);
  return text.charAt(0).toLocaleUpperCase(currentLocale()) + text.slice(1);
}

/** `Lunes, 9 de noviembre` — cabecera de un día en una agenda (el calendario del teléfono). */
export function formatLongDay(value: DateInput): string {
  const d = toDate(value);
  if (!d) return '';
  const text = new Intl.DateTimeFormat(currentLocale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  return text.charAt(0).toLocaleUpperCase(currentLocale()) + text.slice(1);
}

/** `['lun', 'mar', …, 'dom']` — cabecera de un calendario que empieza en lunes. */
export function weekdayLabels(): string[] {
  // 2026-11-02 fue lunes: siete días seguidos dan la semana en el idioma activo.
  const fmt = new Intl.DateTimeFormat(currentLocale(), { weekday: 'short' });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2026, 10, 2 + i, 12)));
}

/** `850 KB`, `2,4 MB` — tamaño de un archivo. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return bytes < 1024 * 1024 ? `${formatNumber(bytes / 1024, 0)} KB` : `${formatNumber(bytes / 1024 / 1024, 1)} MB`;
}

/** `hace 5 minutos`, `ayer` — solo para actividad y avisos (REGLAS-FRONT R-60). Pasada una semana, la fecha dd/mm/yyyy. */
export function formatRelative(value: DateInput, now: Date = new Date()): string {
  const d = toDate(value);
  if (!d) return '';
  const seconds = Math.round((d.getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(currentLocale(), { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  if (abs < 7 * 86400) return rtf.format(Math.round(seconds / 86400), 'day');
  return formatDate(d);
}
