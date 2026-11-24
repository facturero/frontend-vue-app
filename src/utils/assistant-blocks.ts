/**
 * Divide una respuesta del asistente en bloques que el chat sabe pintar: texto (markdown-lite), tabla y gráfico.
 *
 * El texto viene del modelo, y el modelo lee datos de clientes y productos: aquí nada se convierte en HTML. El texto sigue
 * pasando por el escapado de `renderMarkdownLite`; las celdas de una tabla y los rótulos de un gráfico se pintan con la
 * interpolación de Vue, que escapa. Un bloque mal formado no rompe la respuesta: vuelve a ser texto.
 *
 * Formatos que el prompt del asistente le pide (solo cuando la persona pide una tabla o un gráfico):
 * - Tabla: markdown de toda la vida, con encabezado y separador (`| a | b |` / `|---|---|`).
 * - Gráfico: bloque ```grafico con JSON `{ "type": "bar"|"line"|"pie", "title", "labels": [...], "values": [...], "unit"? }`.
 */

export type ChartType = 'bar' | 'line' | 'pie';

export interface ChartSpec {
  type: ChartType;
  title: string | null;
  labels: string[];
  values: number[];
  unit: string | null;
}

export type AssistantBlock =
  | { kind: 'text'; text: string }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'chart'; chart: ChartSpec };

/** Tope de puntos de un gráfico: más no se leen en un chat y suele ser señal de que el modelo volcó una lista entera. */
export const MAX_CHART_POINTS = 24;

const FENCE = /^```\s*(grafico|gráfico|chart)\s*$/i;
const ROW = /^\s*\|.*\|\s*$/;
const SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/** Celdas de una fila `| a | b |`, sin los `**` de negrita (en una celda se pintan como texto plano). */
function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim().replace(/\*\*(.+?)\*\*/g, '$1'));
}

/** Valida el JSON de un gráfico. Devuelve `null` si no se puede dibujar con honestidad. */
export function parseChart(json: string): ChartSpec | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const type = o.type === 'bar' || o.type === 'line' || o.type === 'pie' ? o.type : null;
  if (!type || !Array.isArray(o.labels) || !Array.isArray(o.values)) return null;
  const labels = o.labels.map((l) => String(l));
  const values = o.values.map((v) => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN));
  if (labels.length === 0 || labels.length !== values.length || labels.length > MAX_CHART_POINTS) return null;
  if (values.some((v) => !Number.isFinite(v))) return null;
  // Un anillo con negativos no representa nada: mejor no dibujarlo que dibujar algo falso.
  if (type === 'pie' && values.some((v) => v < 0)) return null;
  return {
    type,
    title: typeof o.title === 'string' && o.title.trim() ? o.title.trim() : null,
    labels,
    values,
    unit: typeof o.unit === 'string' && o.unit.trim() ? o.unit.trim() : null,
  };
}

export function parseAssistantBlocks(text: string): AssistantBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: AssistantBlock[] = [];
  let buffer: string[] = [];
  const flush = () => {
    const t = buffer.join('\n').trim();
    if (t) blocks.push({ kind: 'text', text: t });
    buffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Gráfico: ```grafico … ```
    if (FENCE.test(line.trim())) {
      const end = lines.findIndex((l, j) => j > i && l.trim() === '```');
      if (end > i) {
        const chart = parseChart(lines.slice(i + 1, end).join('\n'));
        if (chart) {
          flush();
          blocks.push({ kind: 'chart', chart });
          i = end;
          continue;
        }
      }
    }

    // Tabla: fila de encabezado + separador + filas.
    if (ROW.test(line) && i + 1 < lines.length && SEPARATOR.test(lines[i + 1]!)) {
      const head = cells(line);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && ROW.test(lines[j]!)) {
        const row = cells(lines[j]!);
        rows.push(head.map((_, k) => row[k] ?? ''));
        j++;
      }
      if (head.length >= 2 && rows.length > 0) {
        flush();
        blocks.push({ kind: 'table', head, rows });
        i = j - 1;
        continue;
      }
    }

    buffer.push(line);
  }
  flush();
  return blocks;
}
