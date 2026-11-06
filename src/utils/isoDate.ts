/**
 * Fechas sin hora (`YYYY-MM-DD`), como las guardan los servicios y el estado (REGLAS-FRONT.md R-43).
 *
 * Nunca pasan por UTC: `new Date('2026-11-06')` es la medianoche UTC, que en Ecuador (UTC−5) todavía es el 5 de noviembre, y
 * `toISOString()` a las 20:00 locales ya dice «mañana». Por eso se construye y se lee siempre con los componentes LOCALES.
 */

/** `Date` → `YYYY-MM-DD` con la fecha local. */
export function localIsoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * `YYYY-MM-DD` → `Date` a la medianoche local, o `null` si no es una fecha real (vacío, otro formato, 31 de febrero…).
 * Una fecha-hora ISO completa se recorta a su día: lo que llega del servidor a veces trae la hora.
 */
export function parseIsoDate(iso: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(iso ?? '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  // `new Date(2026, 1, 31)` no falla: da el 3 de marzo. Si al leerla no es el mismo día, la fecha no existía.
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}
