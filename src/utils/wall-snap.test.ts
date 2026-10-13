import { describe, expect, it } from 'vitest';
import {
  alignmentCandidates,
  closestOnSegment,
  findLooseEnds,
  joinLooseEnds,
  moveWallPerpendicular,
  snapWallTarget,
  touchesAny,
  type WallLike,
} from './wall-snap';

const w = (id: string, x1: number, y1: number, x2: number, y2: number): WallLike => ({ id, x1, y1, x2, y2 });

/** Un cuarto de 8 × 6 m al que le falta el cuarto lado (de (0,600) a (0,0)). */
const cuartoAbierto = [w('a', 0, 0, 800, 0), w('b', 800, 0, 800, 600), w('c', 800, 600, 0, 600)];

describe('imán al dibujar una pared', () => {
  it('el primer clic se pega a la esquina de otra pared cercana', () => {
    const snap = snapWallTarget(null, { x: 806, y: 12 }, cuartoAbierto, 25);
    expect(snap).toEqual({ point: { x: 800, y: 0 }, kind: 'endpoint' });
  });

  it('el primer clic sobre el cuerpo de una pared queda sobre ella (inicio de una «T»)', () => {
    const snap = snapWallTarget(null, { x: 403, y: 14 }, cuartoAbierto, 25);
    expect(snap.kind).toBe('segment');
    expect(snap.point).toEqual({ x: 403, y: 0 });
  });

  it('cerrar el cuarto: el último lado se pega EXACTO a la esquina de partida', () => {
    // Anclado en (0,600), el cursor anda cerca de (0,0) pero algo desviado.
    const snap = snapWallTarget({ x: 0, y: 600 }, { x: 12, y: 22 }, cuartoAbierto, 25);
    expect(snap).toEqual({ point: { x: 0, y: 0 }, kind: 'endpoint' });
  });

  it('una esquina cercana pero no alineada solo alinea (no tuerce la pared)', () => {
    // Desde (0,300) hacia la derecha, cerca de una esquina en (800,320) que queda 20 cm más abajo: la pared sigue horizontal.
    const snap = snapWallTarget({ x: 0, y: 300 }, { x: 790, y: 300 }, [w('p', 800, 320, 900, 320)], 40);
    expect(snap.point.y).toBe(300);
    expect(snap.kind).toBe('align');
    expect(snap.point.x).toBe(800);
  });

  it('una pared que llega al cuerpo de otra se detiene justo en ella (una «T»)', () => {
    // Desde (0,300) hacia la derecha, hasta la pared vertical x = 800.
    const snap = snapWallTarget({ x: 0, y: 300 }, { x: 790, y: 305 }, [w('b', 800, 0, 800, 600)], 25);
    expect(snap).toEqual({ point: { x: 800, y: 300 }, kind: 'segment' });
  });

  it('una pared vertical también llega a una horizontal', () => {
    const snap = snapWallTarget({ x: 400, y: 100 }, { x: 405, y: 590 }, cuartoAbierto, 25);
    expect(snap).toEqual({ point: { x: 400, y: 600 }, kind: 'segment' });
  });

  it('lejos de todo, solo el imán de 10 cm y en ángulo recto', () => {
    const snap = snapWallTarget({ x: 100, y: 100 }, { x: 347, y: 130 }, [], 25);
    expect(snap).toEqual({ point: { x: 350, y: 100 }, kind: 'none' });
  });

  it('el radio manda: fuera del radio no se pega', () => {
    const snap = snapWallTarget(null, { x: 900, y: 100 }, cuartoAbierto, 25);
    expect(snap.kind).toBe('none');
  });

  it('con Mayús (libre) acepta cualquier ángulo pero sigue pegándose a esquinas', () => {
    expect(snapWallTarget({ x: 0, y: 0 }, { x: 303, y: 207 }, [], 25, { free: true })).toEqual({ point: { x: 300, y: 210 }, kind: 'none' });
    expect(snapWallTarget({ x: 0, y: 0 }, { x: 795, y: 8 }, cuartoAbierto, 25, { free: true }).kind).toBe('endpoint');
  });

  it('no se pega a su propio ancla', () => {
    const snap = snapWallTarget({ x: 800, y: 0 }, { x: 806, y: 3 }, cuartoAbierto, 25);
    // La esquina (800,0) es el ancla: no cuenta; queda un punto ortogonal de longitud ≈ 0 que el almacén descarta.
    expect(snap.kind).not.toBe('endpoint');
  });
});

describe('qué es «unida»', () => {
  it('extremo contra extremo y extremo contra el cuerpo cuentan; un hueco no', () => {
    expect(touchesAny({ x: 800, y: 0 }, [w('b', 800, 0, 800, 600)])).toBe(true);
    expect(touchesAny({ x: 800, y: 300 }, [w('b', 800, 0, 800, 600)])).toBe(true);
    expect(touchesAny({ x: 790, y: 300 }, [w('b', 800, 0, 800, 600)])).toBe(false);
  });

  it('el punto más cercano de un segmento se queda dentro del segmento', () => {
    expect(closestOnSegment({ x: 5000, y: 5000 }, w('a', 0, 0, 800, 0))).toEqual({ x: 800, y: 0 });
  });
});

describe('extremos sueltos', () => {
  it('detecta una esquina que no cerró por 20 cm y propone la unión que mantiene las paredes rectas', () => {
    const paredes = [w('a', 0, 0, 780, 0), w('b', 800, 0, 800, 600)];
    const loose = findLooseEnds(paredes);
    expect(loose).toEqual([{ wallId: 'a', end: 2, from: { x: 780, y: 0 }, to: { x: 800, y: 0 } }]);
  });

  it('una pared abierta a propósito (nada cerca) no es un hueco', () => {
    expect(findLooseEnds([w('a', 0, 0, 500, 0), w('b', 1500, 0, 1500, 600)])).toEqual([]);
  });

  it('un hueco grande (más de 30 cm) se considera intencional', () => {
    expect(findLooseEnds([w('a', 0, 0, 700, 0), w('b', 800, 0, 800, 600)])).toEqual([]);
  });

  it('las paredes ya unidas no se marcan, ni en esquina ni en «T»', () => {
    expect(findLooseEnds(cuartoAbierto)).toEqual([]);
    expect(findLooseEnds([w('a', 0, 300, 800, 300), w('b', 800, 0, 800, 600)])).toEqual([]);
  });

  it('un extremo que se queda corto de una «T» se estira hasta la pared', () => {
    const { walls, joined } = joinLooseEnds([w('a', 0, 300, 790, 300), w('b', 800, 0, 800, 600)]);
    expect(joined).toBe(1);
    expect(walls[0]).toMatchObject({ x2: 800, y2: 300 });
    expect(walls[1]).toEqual(w('b', 800, 0, 800, 600));
  });

  it('dos extremos sueltos de un mismo rincón se unen en la esquina exacta sin chocar entre sí', () => {
    // La horizontal acaba en x=790 (le faltan 10) y la vertical empieza en y=15 (le faltan 15): la esquina es (800, 0).
    const { walls, joined } = joinLooseEnds([w('a', 0, 0, 790, 0), w('b', 800, 15, 800, 600)]);
    expect(joined).toBe(2);
    expect(walls[0]).toMatchObject({ x2: 800, y2: 0 });
    expect(walls[1]).toMatchObject({ x1: 800, y1: 0 });
  });

  it('sin nada que unir devuelve las mismas paredes', () => {
    const r = joinLooseEnds(cuartoAbierto);
    expect(r.joined).toBe(0);
    expect(r.walls).toBe(cuartoAbierto);
  });
});

describe('mover una pared arrastra a las que le llegan', () => {
  const cuarto = [w('arriba', 0, 0, 800, 0), w('der', 800, 0, 800, 600), w('abajo', 800, 600, 0, 600), w('izq', 0, 600, 0, 0)];

  it('bajar la pared de arriba 100 cm acorta las verticales y todo sigue unido', () => {
    const r = moveWallPerpendicular(cuarto, 'arriba', 100);
    expect(r.find((p) => p.id === 'arriba')).toMatchObject({ y1: 100, y2: 100 });
    expect(r.find((p) => p.id === 'der')).toMatchObject({ x1: 800, y1: 100, x2: 800, y2: 600 });
    expect(r.find((p) => p.id === 'izq')).toMatchObject({ x1: 0, y1: 600, x2: 0, y2: 100 });
    expect(r.find((p) => p.id === 'abajo')).toEqual(cuarto[2]);
    expect(findLooseEnds(r)).toEqual([]);
  });

  it('mover la pared derecha estira las horizontales', () => {
    const r = moveWallPerpendicular(cuarto, 'der', 200);
    expect(r.find((p) => p.id === 'arriba')).toMatchObject({ x2: 1000 });
    expect(r.find((p) => p.id === 'abajo')).toMatchObject({ x1: 1000 });
  });

  it('una pared que llega al cuerpo (una «T») también sigue a la pared movida', () => {
    const conT = [...cuarto, w('medio', 0, 300, 800, 300)];
    const r = moveWallPerpendicular(conT, 'der', -100);
    expect(r.find((p) => p.id === 'medio')).toMatchObject({ x2: 700 });
  });

  it('las paredes paralelas no se tocan y delta 0 no cambia nada', () => {
    const r = moveWallPerpendicular(cuarto, 'arriba', 50);
    expect(r.find((p) => p.id === 'abajo')).toBe(cuarto[2]);
    expect(moveWallPerpendicular(cuarto, 'arriba', 0)).toBe(cuarto);
  });

  it('una diagonal no se mueve así', () => {
    const d = [w('d', 0, 0, 100, 100)];
    expect(moveWallPerpendicular(d, 'd', 50)).toBe(d);
  });

  it('las coordenadas de alineación son las de las paredes de la misma orientación', () => {
    expect(alignmentCandidates(cuarto, 'arriba')).toEqual([600]);
    expect(alignmentCandidates(cuarto, 'der')).toEqual([0]);
  });
});
