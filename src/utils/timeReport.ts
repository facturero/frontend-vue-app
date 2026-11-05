import type { TimeReportRow } from '@/types/projects';
import { addDays, localIsoDate } from './projects';

export type RangePreset = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'custom';
export const RANGE_PRESETS: RangePreset[] = ['thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'custom'];

/** Lunes de la semana de esa fecha local. */
export function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const weekday = new Date(y!, m! - 1, d!).getDay(); // 0 domingo
  return addDays(iso, -((weekday + 6) % 7));
}

/** Rango [desde, hasta] de un atajo, con la semana de lunes a domingo, como en Ecuador. */
export function rangeFor(preset: Exclude<RangePreset, 'custom'>, today: string): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number);
  switch (preset) {
    case 'thisWeek': {
      const from = mondayOf(today);
      return { from, to: addDays(from, 6) };
    }
    case 'lastWeek': {
      const from = addDays(mondayOf(today), -7);
      return { from, to: addDays(from, 6) };
    }
    case 'thisMonth':
      return { from: localIsoDate(new Date(y!, m! - 1, 1)), to: localIsoDate(new Date(y!, m!, 0)) };
    case 'lastMonth':
      return { from: localIsoDate(new Date(y!, m! - 2, 1)), to: localIsoDate(new Date(y!, m! - 1, 0)) };
  }
}

export interface Total {
  key: string;
  minutes: number;
  billableMinutes: number;
}

/** Totales por persona o por proyecto (sin proyecto = clave vacía), de mayor a menor. */
export function totalsBy(items: TimeReportRow[], by: 'userId' | 'projectId'): Total[] {
  const out = new Map<string, Total>();
  for (const e of items) {
    const key = e[by] ?? '';
    const t = out.get(key) ?? { key, minutes: 0, billableMinutes: 0 };
    t.minutes += e.minutes;
    if (e.billable) t.billableMinutes += e.minutes;
    out.set(key, t);
  }
  return [...out.values()].sort((a, b) => b.minutes - a.minutes);
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export interface TimeCsvLabels {
  date: string;
  person: string;
  project: string;
  task: string;
  hours: string;
  minutes: string;
  billable: string;
  note: string;
  source: string;
  yes: string;
  no: string;
  timer: string;
  manual: string;
}

/**
 * CSV del reporte (coma, comillas dobles; el BOM lo pone `downloadText`). Las horas van con punto decimal y sin unidades: una hoja
 * de cálculo las suma como número.
 */
export function timeReportCsv(items: TimeReportRow[], labels: TimeCsvLabels, personName: (userId: string) => string): string {
  const rows: (string | number)[][] = [
    [labels.date, labels.person, labels.project, labels.task, labels.hours, labels.minutes, labels.billable, labels.note, labels.source],
  ];
  for (const e of items) {
    rows.push([
      e.workedOn,
      personName(e.userId),
      e.projectName ?? '',
      e.taskTitle,
      (e.minutes / 60).toFixed(2),
      e.minutes,
      e.billable ? labels.yes : labels.no,
      e.note ?? '',
      e.source === 'timer' ? labels.timer : labels.manual,
    ]);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}
