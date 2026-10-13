/**
 * Geometría para unir paredes en el editor del plano. Todo es puro (sin Vue ni DOM) para probarlo sin pantalla.
 *
 * Dos ideas guían el diseño:
 *  - **Las paredes de este entregable son rectas y ortogonales** (horizontales o verticales). Un imán que la sacara de línea para pegarla a
 *    un punto cercano daría una pared torcida, así que el imán solo mueve la pared a lo largo de su propio eje: se pega a una esquina
 *    exacta cuando está alineada con ella, y si no, solo se alinea con ella.
 *  - **«Unida» quiere decir que toca**: un extremo de pared que coincide con el extremo de otra, o que descansa sobre el cuerpo de otra
 *    (una «T»). Es lo que el cajero ve como «las paredes están pegadas» y lo que hace que mover una pared arrastre a las que le llegan.
 *
 * Unidades: centímetros enteros.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface WallLike {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Cuánto se tolera de diferencia para decir que dos puntos «son el mismo» (el imán trabaja a 10 cm, así que 1 cm sobra). */
export const TOUCH_CM = 1;
/** Hasta dónde se busca una pared vecina para unir un extremo suelto (un hueco más grande se considera intencionado). */
export const JOIN_TOLERANCE_CM = 30;

export type SnapKind = 'endpoint' | 'segment' | 'align' | 'none';

export interface WallSnap {
  point: Pt;
  kind: SnapKind;
}

export type Orientation = 'h' | 'v' | 'd';

export function orientationOf(wall: WallLike): Orientation {
  if (wall.y1 === wall.y2) return 'h';
  if (wall.x1 === wall.x2) return 'v';
  return 'd';
}

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
const samePoint = (a: Pt, b: Pt): boolean => dist(a, b) <= TOUCH_CM;

/** Punto más cercano de un segmento a `p` (incluye los extremos). */
export function closestOnSegment(p: Pt, wall: WallLike): Pt {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: wall.x1, y: wall.y1 };
  const t = Math.max(0, Math.min(1, ((p.x - wall.x1) * dx + (p.y - wall.y1) * dy) / len2));
  return { x: wall.x1 + t * dx, y: wall.y1 + t * dy };
}

export function touchesWall(p: Pt, wall: WallLike): boolean {
  return dist(p, closestOnSegment(p, wall)) <= TOUCH_CM;
}

export function endpointsOf(wall: WallLike): [Pt, Pt] {
  return [
    { x: wall.x1, y: wall.y1 },
    { x: wall.x2, y: wall.y2 },
  ];
}

function nearestEndpoint(p: Pt, walls: WallLike[], radius: number, ignore?: Pt): Pt | null {
  let best: Pt | null = null;
  let bestD = radius;
  for (const wall of walls) {
    for (const e of endpointsOf(wall)) {
      if (ignore && samePoint(e, ignore)) continue;
      const d = dist(p, e);
      if (d <= bestD) {
        best = e;
        bestD = d;
      }
    }
  }
  return best;
}

/**
 * Destino de un extremo de pared que se está dibujando.
 *
 * - Sin ancla (primer clic): se pega a la esquina o al cuerpo de una pared cercana.
 * - Con ancla y modo ortogonal: el punto sale del cursor en línea recta desde el ancla; si queda cerca de una esquina alineada se pega
 *   exacta a ella (cierra el cuarto); si la esquina no está alineada solo se alinea con ella; si llega al cuerpo de una pared que le
 *   atraviesa el camino, se detiene justo en ella (una «T»).
 * - `free` (tecla Mayús): cualquier ángulo, con el mismo imán a esquinas y paredes.
 */
export function snapWallTarget(
  anchor: Pt | null,
  cursor: Pt,
  walls: WallLike[],
  radius: number,
  options: { free?: boolean; step?: number } = {},
): WallSnap {
  const step = options.step ?? 10;
  const snapped: Pt = { x: Math.round(cursor.x / step) * step, y: Math.round(cursor.y / step) * step };

  if (!anchor || options.free) {
    const corner = nearestEndpoint(cursor, walls, radius, anchor ?? undefined);
    if (corner) return { point: corner, kind: 'endpoint' };
    let best: { p: Pt; d: number } | null = null;
    for (const wall of walls) {
      const p = closestOnSegment(cursor, wall);
      const d = dist(cursor, p);
      if (d <= radius && (!best || d < best.d)) best = { p, d };
    }
    if (best) return { point: { x: Math.round(best.p.x), y: Math.round(best.p.y) }, kind: 'segment' };
    return { point: snapped, kind: 'none' };
  }

  const horizontal = Math.abs(snapped.x - anchor.x) >= Math.abs(snapped.y - anchor.y);
  const target: Pt = horizontal ? { x: snapped.x, y: anchor.y } : { x: anchor.x, y: snapped.y };

  // 1. Esquinas: la más cercana al punto ya alineado.
  const corner = nearestEndpoint(target, walls, radius, anchor);
  if (corner) {
    const aligned = horizontal ? corner.y === anchor.y : corner.x === anchor.x;
    if (aligned) return { point: corner, kind: 'endpoint' };
    return { point: horizontal ? { x: corner.x, y: anchor.y } : { x: anchor.x, y: corner.y }, kind: 'align' };
  }

  // 2. Cuerpo de una pared que cruza el camino: horizontal → paredes verticales que cubren la altura del ancla (y al revés).
  let hit: { value: number; d: number } | null = null;
  for (const wall of walls) {
    const o = orientationOf(wall);
    if (horizontal && o === 'v') {
      const lo = Math.min(wall.y1, wall.y2) - TOUCH_CM;
      const hi = Math.max(wall.y1, wall.y2) + TOUCH_CM;
      const d = Math.abs(target.x - wall.x1);
      if (anchor.y >= lo && anchor.y <= hi && d <= radius && (!hit || d < hit.d)) hit = { value: wall.x1, d };
    } else if (!horizontal && o === 'h') {
      const lo = Math.min(wall.x1, wall.x2) - TOUCH_CM;
      const hi = Math.max(wall.x1, wall.x2) + TOUCH_CM;
      const d = Math.abs(target.y - wall.y1);
      if (anchor.x >= lo && anchor.x <= hi && d <= radius && (!hit || d < hit.d)) hit = { value: wall.y1, d };
    }
  }
  if (hit) {
    return { point: horizontal ? { x: hit.value, y: anchor.y } : { x: anchor.x, y: hit.value }, kind: 'segment' };
  }

  return { point: target, kind: 'none' };
}

/** ¿El punto toca alguna pared de la lista (extremo contra extremo o contra el cuerpo)? */
export function touchesAny(p: Pt, walls: WallLike[], exceptId?: string): boolean {
  return walls.some((w) => w.id !== exceptId && touchesWall(p, w));
}

export interface LooseEnd {
  wallId: string;
  end: 1 | 2;
  from: Pt;
  to: Pt;
}

/**
 * Extremos «sueltos»: no tocan ninguna pared, pero hay una perpendicular (o colineal) a menos de `tolerance` cm a la que se pueden unir.
 * Un extremo libre sin nada cerca NO es un hueco: es una pared abierta a propósito. Solo se proponen uniones que mantienen la pared
 * recta: la horizontal se estira o encoge en `x` hasta la vertical, y la vertical en `y` hasta la horizontal.
 */
export function findLooseEnds(walls: WallLike[], tolerance: number = JOIN_TOLERANCE_CM): LooseEnd[] {
  const found: LooseEnd[] = [];
  for (const wall of walls) {
    const o = orientationOf(wall);
    if (o === 'd') continue;
    const ends: Array<[1 | 2, Pt]> = [
      [1, { x: wall.x1, y: wall.y1 }],
      [2, { x: wall.x2, y: wall.y2 }],
    ];
    for (const [end, from] of ends) {
      if (touchesAny(from, walls, wall.id)) continue;
      let best: { to: Pt; d: number } | null = null;
      for (const other of walls) {
        if (other.id === wall.id) continue;
        const oo = orientationOf(other);
        if (oo === 'd' || oo === o) continue; // solo perpendiculares: la unión es una esquina o una «T»
        const to: Pt = o === 'h' ? { x: other.x1, y: wall.y1 } : { x: wall.x1, y: other.y1 };
        // Debe caer dentro del tramo de la otra pared (con la tolerancia): si no, no la toca ni estirándose.
        const lo = oo === 'v' ? Math.min(other.y1, other.y2) : Math.min(other.x1, other.x2);
        const hi = oo === 'v' ? Math.max(other.y1, other.y2) : Math.max(other.x1, other.x2);
        const along = oo === 'v' ? wall.y1 : wall.x1;
        if (along < lo - tolerance || along > hi + tolerance) continue;
        const d = o === 'h' ? Math.abs(from.x - to.x) : Math.abs(from.y - to.y);
        if (d > 0 && d <= tolerance && (!best || d < best.d)) best = { to, d };
      }
      if (best) found.push({ wallId: wall.id, end, from, to: best.to });
    }
  }
  return found;
}

/** Aplica todas las uniones propuestas por `findLooseEnds`. Devuelve las paredes nuevas y cuántos extremos se movieron. */
export function joinLooseEnds<T extends WallLike>(walls: T[], tolerance: number = JOIN_TOLERANCE_CM): { walls: T[]; joined: number } {
  const loose = findLooseEnds(walls, tolerance);
  if (loose.length === 0) return { walls, joined: 0 };
  const byWall = new Map<string, LooseEnd[]>();
  for (const l of loose) byWall.set(l.wallId, [...(byWall.get(l.wallId) ?? []), l]);
  const next = walls.map((w) => {
    const moves = byWall.get(w.id);
    if (!moves) return w;
    let copy = { ...w };
    for (const m of moves) copy = m.end === 1 ? { ...copy, x1: m.to.x, y1: m.to.y } : { ...copy, x2: m.to.x, y2: m.to.y };
    return copy;
  });
  return { walls: next, joined: loose.length };
}

/**
 * Mueve una pared en perpendicular a sí misma (la horizontal sube o baja, la vertical va a un lado u otro) y arrastra a las paredes
 * perpendiculares que le llegan —por la esquina o por el cuerpo—: estiran o encogen su largo y siguen pegadas. Así se agranda un cuarto
 * moviendo una sola pared. Las paredes paralelas y las diagonales no se tocan.
 */
export function moveWallPerpendicular<T extends WallLike>(walls: T[], wallId: string, delta: number): T[] {
  const target = walls.find((w) => w.id === wallId);
  if (!target || delta === 0) return walls;
  const o = orientationOf(target);
  if (o === 'd') return walls;
  const ends = endpointsOf(target);
  return walls.map((w) => {
    if (w.id === wallId) return o === 'h' ? { ...w, y1: w.y1 + delta, y2: w.y2 + delta } : { ...w, x1: w.x1 + delta, x2: w.x2 + delta };
    const oo = orientationOf(w);
    if (oo === 'd' || oo === o) return w;
    // La que llega a la pared movida: cada uno de sus extremos que la toca se desplaza a lo largo de su propio eje.
    let copy = { ...w };
    const [a, b] = endpointsOf(w);
    if (touchesWall(a, target) || ends.some((e) => samePoint(e, a))) {
      copy = o === 'h' ? { ...copy, y1: copy.y1 + delta } : { ...copy, x1: copy.x1 + delta };
    }
    if (touchesWall(b, target) || ends.some((e) => samePoint(e, b))) {
      copy = o === 'h' ? { ...copy, y2: copy.y2 + delta } : { ...copy, x2: copy.x2 + delta };
    }
    return copy;
  });
}

/** Coordenadas de otras paredes de la misma orientación, para alinear la que se arrastra con ellas. */
export function alignmentCandidates(walls: WallLike[], wallId: string): number[] {
  const target = walls.find((w) => w.id === wallId);
  if (!target) return [];
  const o = orientationOf(target);
  if (o === 'd') return [];
  return walls.filter((w) => w.id !== wallId && orientationOf(w) === o).map((w) => (o === 'h' ? w.y1 : w.x1));
}
