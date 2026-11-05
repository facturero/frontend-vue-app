import { describe, expect, it } from 'vitest';
import type { TimeReportRow } from '@/types/projects';
import { rangeFor, timeReportCsv, totalsBy } from './timeReport';

const row = (over: Partial<TimeReportRow>): TimeReportRow => ({
  id: 'e',
  taskId: 't',
  projectId: 'p1',
  userId: 'u1',
  workedOn: '2026-11-04',
  minutes: 60,
  billable: true,
  note: null,
  source: 'manual',
  billingId: null,
  createdAt: '',
  updatedAt: '',
  taskTitle: 'Tarea',
  taskDeleted: false,
  projectName: 'Web',
  canEdit: true,
  ...over,
});

describe('reporte de horas', () => {
  it('atajos de fechas: semana de lunes a domingo y meses completos', () => {
    expect(rangeFor('thisWeek', '2026-11-05')).toEqual({ from: '2026-11-02', to: '2026-11-08' });
    expect(rangeFor('lastWeek', '2026-11-02')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
    expect(rangeFor('thisMonth', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(rangeFor('lastMonth', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('totales por persona y por proyecto, con lo facturable aparte', () => {
    const items = [row({ minutes: 60 }), row({ minutes: 30, billable: false }), row({ userId: 'u2', projectId: null, minutes: 120 })];
    expect(totalsBy(items, 'userId')).toEqual([
      { key: 'u2', minutes: 120, billableMinutes: 120 },
      { key: 'u1', minutes: 90, billableMinutes: 60 },
    ]);
    expect(totalsBy(items, 'projectId').map((t) => t.key)).toEqual(['', 'p1']);
  });

  it('CSV con horas como número y comillas donde hace falta', () => {
    const labels = { date: 'Fecha', person: 'Persona', project: 'Proyecto', task: 'Tarea', hours: 'Horas', minutes: 'Minutos', billable: 'Facturable', note: 'Nota', source: 'Origen', yes: 'Sí', no: 'No', timer: 'Cronómetro', manual: 'Manual' };
    const csv = timeReportCsv([row({ minutes: 90, note: 'Llamada, con "cliente"', source: 'timer' })], labels, () => 'Ana Pérez');
    expect(csv.split('\r\n')[1]).toBe('2026-11-04,Ana Pérez,Web,Tarea,1.50,90,Sí,"Llamada, con ""cliente""",Cronómetro');
  });
});
