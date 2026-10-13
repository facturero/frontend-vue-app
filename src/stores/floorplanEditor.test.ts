import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiningTable, Floor, FloorPlan } from '@/types/restaurant';
import { useFloorPlanEditorStore } from './floorplanEditor';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

function floor(over: Partial<Floor> = {}): Floor {
  return {
    id: 'floor-1',
    organizationId: 'org-1',
    establishmentId: 'est-1',
    name: 'Salón principal',
    widthCm: null,
    heightCm: null,
    sortOrder: 0,
    status: 'active',
    layoutVersion: 4,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function table(over: Partial<DiningTable> = {}): DiningTable {
  return {
    id: 't1',
    organizationId: 'org-1',
    floorId: 'floor-1',
    zoneId: null,
    name: 'Mesa 1',
    capacityMin: 1,
    capacityMax: 2,
    xCm: 100,
    yCm: 100,
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

function plan(over: Partial<FloorPlan> = {}): FloorPlan {
  return {
    floor: floor(),
    zones: [],
    tables: [],
    layout: { version: 4, elements: [] },
    ...over,
  };
}

function editor(loadedPlan: FloorPlan = plan()) {
  setActivePinia(createPinia());
  const store = useFloorPlanEditorStore();
  store.load('org-1:u1', loadedPlan, { preferDraft: false });
  return store;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

describe('carga del plano', () => {
  it('trae la planta, su versión y solo lo activo', () => {
    const store = editor(
      plan({
        tables: [table({ id: 'a' }), table({ id: 'b', status: 'inactive' })],
        zones: [
          { id: 'z1', organizationId: 'o', floorId: 'floor-1', name: 'Terraza', color: 'success', status: 'active', createdAt: '', updatedAt: '' },
          { id: 'z2', organizationId: 'o', floorId: 'floor-1', name: 'Vieja', color: 'error', status: 'inactive', createdAt: '', updatedAt: '' },
        ],
        layout: { version: 7, elements: [{ id: 'w', type: 'wall', x1: 0, y1: 0, x2: 100, y2: 0, thicknessCm: 10 }] },
      }),
    );
    expect(store.serverVersion).toBe(7);
    expect(store.tables.map((t) => t.id)).toEqual(['a']);
    expect(store.zones.map((z) => z.id)).toEqual(['z1']);
    expect(store.dirty).toBe(false);
    expect(store.elements).toHaveLength(1);
  });

  it('prefiere el borrador del navegador si existe', () => {
    localStorage.setItem(
      'restaurant:floorplan:org-1:u1:floor-1',
      JSON.stringify({ widthCm: 900, heightCm: 700, zones: [], tables: [table({ id: 'borrador' })], elements: [] }),
    );
    setActivePinia(createPinia());
    const store = useFloorPlanEditorStore();
    store.load('org-1:u1', plan({ tables: [table({ id: 'servidor' })] }));
    expect(store.tables.map((t) => t.id)).toEqual(['borrador']);
    expect(store.widthCm).toBe(900);
    expect(store.dirty).toBe(true);
  });
});

describe('comandos y deshacer/rehacer', () => {
  it('crear una mesa se puede deshacer y rehacer', () => {
    const store = editor();
    const id = store.addTableAt('mesa4', 300, 300);
    expect(store.tables).toHaveLength(1);
    expect(store.tables[0]).toMatchObject({ id, name: 'Mesa 1', widthCm: 120, heightCm: 80 });

    store.undo();
    expect(store.tables).toHaveLength(0);
    expect(store.canRedo).toBe(true);

    store.redo();
    expect(store.tables).toHaveLength(1);
  });

  it('un comando nuevo borra la pila de rehacer', () => {
    const store = editor();
    store.addTableAt('mesa2', 0, 0);
    store.undo();
    store.addZone('Terraza');
    expect(store.canRedo).toBe(false);
  });

  it('mueve, gira y borra la mesa seleccionada sin salirse de la rejilla', () => {
    const store = editor(plan({ tables: [table({ id: 'a', xCm: 100, yCm: 100 })] }));
    store.select({ kind: 'table', id: 'a' });
    store.moveSelection(35, 0);
    expect(store.tables[0]!.xCm).toBe(135);
    store.setTablePosition('a', 132, 47);
    expect(store.tables[0]).toMatchObject({ xCm: 130, yCm: 50 });
    store.rotateSelection();
    expect(store.tables[0]!.rotationDeg).toBe(90);
    store.removeSelection();
    expect(store.tables).toHaveLength(0);
  });

  it('la mesa redonda conserva ancho y alto iguales (diámetro)', () => {
    const store = editor();
    const id = store.addTableAt('redonda4', 0, 0);
    expect(store.tables[0]).toMatchObject({ shape: 'round', widthCm: 100, heightCm: 100 });
    store.updateTable(id, { widthCm: 120 });
    expect(store.tables[0]).toMatchObject({ widthCm: 120, heightCm: 120 });
  });
});

describe('paredes', () => {
  it('encadena segmentos ortogonales: nunca en diagonal', () => {
    const store = editor();
    store.setTool('wall');
    store.commitWallPoint(0, 0);
    store.moveWallCursor(400, 120); // el eje dominante manda: horizontal
    store.commitWallPoint();
    store.moveWallCursor(420, 500); // ahora vertical
    store.commitWallPoint();
    store.finishWall();

    expect(store.elements).toEqual([
      expect.objectContaining({ type: 'wall', x1: 0, y1: 0, x2: 400, y2: 0 }),
      expect.objectContaining({ type: 'wall', x1: 400, y1: 0, x2: 400, y2: 500 }),
    ]);
  });

  it('escribir la medida fija la longitud exacta', () => {
    const store = editor();
    store.setTool('wall');
    store.commitWallPoint(0, 0);
    store.moveWallCursor(137, 20);
    store.applyWallLength(320);
    store.commitWallPoint();
    expect(store.elements[0]).toMatchObject({ x1: 0, y1: 0, x2: 320, y2: 0 });
  });

  it('el atajo «Salón» crea cuatro paredes y fija el tamaño del local', () => {
    const store = editor();
    store.createRoom(800, 600);
    expect(store.elements).toHaveLength(4);
    expect(store.widthCm).toBe(800);
    expect(store.heightCm).toBe(600);
  });
});

describe('zonas', () => {
  it('crear una zona y borrarla deja las mesas sin zona', () => {
    const store = editor();
    const zoneId = store.addZone('Terraza', 'success');
    const tableId = store.addTableAt('mesa2', 0, 0, zoneId);
    expect(store.tables.find((t) => t.id === tableId)!.zoneId).toBe(zoneId);
    store.select({ kind: 'zone', id: zoneId });
    store.removeSelection();
    expect(store.zones).toHaveLength(0);
    expect(store.tables[0]!.zoneId).toBeNull();
  });
});

describe('copias en fila', () => {
  it('duplica la mesa seleccionada con separación y nombre nuevo', () => {
    const store = editor(plan({ tables: [table({ id: 'a', name: 'Mesa 1', widthCm: 120, xCm: 100, yCm: 0 })] }));
    store.duplicateTable('a', { count: 2, direction: 'right', spacingCm: 100 });
    expect(store.tables).toHaveLength(3);
    expect(store.tables.map((t) => t.xCm)).toEqual([100, 320, 540]);
  });
});

describe('avisos del plano', () => {
  it('detecta mesas solapadas', () => {
    const store = editor(
      plan({ tables: [table({ id: 'a', xCm: 0, yCm: 0 }), table({ id: 'b', xCm: 40, yCm: 0 })] }),
    );
    expect(store.issues.overlapping.sort()).toEqual(['a', 'b']);
    expect(store.issueIds.has('a')).toBe(true);
  });
});

describe('serialización y guardado', () => {
  it('el cuerpo de guardado lleva la versión base y descarta lo inactivo', () => {
    const store = editor();
    store.addTableAt('mesa2', 0, 0);
    const active = store.tables[0]!.id;
    store.select({ kind: 'table', id: active });
    store.duplicateTable(active, { count: 1, direction: 'right', spacingCm: 50 });
    store.select({ kind: 'table', id: store.tables[1]!.id });
    store.removeSelection(); // la copia se va del plano

    const payload = store.toPayload();
    expect(payload.expectedVersion).toBe(4);
    expect(payload.tables.map((t) => t.id)).toEqual([active]);
  });

  it('al guardar sube la versión base y borra el borrador', () => {
    const store = editor();
    store.addTableAt('mesa2', 0, 0);
    expect(store.dirty).toBe(true);
    expect(store.hasDraft('org-1:u1', 'floor-1')).toBe(true);
    store.markSaved(floor({ layoutVersion: 5, widthCm: 800, heightCm: 600 }));
    expect(store.serverVersion).toBe(5);
    expect(store.dirty).toBe(false);
    expect(store.hasDraft('org-1:u1', 'floor-1')).toBe(false);
  });
});
