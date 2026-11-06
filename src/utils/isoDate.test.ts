import { describe, expect, it } from 'vitest';
import { localIsoDate, parseIsoDate } from './isoDate';

describe('isoDate', () => {
  it('lee YYYY-MM-DD como medianoche LOCAL, no UTC (en Ecuador, UTC sería el día anterior)', () => {
    const d = parseIsoDate('2026-11-06')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 10, 6, 0]);
  });

  it('ida y vuelta sin perder el día, también en bordes de mes y año', () => {
    for (const iso of ['2026-11-06', '2026-01-01', '2026-12-31', '2028-02-29']) expect(localIsoDate(parseIsoDate(iso)!)).toBe(iso);
  });

  it('una fecha-hora ISO se recorta a su día', () => {
    expect(localIsoDate(parseIsoDate('2026-11-06T23:59:00Z')!)).toBe('2026-11-06');
  });

  it('lo que no es una fecha real es null', () => {
    for (const bad of [null, undefined, '', '06/11/2026', '2026-2-3', '2026-02-31', '2027-02-29', '2026-13-01', 'mañana']) {
      expect(parseIsoDate(bad)).toBeNull();
    }
  });

  it('localIsoDate usa la fecha local aunque sea tarde en la noche', () => {
    expect(localIsoDate(new Date(2026, 10, 6, 23, 30))).toBe('2026-11-06');
  });
});
