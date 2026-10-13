import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type {
  DiningTable,
  Floor,
  FloorPlan,
  PlanElement,
  RotationDeg,
  SaveFloorPlanInput,
  Zone,
  ZoneColor,
} from '@/types/restaurant';
import {
  buildSaveFloorPlanInput,
  door as makeDoor,
  duplicateRow,
  findPlanIssues,
  newId,
  nextRotation,
  nextTableName,
  object as makeObject,
  snapCm,
  translateElement,
  translateTable,
  wall as makeWall,
  TABLE_PRESETS,
  type Box,
  type DuplicateDirection,
  type PlanIssues,
  type ViewBox,
} from '@/utils/restaurant-plan';

export type EditorTool = 'select' | 'wall' | 'door' | 'table' | 'zone' | 'object' | 'erase';

export interface EditorSelection {
  kind: 'table' | 'zone' | 'element';
  id: string;
}

interface Snapshot {
  widthCm: number | null;
  heightCm: number | null;
  zones: Zone[];
  tables: DiningTable[];
  elements: PlanElement[];
}

interface Point {
  x: number;
  y: number;
}

// Se reexporta para quien importaba `ViewBox` de este store; la definición vive
// en `utils/restaurant-plan.ts`, con la geometría.
export type { ViewBox };

type TablePatch = Partial<
  Pick<DiningTable, 'name' | 'capacityMin' | 'capacityMax' | 'zoneId' | 'shape' | 'rotationDeg' | 'widthCm' | 'heightCm'>
>;

function dbKey(scope: string, floorId: string): string {
  return `restaurant:floorplan:${scope}:${floorId}`;
}

/** Copia profunda por JSON: el estado está hecho de datos planos y así no
 *  tropieza con los proxies reactivos de Pinia (que structuredClone rechaza). */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Estado del editor del plano: mesas, zonas y elementos, con **comandos y
 * deshacer/rehacer ilimitados**. Es un store aparte del de datos
 * (`stores/restaurant.ts`) porque su ciclo de vida es distinto: el editor
 * acumula un borrador que puede no llegar a guardarse nunca.
 *
 * El borrador **se autoguarda en `localStorage`** (clave por usuario,
 * organización y planta). No hay estado borrador/publicado en el servidor: al
 * pulsar «Guardar» se manda el plano entero en una sola petición atómica con
 * `expectedVersion`.
 *
 * Nota sobre las zonas: el contrato de `Zone` solo admite id, nombre y color
 * (no tiene geometría), así que el editor NO guarda un rectángulo dibujado; el
 * área de una zona se deriva de las mesas que tiene asignadas (`zoneBounds`).
 */
export const useFloorPlanEditorStore = defineStore('floorplanEditor', () => {
  const scope = ref('sin-org:sin-usuario');
  const floorId = ref<string | null>(null);
  const organizationId = ref('');
  const floorName = ref('');
  const widthCm = ref<number | null>(null);
  const heightCm = ref<number | null>(null);
  const zones = ref<Zone[]>([]);
  const tables = ref<DiningTable[]>([]);
  const elements = ref<PlanElement[]>([]);

  const serverVersion = ref(0);
  const dirty = ref(false);

  const activeTool = ref<EditorTool>('select');
  const selection = ref<EditorSelection | null>(null);

  const past = ref<Snapshot[]>([]);
  const future = ref<Snapshot[]>([]);

  // Dibujo de paredes: una cadena clic–clic. El «ancla» es el último punto
  // confirmado y `pendingWall` el que sigue al cursor (ortogonal y con imán).
  const wallAnchor = ref<Point | null>(null);
  const pendingWall = ref<Point | null>(null);

  const view = ref<ViewBox | null>(null);

  const canUndo = computed(() => past.value.length > 0);
  const canRedo = computed(() => future.value.length > 0);
  const issues = computed<PlanIssues>(() =>
    findPlanIssues(tables.value, { widthCm: widthCm.value, heightCm: heightCm.value }),
  );
  const placedTables = computed(() => tables.value.filter((t) => t.xCm !== null && t.yCm !== null));
  const issueIds = computed(() => {
    const found = issues.value;
    return new Set([...found.overlapping, ...found.outsideFloor, ...found.invalidCapacity]);
  });

  const selectedTable = computed<DiningTable | null>(() =>
    selection.value?.kind === 'table' ? tables.value.find((t) => t.id === selection.value!.id) ?? null : null,
  );
  const selectedZone = computed<Zone | null>(() =>
    selection.value?.kind === 'zone' ? zones.value.find((z) => z.id === selection.value!.id) ?? null : null,
  );
  const selectedElement = computed<PlanElement | null>(() =>
    selection.value?.kind === 'element' ? elements.value.find((e) => e.id === selection.value!.id) ?? null : null,
  );

  function snapshot(): Snapshot {
    return deepClone({
      widthCm: widthCm.value,
      heightCm: heightCm.value,
      zones: zones.value,
      tables: tables.value,
      elements: elements.value,
    });
  }

  /** Ejecuta un cambio como un comando: apila el estado previo, marca sucio y
   *  autoguarda el borrador. Toda mutación pasa por aquí. */
  function commit(mutator: () => void): void {
    past.value = [...past.value, snapshot()];
    future.value = [];
    mutator();
    dirty.value = true;
    persistDraft();
  }

  function restore(snap: Snapshot): void {
    widthCm.value = snap.widthCm;
    heightCm.value = snap.heightCm;
    zones.value = snap.zones;
    tables.value = snap.tables;
    elements.value = snap.elements;
  }

  function afterHistoryMove(): void {
    selection.value = null;
    wallAnchor.value = null;
    pendingWall.value = null;
    dirty.value = true;
    persistDraft();
  }

  function undo(): void {
    const previous = past.value[past.value.length - 1];
    if (!previous) return;
    future.value = [...future.value, snapshot()];
    past.value = past.value.slice(0, -1);
    restore(previous);
    afterHistoryMove();
  }

  function redo(): void {
    const next = future.value[future.value.length - 1];
    if (!next) return;
    past.value = [...past.value, snapshot()];
    future.value = future.value.slice(0, -1);
    restore(next);
    afterHistoryMove();
  }

  function persistDraft(): void {
    if (!floorId.value) return;
    try {
      const payload: Snapshot = {
        widthCm: widthCm.value,
        heightCm: heightCm.value,
        zones: zones.value,
        tables: tables.value,
        elements: elements.value,
      };
      localStorage.setItem(dbKey(scope.value, floorId.value), JSON.stringify(payload));
    } catch {
      // Sin almacenamiento el editor sigue funcionando: solo se pierde el
      // borrador al recargar.
    }
  }

  function clearDraft(): void {
    if (!floorId.value) return;
    try {
      localStorage.removeItem(dbKey(scope.value, floorId.value));
    } catch {
      // nada que limpiar
    }
  }

  function hasDraft(targetScope: string, targetFloorId: string): boolean {
    try {
      return localStorage.getItem(dbKey(targetScope, targetFloorId)) !== null;
    } catch {
      return false;
    }
  }

  function readDraft(targetScope: string, targetFloorId: string): Snapshot | null {
    try {
      const raw = localStorage.getItem(dbKey(targetScope, targetFloorId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<Snapshot>;
      if (!Array.isArray(parsed.tables) || !Array.isArray(parsed.zones) || !Array.isArray(parsed.elements)) return null;
      return {
        widthCm: parsed.widthCm ?? null,
        heightCm: parsed.heightCm ?? null,
        zones: parsed.zones as Zone[],
        tables: parsed.tables as DiningTable[],
        elements: parsed.elements as PlanElement[],
      };
    } catch {
      return null;
    }
  }

  /**
   * Carga el plano publicado. Si hay un borrador del navegador para esa persona
   * y planta, se prefiere el borrador: es lo que el dueño dejó a medias.
   */
  /**
   * Las mesas creadas desde la pantalla de mesas nacen **sin ubicar** (`xCm`
   * nulo). Al abrir el editor se colocan en una rejilla de trabajo para poder
   * arrastrarlas en lugar de verlas todas apiladas en el origen. No es un
   * cambio hasta que se pulse «Guardar».
   */
  function placeUnplaced(list: DiningTable[]): DiningTable[] {
    const originX = 100;
    const originY = 100;
    const stepX = 200;
    const stepY = 200;
    const perRow = 6;
    let index = 0;
    return list.map((table) => {
      if (table.xCm !== null && table.yCm !== null) return table;
      const col = index % perRow;
      const row = Math.floor(index / perRow);
      index += 1;
      return { ...table, xCm: originX + col * stepX, yCm: originY + row * stepY };
    });
  }

  function load(targetScope: string, plan: FloorPlan, options: { preferDraft?: boolean } = {}): void {
    scope.value = targetScope;
    floorId.value = plan.floor.id;
    organizationId.value = plan.floor.organizationId;
    floorName.value = plan.floor.name;
    widthCm.value = plan.floor.widthCm;
    heightCm.value = plan.floor.heightCm;
    // Solo lo activo se edita: lo inactivo no viaja en el plano y el guardado lo
    // desactivaría igual, así que mostrarlo sería engañoso.
    zones.value = plan.zones.filter((z) => z.status === 'active');
    tables.value = placeUnplaced(plan.tables.filter((t) => t.status === 'active'));
    elements.value = deepClone(plan.layout.elements);
    serverVersion.value = plan.layout.version;
    past.value = [];
    future.value = [];
    selection.value = null;
    activeTool.value = 'select';
    wallAnchor.value = null;
    pendingWall.value = null;

    const draft = options.preferDraft === false ? null : readDraft(targetScope, plan.floor.id);
    if (draft) {
      restore(draft);
      dirty.value = true;
      return;
    }
    dirty.value = false;
  }

  function setTool(tool: EditorTool): void {
    activeTool.value = tool;
    if (tool !== 'wall') {
      wallAnchor.value = null;
      pendingWall.value = null;
    }
    if (tool !== 'select') selection.value = null;
  }

  function select(next: EditorSelection | null): void {
    selection.value = next;
  }

  // ── Paredes ──────────────────────────────────────────────────────────────

  /** Punto ortogonal (nunca diagonal) y con imán, a partir del cursor. */
  function orthogonalPoint(from: Point, x: number, y: number): Point {
    const sx = snapCm(x);
    const sy = snapCm(y);
    return Math.abs(sx - from.x) >= Math.abs(sy - from.y) ? { x: sx, y: from.y } : { x: from.x, y: sy };
  }

  /** Ortogonal y con imán: en este entregable solo hay paredes rectas. */
  function constrainPoint(from: Point, x: number, y: number, free = false): Point {
    if (free) return { x: snapCm(x), y: snapCm(y) };
    return orthogonalPoint(from, x, y);
  }

  function moveWallCursor(x: number, y: number, free = false): void {
    const anchor = wallAnchor.value;
    if (!anchor) return;
    pendingWall.value = constrainPoint(anchor, x, y, free);
  }

  /** Escribir una medida mientras se dibuja fija esa longitud exacta. */
  function applyWallLength(lengthCm: number): void {
    const anchor = wallAnchor.value;
    if (!anchor || !pendingWall.value) return;
    const horizontal = pendingWall.value.y === anchor.y;
    const value = Math.max(0, Math.round(lengthCm));
    pendingWall.value = horizontal ? { x: anchor.x + value, y: anchor.y } : { x: anchor.x, y: anchor.y + value };
  }

  function commitWallPoint(x?: number, y?: number): void {
    const anchor = wallAnchor.value;
    if (!anchor) {
      const start = { x: snapCm(x ?? 0), y: snapCm(y ?? 0) };
      wallAnchor.value = start;
      pendingWall.value = start;
      return;
    }
    const target = pendingWall.value ?? constrainPoint(anchor, x ?? anchor.x, y ?? anchor.y);
    if (target.x === anchor.x && target.y === anchor.y) return;
    commit(() => {
      elements.value = [...elements.value, makeWall(anchor.x, anchor.y, target.x, target.y)];
    });
    wallAnchor.value = target;
    pendingWall.value = target;
  }

  function finishWall(): void {
    wallAnchor.value = null;
    pendingWall.value = null;
  }

  /** «Salón 8 × 6 m»: las cuatro paredes de una vez y el tamaño del local. */
  function createRoom(roomWidthCm: number, roomHeightCm: number): void {
    const w = snapCm(roomWidthCm);
    const h = snapCm(roomHeightCm);
    if (w < 100 || h < 100) return;
    commit(() => {
      elements.value = [
        ...elements.value,
        makeWall(0, 0, w, 0),
        makeWall(w, 0, w, h),
        makeWall(w, h, 0, h),
        makeWall(0, h, 0, 0),
      ];
      if (widthCm.value === null || heightCm.value === null) {
        widthCm.value = w;
        heightCm.value = h;
      }
    });
  }

  function setFloorSize(nextWidthCm: number | null, nextHeightCm: number | null): void {
    commit(() => {
      widthCm.value = nextWidthCm;
      heightCm.value = nextHeightCm;
    });
  }

  // ── Elementos decorativos ──────────────────────────────────────────────────

  function addDoorAt(x: number, y: number): string {
    const element = makeDoor(snapCm(x), snapCm(y), 0);
    commit(() => {
      elements.value = [...elements.value, element];
    });
    return element.id;
  }

  function addObjectAt(kind: Parameters<typeof makeObject>[0], x: number, y: number): string {
    const element = makeObject(kind, snapCm(x), snapCm(y));
    commit(() => {
      elements.value = [...elements.value, element];
    });
    return element.id;
  }

  // ── Mesas ──────────────────────────────────────────────────────────────────

  function addTableAt(presetKey: string, x: number, y: number, zoneId: string | null = null): string {
    const preset = TABLE_PRESETS.find((p) => p.key === presetKey) ?? TABLE_PRESETS[0]!;
    const now = new Date().toISOString();
    const table: DiningTable = {
      id: newId(),
      organizationId: organizationId.value,
      floorId: floorId.value ?? '',
      zoneId,
      name: nextTableName(tables.value),
      capacityMin: preset.capacityMin,
      capacityMax: preset.capacityMax,
      xCm: snapCm(x),
      yCm: snapCm(y),
      widthCm: preset.widthCm,
      heightCm: preset.heightCm,
      shape: preset.shape,
      rotationDeg: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    commit(() => {
      tables.value = [...tables.value, table];
    });
    selection.value = { kind: 'table', id: table.id };
    return table.id;
  }

  function updateTable(id: string, patch: TablePatch): void {
    commit(() => {
      tables.value = tables.value.map((table) => {
        if (table.id !== id) return table;
        const next = { ...table, ...patch, updatedAt: new Date().toISOString() };
        // Una mesa redonda tiene el mismo ancho y alto (diámetro).
        if (next.shape === 'round') next.heightCm = next.widthCm;
        return next;
      });
    });
  }

  function moveTable(id: string, dx: number, dy: number): void {
    commit(() => {
      tables.value = tables.value.map((table) => (table.id === id ? translateTable(table, dx, dy) : table));
    });
  }

  /** Mueve una mesa a una posición absoluta (arrastre desde el lienzo). */
  function setTablePosition(id: string, x: number, y: number): void {
    commit(() => {
      tables.value = tables.value.map((table) => (table.id === id ? { ...table, xCm: snapCm(x), yCm: snapCm(y) } : table));
    });
  }

  function rotateTable(id: string): void {
    commit(() => {
      tables.value = tables.value.map((table) =>
        table.id === id ? { ...table, rotationDeg: nextRotation(table.rotationDeg) as RotationDeg } : table,
      );
    });
  }

  /** Copia la mesa en fila: cantidad, dirección y separación real en cm. */
  function duplicateTable(id: string, options: { count: number; direction: DuplicateDirection; spacingCm: number }): void {
    const seed = tables.value.find((t) => t.id === id);
    if (!seed) return;
    const copies = duplicateRow(seed, options);
    commit(() => {
      tables.value = [...tables.value, ...copies];
    });
    selection.value = { kind: 'table', id: copies[copies.length - 1]?.id ?? id };
  }

  // ── Zonas ──────────────────────────────────────────────────────────────────

  function addZone(name?: string, color: ZoneColor = 'primary'): string {
    const now = new Date().toISOString();
    const zone: Zone = {
      id: newId(),
      organizationId: organizationId.value,
      floorId: floorId.value ?? '',
      name: name?.trim() || `Zona ${zones.value.length + 1}`,
      color,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    commit(() => {
      zones.value = [...zones.value, zone];
    });
    selection.value = { kind: 'zone', id: zone.id };
    return zone.id;
  }

  function updateZone(id: string, patch: Partial<Pick<Zone, 'name' | 'color'>>): void {
    commit(() => {
      zones.value = zones.value.map((zone) => (zone.id === id ? { ...zone, ...patch } : zone));
    });
  }

  // ── Selección: mover, girar y borrar ────────────────────────────────────────

  function moveSelection(dx: number, dy: number): void {
    const current = selection.value;
    if (!current) return;
    if (current.kind === 'table') moveTable(current.id, dx, dy);
    else if (current.kind === 'element') {
      commit(() => {
        elements.value = elements.value.map((element) =>
          element.id === current.id ? translateElement(element, dx, dy) : element,
        );
      });
    }
  }

  function rotateSelection(): void {
    const current = selection.value;
    if (!current) return;
    if (current.kind === 'table') rotateTable(current.id);
    else if (current.kind === 'element') {
      commit(() => {
        elements.value = elements.value.map((element) =>
          element.id === current.id && element.type !== 'wall'
            ? { ...element, rotationDeg: nextRotation(element.rotationDeg) as RotationDeg }
            : element,
        );
      });
    }
  }

  /** Edita un elemento del dibujo (puerta u objeto): ancho, tipo, giro o
   *  etiqueta. Las paredes se mueven con la selección, pero no se editan. */
  function updateElement(id: string, patch: Partial<PlanElement>): void {
    commit(() => {
      elements.value = elements.value.map((element) =>
        element.id === id ? ({ ...element, ...patch } as PlanElement) : element,
      );
    });
  }

  /** Borrar = quitar del plano. En el guardado, lo que no llega se desactiva en
   *  el servidor y conserva su id: las reservas del entregable 2 no se rompen. */
  function removeSelection(): void {
    const current = selection.value;
    if (!current) return;
    if (current.kind === 'table') {
      commit(() => {
        tables.value = tables.value.filter((t) => t.id !== current.id);
      });
    } else if (current.kind === 'zone') {
      commit(() => {
        zones.value = zones.value.filter((z) => z.id !== current.id);
        tables.value = tables.value.map((t) => (t.zoneId === current.id ? { ...t, zoneId: null } : t));
      });
    } else {
      commit(() => {
        elements.value = elements.value.filter((e) => e.id !== current.id);
      });
    }
    selection.value = null;
  }

  // ── Vista y guardado ────────────────────────────────────────────────────────

  function setView(next: ViewBox): void {
    view.value = next;
  }

  function fitToPlan(bounds: Box): void {
    const pad = 40;
    view.value = { x: bounds.x - pad, y: bounds.y - pad, w: bounds.w + pad * 2, h: bounds.h + pad * 2 };
  }

  function zoomBy(factor: number, center?: Point): void {
    const current = view.value;
    if (!current) return;
    const w = Math.min(Math.max(current.w * factor, 100), 200_000);
    const h = w * (current.h / current.w);
    const cx = center?.x ?? current.x + current.w / 2;
    const cy = center?.y ?? current.y + current.h / 2;
    view.value = { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  function panBy(dx: number, dy: number): void {
    const current = view.value;
    if (!current) return;
    view.value = { ...current, x: current.x + dx, y: current.y + dy };
  }

  function toPayload(fixedVersion?: number): SaveFloorPlanInput {
    return buildSaveFloorPlanInput({
      expectedVersion: fixedVersion ?? serverVersion.value,
      widthCm: widthCm.value,
      heightCm: heightCm.value,
      zones: zones.value,
      tables: tables.value,
      elements: elements.value,
    });
  }

  /** Tras guardar: sube la versión base, deja de estar sucio y borra el borrador. */
  function markSaved(floor: Floor): void {
    serverVersion.value = floor.layoutVersion;
    widthCm.value = floor.widthCm;
    heightCm.value = floor.heightCm;
    floorName.value = floor.name;
    dirty.value = false;
    clearDraft();
  }

  return {
    scope,
    floorId,
    organizationId,
    floorName,
    widthCm,
    heightCm,
    zones,
    tables,
    elements,
    serverVersion,
    dirty,
    activeTool,
    selection,
    wallAnchor,
    pendingWall,
    view,
    canUndo,
    canRedo,
    issues,
    issueIds,
    placedTables,
    selectedTable,
    selectedZone,
    selectedElement,
    load,
    hasDraft,
    clearDraft,
    undo,
    redo,
    setTool,
    select,
    moveWallCursor,
    applyWallLength,
    commitWallPoint,
    finishWall,
    createRoom,
    setFloorSize,
    addDoorAt,
    addObjectAt,
    addTableAt,
    updateTable,
    moveTable,
    setTablePosition,
    rotateTable,
    duplicateTable,
    addZone,
    updateZone,
    moveSelection,
    rotateSelection,
    updateElement,
    removeSelection,
    setView,
    fitToPlan,
    zoomBy,
    panBy,
    toPayload,
    markSaved,
  };
});
