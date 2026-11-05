import { describe, expect, it } from 'vitest';
import { arrowPath, daysBetween, dragDates, isWeekend, mondayOf, monthGrid, shiftDay, spanOf } from './timeline';

describe('fechas del cronograma', () => {
  it('cuenta y desplaza días cruzando meses y años', () => {
    expect(daysBetween('2026-11-28', '2026-12-03')).toBe(5);
    expect(shiftDay('2026-12-30', 3)).toBe('2027-01-02');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('el lunes de la semana y los fines de semana', () => {
    expect(mondayOf('2026-11-04')).toBe('2026-11-02'); // miércoles
    expect(mondayOf('2026-11-08')).toBe('2026-11-02'); // domingo
    expect(mondayOf('2026-11-02')).toBe('2026-11-02');
    expect(isWeekend('2026-11-07')).toBe(true);
    expect(isWeekend('2026-11-06')).toBe(false);
  });

  it('la barra va de inicio a entrega; con una sola fecha ocupa ese día; sin fechas no hay barra', () => {
    expect(spanOf({ startOn: '2026-11-02', dueOn: '2026-11-06' })).toEqual({ start: '2026-11-02', end: '2026-11-06' });
    expect(spanOf({ startOn: null, dueOn: '2026-11-06' })).toEqual({ start: '2026-11-06', end: '2026-11-06' });
    expect(spanOf({ startOn: null, dueOn: null })).toBeNull();
  });

  it('arrastrar: mover desplaza ambas; estirar mueve una punta sin cruzar la otra', () => {
    const t = { startOn: '2026-11-02', dueOn: '2026-11-06' };
    expect(dragDates(t, 3, 'move')).toEqual({ startOn: '2026-11-05', dueOn: '2026-11-09' });
    expect(dragDates(t, 2, 'end')).toEqual({ startOn: '2026-11-02', dueOn: '2026-11-08' });
    expect(dragDates(t, -10, 'end')).toEqual({ startOn: '2026-11-02', dueOn: '2026-11-02' });
    expect(dragDates(t, 10, 'start')).toEqual({ startOn: '2026-11-06', dueOn: '2026-11-06' });
  });

  it('una tarea con solo entrega: moverla no le inventa inicio; estirar su inicio sí se lo da', () => {
    const t = { startOn: null, dueOn: '2026-11-06' };
    expect(dragDates(t, 1, 'move')).toEqual({ startOn: null, dueOn: '2026-11-07' });
    expect(dragDates(t, -3, 'start')).toEqual({ startOn: '2026-11-03', dueOn: '2026-11-06' });
  });

  it('el mes se muestra en 6 semanas de lunes a domingo', () => {
    const grid = monthGrid(2026, 11);
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe('2026-10-26');
    expect(grid).toContain('2026-11-30');
  });

  it('la flecha va recta si hay espacio y da la vuelta si la que espera empieza antes', () => {
    expect(arrowPath(100, 18, 200, 54)).toBe('M 100 18 H 108 V 54 H 200');
    expect(arrowPath(200, 18, 100, 54)).toContain('V 32');
  });
});
