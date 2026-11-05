/**
 * Duraciones de Proyectos (horas registradas, tiempo estimado, carga de trabajo). Se guardan en minutos; se escriben y se leen como
 * horas, que es como habla la gente.
 */

/** «1 h 30 min», «45 min», «8 h». Cero: «0 h». */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return m ? `${m} min` : '0 h';
}

/** Horas con un decimal, para tablas y CSV: 90 → «1,5» (con el separador del idioma). */
export function hoursDecimal(minutes: number, locale: string): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(minutes / 60);
}

/**
 * Lee lo que escribe la persona. Un número solo son HORAS (con coma o punto decimal): «2», «1,5», «0.25». También «1:30» (h:mm),
 * «90m» o «90 min», «2h», «1h 30m», «1 h 30 min». Devuelve minutos, o null si no se entiende o es cero/negativo.
 */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase().replace(',', '.');
  if (!t) return null;
  let minutes: number | null = null;
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(\d+):([0-5]?\d)$/))) minutes = Number(m[1]) * 60 + Number(m[2]);
  else if ((m = t.match(/^(\d+(?:\.\d+)?)$/))) minutes = Number(m[1]) * 60;
  else if ((m = t.match(/^(\d+)\s*(?:m|min|mins|minutos?)$/))) minutes = Number(m[1]);
  else if ((m = t.match(/^(\d+(?:\.\d+)?)\s*h(?:oras?|rs?)?(?:\s*(\d+)\s*(?:m|min|mins|minutos?)?)?$/))) minutes = Number(m[1]) * 60 + Number(m[2] ?? 0);
  if (minutes === null || !Number.isFinite(minutes)) return null;
  const rounded = Math.round(minutes);
  return rounded > 0 ? rounded : null;
}

/** Cronómetro en pantalla: «0:07:05». */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
