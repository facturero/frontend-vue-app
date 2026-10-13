import type {
  DiningTable,
  PlanDoor,
  PlanElement,
  PlanObject,
  PlanWall,
  SaveFloorPlanInput,
  TableShape,
  Zone,
  ZoneColor,
  RotationDeg,
} from '@/types/restaurant';

/**
 * Geometría y formato del editor del plano. TODO lo que no necesita Vue vive
 * aquí y se prueba sin montar componentes: la conversión cm↔m, el imán, la
 * detección de solapes y pasillos, las copias en fila y la serialización a
 * `PUT …/plan`.
 *
 * Decisiones que sostienen lo demás:
 *  - **Centímetros enteros en todas partes**, también en el estado del editor.
 *    Se redondea AL CREAR, nunca después, para que el JSON no acumule basura.
 *  - `xCm`/`yCm` de una mesa es la esquina superior izquierda de su caja ya
 *    girada: así la detección de solapes es una comparación de rectángulos y el
 *    visor de solo lectura pinta lo mismo sin recalcular nada.
 */

export const CM_PER_M = 100;
export const SNAP_CM = 10;
/** Imán fino mientras se arrastra con la tecla de precisión (50 cm = medio metro). */
export const SNAP_FINE_CM = 50;
export const GRID_MINOR_CM = 10;
export const GRID_MAJOR_CM = 100;
/** Pasillo mínimo recomendado entre mesas. */
export const MIN_AISLE_CM = 60;
export const MAX_PLAN_ELEMENTS = 500;
export const DEFAULT_WALL_THICKNESS_CM = 10;
export const DEFAULT_DOOR_WIDTH_CM = 90;
/** Grosor con el que se dibuja (y se puede tocar) una puerta: es una línea. */
export const DOOR_THICKNESS_CM = 10;
export const ZONE_COLORS: ZoneColor[] = ['primary', 'secondary', 'success', 'info', 'warning', 'error'];

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Ventana visible del SVG, en centímetros. El zoom es solo cambiar esto. */
export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Imán a la rejilla. `step` cambia a 50 cm cuando se arrastra con precisión. */
export function snapCm(value: number, step: number = SNAP_CM): number {
  return Math.round(value / step) * step;
}

/** «320» → «3,2 m». Sin decimales de relleno: 300 → «3 m». */
export function formatMeters(cm: number): string {
  const meters = Math.round((cm / CM_PER_M) * 100) / 100;
  return `${String(meters).replace('.', ',')} m`;
}

/** Admite coma o punto y un sufijo «m» opcional. Devuelve centímetros o null. */
export function parseMeters(text: string): number | null {
  const clean = text.trim().replace(',', '.').replace(/\s*m$/i, '');
  if (clean === '') return null;
  const value = Number(clean);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * CM_PER_M);
}

export interface TablePreset {
  key: string;
  capacityMin: number;
  capacityMax: number;
  widthCm: number;
  heightCm: number;
  shape: TableShape;
}

/** Medidas sensatas por defecto: las de la nota de diseño. */
export const TABLE_PRESETS: TablePreset[] = [
  { key: 'mesa2', capacityMin: 1, capacityMax: 2, widthCm: 80, heightCm: 80, shape: 'rect' },
  { key: 'mesa4', capacityMin: 2, capacityMax: 4, widthCm: 120, heightCm: 80, shape: 'rect' },
  { key: 'mesa6', capacityMin: 3, capacityMax: 6, widthCm: 180, heightCm: 80, shape: 'rect' },
  { key: 'redonda4', capacityMin: 2, capacityMax: 4, widthCm: 100, heightCm: 100, shape: 'round' },
];

export function isRotated(rotationDeg: RotationDeg): boolean {
  return rotationDeg === 90 || rotationDeg === 270;
}

/** Caja ya girada de una mesa, para colisiones y para pintar. */
export function tableBox(table: Pick<DiningTable, 'xCm' | 'yCm' | 'widthCm' | 'heightCm' | 'rotationDeg'>): Box {
  const rotated = isRotated(table.rotationDeg);
  return {
    x: table.xCm ?? 0,
    y: table.yCm ?? 0,
    w: rotated ? table.heightCm : table.widthCm,
    h: rotated ? table.widthCm : table.heightCm,
  };
}

export function elementBox(element: PlanElement): Box {
  if (element.type === 'wall') {
    return {
      x: Math.min(element.x1, element.x2),
      y: Math.min(element.y1, element.y2),
      w: Math.abs(element.x2 - element.x1),
      h: Math.abs(element.y2 - element.y1),
    };
  }
  if (element.type === 'door') {
    // Una puerta es una línea: se le da el grosor con el que se pinta.
    return { x: element.x, y: element.y, w: element.widthCm, h: DOOR_THICKNESS_CM };
  }
  return { x: element.x, y: element.y, w: element.widthCm, h: element.heightCm };
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Separación entre dos cajas que NO se solapan, en centímetros. `null` si se
 * solapan (eso es un problema distinto). En diagonal se mide la distancia real.
 */
export function aisleGap(a: Box, b: Box): number | null {
  if (boxesOverlap(a, b)) return null;
  const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0);
  const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0);
  if (dx === 0 && dy === 0) return 0;
  return dx > 0 && dy > 0 ? Math.hypot(dx, dy) : Math.max(dx, dy);
}

export interface PlanIssues {
  overlapping: string[];
  narrowAisles: string[];
  outsideFloor: string[];
  invalidCapacity: string[];
}

/**
 * Avisos suaves del editor. No bloquean el guardado: son para que el dueño
 * corrija lo que quiera, no para impedirle trabajar.
 */
export function findPlanIssues(
  tables: Pick<DiningTable, 'id' | 'status' | 'xCm' | 'yCm' | 'widthCm' | 'heightCm' | 'rotationDeg' | 'capacityMin' | 'capacityMax'>[],
  floor?: { widthCm: number | null; heightCm: number | null } | null,
  minAisleCm: number = MIN_AISLE_CM,
): PlanIssues {
  const placed = tables.filter((t) => t.status === 'active' && t.xCm !== null && t.yCm !== null);
  const overlapping = new Set<string>();
  const narrowAisles = new Set<string>();

  for (let i = 0; i < placed.length; i += 1) {
    const a = placed[i]!;
    const boxA = tableBox(a);
    for (let j = i + 1; j < placed.length; j += 1) {
      const b = placed[j]!;
      const gap = aisleGap(boxA, tableBox(b));
      if (gap === null) {
        overlapping.add(a.id);
        overlapping.add(b.id);
      } else if (gap < minAisleCm) {
        narrowAisles.add(a.id);
        narrowAisles.add(b.id);
      }
    }
  }

  const outsideFloor = new Set<string>();
  const invalidCapacity = new Set<string>();
  const hasSize = floor && floor.widthCm !== null && floor.heightCm !== null;
  for (const table of placed) {
    if (hasSize) {
      const box = tableBox(table);
      const { widthCm, heightCm } = floor!;
      if (box.x < 0 || box.y < 0 || box.x + box.w > widthCm! || box.y + box.h > heightCm!) outsideFloor.add(table.id);
    }
    if (table.capacityMax < table.capacityMin) invalidCapacity.add(table.id);
  }

  return {
    overlapping: [...overlapping],
    narrowAisles: [...narrowAisles],
    outsideFloor: [...outsideFloor],
    invalidCapacity: [...invalidCapacity],
  };
}

export type DuplicateDirection = 'right' | 'down';

/**
 * «5 mesas separadas 1 m»: copia la mesa sembrada en fila. Cada copia es una
 * mesa nueva (id nuevo) desplazada lo que mida la mesa más la separación, para
 * que queden huecos reales y no pegadas por el borde girado.
 */
export function duplicateRow(
  seed: DiningTable,
  options: { count: number; direction: DuplicateDirection; spacingCm: number },
  idFactory: () => string = newId,
): DiningTable[] {
  const originX = seed.xCm ?? 0;
  const originY = seed.yCm ?? 0;
  const box = tableBox(seed);
  const stepX = options.direction === 'right' ? box.w + options.spacingCm : 0;
  const stepY = options.direction === 'down' ? box.h + options.spacingCm : 0;
  const copies: DiningTable[] = [];
  const now = new Date().toISOString();
  for (let i = 1; i <= options.count; i += 1) {
    copies.push({
      ...seed,
      id: idFactory(),
      name: `${seed.name} ${i}`,
      xCm: snapCm(originX + stepX * i),
      yCm: snapCm(originY + stepY * i),
      createdAt: now,
      updatedAt: now,
    });
  }
  return copies;
}

export function translateTable<T extends Pick<DiningTable, 'xCm' | 'yCm'>>(table: T, dx: number, dy: number): T {
  return { ...table, xCm: (table.xCm ?? 0) + dx, yCm: (table.yCm ?? 0) + dy };
}

export function translateElement<T extends PlanElement>(element: T, dx: number, dy: number): T {
  if (element.type === 'wall') {
    return { ...element, x1: element.x1 + dx, y1: element.y1 + dy, x2: element.x2 + dx, y2: element.y2 + dy };
  }
  return { ...element, x: element.x + dx, y: element.y + dy };
}

/** Giro de 90 en 90. La caja gira y el editor la vuelve a encajar en la rejilla. */
export function nextRotation(rotationDeg: RotationDeg): RotationDeg {
  return (((rotationDeg + 90) % 360) as RotationDeg);
}

/** Crea el rectángulo de una zona a partir de dos esquinas (arrastrar). */
export function zoneFromDrag(x1: number, y1: number, x2: number, y2: number): Box {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  };
}

/**
 * Caja que encierra todo el plano. Si está vacío devuelve un salón razonable
 * (8 × 6 m) para que el lienzo no nazca con un `viewBox` de tamaño cero.
 */
export function planBounds(
  tables: Pick<DiningTable, 'xCm' | 'yCm' | 'widthCm' | 'heightCm' | 'rotationDeg' | 'status'>[],
  elements: PlanElement[],
  fallback: { widthCm: number | null; heightCm: number | null },
): Box {
  let maxX = 0;
  let maxY = 0;
  for (const table of tables) {
    if (table.status !== 'active' || table.xCm === null || table.yCm === null) continue;
    const box = tableBox(table);
    maxX = Math.max(maxX, box.x + box.w);
    maxY = Math.max(maxY, box.y + box.h);
  }
  for (const element of elements) {
    const box = elementBox(element);
    maxX = Math.max(maxX, box.x + box.w);
    maxY = Math.max(maxY, box.y + box.h);
  }
  return {
    x: 0,
    y: 0,
    w: Math.max(maxX, fallback.widthCm ?? 0, 800),
    h: Math.max(maxY, fallback.heightCm ?? 0, 600),
  };
}

/**
 * Serializa el estado del editor al cuerpo de `PUT …/plan`. Las mesas inactivas
 * NO viajan: el guardado desactiva primero todas las activas y vuelve a aplicar
 * la lista enviada, así que mandar las inactivas las reactivaría.
 */
export function buildSaveFloorPlanInput(input: {
  expectedVersion: number;
  widthCm: number | null;
  heightCm: number | null;
  zones: Pick<Zone, 'id' | 'name' | 'color' | 'status'>[];
  tables: DiningTable[];
  elements: PlanElement[];
}): SaveFloorPlanInput {
  return {
    expectedVersion: input.expectedVersion,
    floor: { widthCm: input.widthCm, heightCm: input.heightCm },
    zones: input.zones
      .filter((zone) => zone.status === 'active')
      .map((zone) => ({ id: zone.id, name: zone.name, color: zone.color })),
    tables: input.tables
      .filter((table) => table.status === 'active')
      .map((table) => ({
        id: table.id,
        name: table.name,
        capacityMin: table.capacityMin,
        capacityMax: table.capacityMax,
        zoneId: table.zoneId,
        xCm: table.xCm,
        yCm: table.yCm,
        widthCm: table.widthCm,
        heightCm: table.heightCm,
        shape: table.shape,
        rotationDeg: table.rotationDeg,
      })),
    elements: input.elements,
  };
}

/** Nombres por defecto de una mesa nueva, sin chocar con las que ya están. */
export function nextTableName(existing: Pick<DiningTable, 'name'>[], prefix = 'Mesa'): string {
  let max = 0;
  for (const table of existing) {
    const match = table.name.match(new RegExp(`^${prefix}\\s+(\\d+)$`, 'i'));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix} ${max + 1}`;
}

/**
 * Área de una zona, derivada de las mesas que tiene asignadas. El contrato de
 * `Zone` no guarda geometría (solo id, nombre y color), así que el editor no
 * puede dibujar un rectángulo propio y persistirlo: pinta el envolvente de sus
 * mesas. Sin mesas ubicadas no hay área que pintar.
 */
export function zoneBounds(
  tables: Pick<DiningTable, 'zoneId' | 'status' | 'xCm' | 'yCm' | 'widthCm' | 'heightCm' | 'rotationDeg'>[],
  zoneId: string,
  paddingCm = 30,
): Box | null {
  const members = tables.filter((t) => t.zoneId === zoneId && t.status === 'active' && t.xCm !== null && t.yCm !== null);
  if (members.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const table of members) {
    const box = tableBox(table);
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.w);
    maxY = Math.max(maxY, box.y + box.h);
  }
  return { x: minX - paddingCm, y: minY - paddingCm, w: maxX - minX + paddingCm * 2, h: maxY - minY + paddingCm * 2 };
}

export function wall(x1: number, y1: number, x2: number, y2: number): PlanWall {
  return { id: newId(), type: 'wall', x1, y1, x2, y2, thicknessCm: DEFAULT_WALL_THICKNESS_CM };
}

export function door(x: number, y: number, rotationDeg: RotationDeg = 0): PlanDoor {
  return { id: newId(), type: 'door', x, y, widthCm: DEFAULT_DOOR_WIDTH_CM, rotationDeg };
}

export function object(kind: PlanObject['kind'], x: number, y: number): PlanObject {
  const size: Record<PlanObject['kind'], [number, number]> = {
    bar: [200, 60],
    column: [40, 40],
    restroom: [120, 120],
    kitchen: [200, 160],
    plant: [50, 50],
    stairs: [120, 100],
    entrance: [120, 20],
  };
  const [widthCm, heightCm] = size[kind];
  return { id: newId(), type: 'object', kind, x, y, widthCm, heightCm, rotationDeg: 0 };
}
