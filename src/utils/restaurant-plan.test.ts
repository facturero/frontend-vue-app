import { describe, expect, it } from 'vitest';
import type { DiningTable, PlanElement } from '@/types/restaurant';
import {
  aisleGap,
  buildSaveFloorPlanInput,
  duplicateRow,
  elementBox,
  findPlanIssues,
  formatMeters,
  nextTableName,
  nextRotation,
  parseMeters,
  planBounds,
  snapCm,
  tableBox,
  translateElement,
  zoneBounds,
  type Box,
} from './restaurant-plan';

function table(over: Partial<DiningTable> = {}): DiningTable {
  return {
    id: 't1',
    organizationId: 'org',
    floorId: 'floor',
    zoneId: null,
    name: 'Mesa 1',
    capacityMin: 1,
    capacityMax: 2,
    xCm: 0,
    yCm: 0,
    widthCm: 80,
    heightCm: 80,
    shape: 'rect',
    rotationDeg: 0,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });

describe('conversión cm ↔ m', () => {
  it('muestra metros sin decimales de relleno', () => {
    expect(formatMeters(320)).toBe('3,2 m');
    expect(formatMeters(300)).toBe('3 m');
    expect(formatMeters(45)).toBe('0,45 m');
    expect(formatMeters(0)).toBe('0 m');
  });

  it('acepta coma, punto y el sufijo «m» al escribir una medida', () => {
    expect(parseMeters('3,2')).toBe(320);
    expect(parseMeters('3.2')).toBe(320);
    expect(parseMeters(' 2,5 m ')).toBe(250);
    expect(parseMeters('12')).toBe(1200);
  });

  it('rechaza lo que no es un número', () => {
    expect(parseMeters('')).toBeNull();
    expect(parseMeters('tres metros')).toBeNull();
    expect(parseMeters('m')).toBeNull();
  });

  it('el imán lleva a la rejilla de 10 cm, y a 50 cm con precisión', () => {
    expect(snapCm(323)).toBe(320);
    expect(snapCm(326)).toBe(330);
    expect(snapCm(323, 50)).toBe(300);
    expect(snapCm(288, 50)).toBe(300);
  });
});

describe('cajas y giros', () => {
  it('una mesa girada 90 grados intercambia ancho y alto', () => {
    expect(tableBox(table({ widthCm: 120, heightCm: 80, rotationDeg: 90 }))).toEqual(box(0, 0, 80, 120));
    expect(tableBox(table({ widthCm: 120, heightCm: 80, rotationDeg: 180 }))).toEqual(box(0, 0, 120, 80));
  });

  it('el giro va de 90 en 90 y da la vuelta a los 360', () => {
    expect(nextRotation(0)).toBe(90);
    expect(nextRotation(270)).toBe(0);
  });

  it('la caja de una pared vale aunque se dibuje de derecha a izquierda', () => {
    const wall: PlanElement = { id: 'w', type: 'wall', x1: 500, y1: 300, x2: 200, y2: 300, thicknessCm: 10 };
    expect(elementBox(wall)).toEqual(box(200, 300, 300, 0));
  });

  it('mover un elemento mueve todas sus coordenadas', () => {
    const wall: PlanElement = { id: 'w', type: 'wall', x1: 0, y1: 0, x2: 100, y2: 0, thicknessCm: 10 };
    expect(translateElement(wall, 20, 30)).toMatchObject({ x1: 20, y1: 30, x2: 120, y2: 30 });
  });
});

describe('solapes y pasillos', () => {
  it('dos mesas que se tocan cuentan como solapadas', () => {
    expect(aisleGap(box(0, 0, 80, 80), box(40, 0, 80, 80))).toBeNull();
  });

  it('un hueco lateral de 30 cm es un pasillo estrecho', () => {
    const gap = aisleGap(box(0, 0, 80, 80), box(110, 0, 80, 80));
    expect(gap).toBe(30);
  });

  it('separa un hueco lateral amplio y una separación en diagonal', () => {
    expect(aisleGap(box(0, 0, 80, 80), box(200, 0, 80, 80))).toBe(120);
    expect(aisleGap(box(0, 0, 100, 100), box(160, 160, 100, 100))).toBeCloseTo(Math.hypot(60, 60));
  });

  it('marca solapes, pasillos estrechos, mesas fuera del salón y capacidades inválidas', () => {
    const tables = [
      table({ id: 'a', xCm: 0, yCm: 0 }),
      table({ id: 'b', xCm: 40, yCm: 0, widthCm: 60 }), // se solapa con a
      table({ id: 'c', xCm: 110, yCm: 0 }), // pasillos de 10 y 30 cm
      table({ id: 'd', xCm: 700, yCm: 0 }), // fuera de un salón de 6 m
      table({ id: 'e', xCm: null, yCm: null }), // sin plano: no se evalúa
      table({ id: 'f', xCm: 400, yCm: 300, capacityMin: 6, capacityMax: 2 }), // capacidad incoherente
    ];
    const issues = findPlanIssues(tables, { widthCm: 600, heightCm: 400 });
    expect(issues.overlapping.sort()).toEqual(['a', 'b']);
    expect(issues.narrowAisles).toContain('a');
    expect(issues.narrowAisles).toContain('c');
    expect(issues.outsideFloor).toEqual(['d']);
    expect(issues.invalidCapacity).toEqual(['f']);
  });

  it('sin medidas de salón no avisa de mesas fuera', () => {
    const issues = findPlanIssues([table({ id: 'a', xCm: 900, yCm: 900 })], null);
    expect(issues.outsideFloor).toEqual([]);
  });
});

describe('copias en fila', () => {
  it('copia la mesa a la derecha separando por el borde girado más el hueco', () => {
    let n = 0;
    const seed = table({ id: 'seed', name: 'Mesa 1', widthCm: 120, heightCm: 80, xCm: 100, yCm: 100 });
    const copies = duplicateRow(seed, { count: 2, direction: 'right', spacingCm: 100 }, () => `id-${++n}`);
    expect(copies.map((c) => c.id)).toEqual(['id-1', 'id-2']);
    expect(copies[0]!.xCm).toBe(320);
    expect(copies[1]!.xCm).toBe(540);
    expect(copies.every((c) => c.yCm === 100)).toBe(true);
    expect(copies[1]!.name).toBe('Mesa 1 2');
  });

  it('copia hacia abajo separando por el alto', () => {
    const seed = table({ widthCm: 120, heightCm: 80, xCm: 0, yCm: 0 });
    const copies = duplicateRow(seed, { count: 1, direction: 'down', spacingCm: 100 }, () => 'id');
    expect(copies[0]!.yCm).toBe(180);
    expect(copies[0]!.xCm).toBe(0);
  });
});

describe('numeración y límites del lienzo', () => {
  it('continúa la numeración desde la mesa mayor existente', () => {
    expect(nextTableName([{ name: 'Mesa 1' }, { name: 'Mesa 7' }, { name: 'Barra' }])).toBe('Mesa 8');
    expect(nextTableName([])).toBe('Mesa 1');
  });

  it('el lienzo encierra mesas y elementos, con un mínimo de 8 × 6 m', () => {
    expect(planBounds([], [], { widthCm: null, heightCm: null })).toEqual(box(0, 0, 800, 600));
    const tables = [table({ xCm: 1000, yCm: 400, widthCm: 120, heightCm: 80 })];
    expect(planBounds(tables, [], { widthCm: 600, heightCm: 400 })).toEqual(box(0, 0, 1120, 600));
  });

  it('ignora las mesas inactivas o sin ubicar al calcular el lienzo', () => {
    const tables = [table({ xCm: null, yCm: null }), table({ id: 'x', xCm: 4000, yCm: 4000, status: 'inactive' })];
    expect(planBounds(tables, [], { widthCm: 600, heightCm: 400 })).toEqual(box(0, 0, 800, 600));
  });
});

describe('área de una zona', () => {
  it('envuelve las mesas asignadas con un margen', () => {
    const tables = [
      table({ id: 'a', zoneId: 'z', xCm: 100, yCm: 100, widthCm: 80, heightCm: 80 }),
      table({ id: 'b', zoneId: 'z', xCm: 300, yCm: 200, widthCm: 80, heightCm: 80 }),
      table({ id: 'c', zoneId: null, xCm: 0, yCm: 0 }),
    ];
    expect(zoneBounds(tables, 'z', 20)).toEqual({ x: 80, y: 80, w: 320, h: 220 });
  });

  it('una zona sin mesas ubicadas no tiene área', () => {
    expect(zoneBounds([table({ zoneId: 'z', xCm: null, yCm: null })], 'z')).toBeNull();
    expect(zoneBounds([], 'z')).toBeNull();
  });
});

describe('serialización a PUT …/plan', () => {
  it('manda solo mesas y zonas activas, con la versión esperada', () => {
    const payload = buildSaveFloorPlanInput({
      expectedVersion: 3,
      widthCm: 800,
      heightCm: 600,
      zones: [
        { id: 'z1', name: 'Terraza', color: 'success', status: 'active' },
        { id: 'z2', name: 'Vieja', color: 'error', status: 'inactive' },
      ],
      tables: [table({ id: 't1' }), table({ id: 't2', status: 'inactive' })],
      elements: [],
    });
    expect(payload.expectedVersion).toBe(3);
    expect(payload.floor).toEqual({ widthCm: 800, heightCm: 600 });
    expect(payload.zones).toEqual([{ id: 'z1', name: 'Terraza', color: 'success' }]);
    expect(payload.tables.map((t) => t.id)).toEqual(['t1']);
  });
});
