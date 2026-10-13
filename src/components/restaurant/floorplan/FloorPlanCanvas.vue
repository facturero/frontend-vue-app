<script setup lang="ts">
/**
 * Lienzo interactivo del editor del plano.
 *
 * El `<svg>` está en centímetros y el zoom/arrastre solo cambian su `viewBox`
 * (nada se reescala a mano). Los eventos son de **puntero**, no de ratón: la
 * misma lógica coloca mesas con el dedo en una tablet.
 *
 * La geometría y los comandos viven en `stores/floorplanEditor.ts`; aquí solo se
 * traduce el gesto (coordenadas de pantalla → cm, herramientas) a llamadas del
 * store. El dibujo lo pinta `FloorPlanShapes`, compartido con el visor.
 *
 * Al arrastrar una mesa no se toca el store en cada movimiento (llenaría la pila
 * de deshacer): se pinta un «fantasma» durante el gesto y se confirma una sola
 * vez al soltar.
 */
import { computed, onMounted, ref } from 'vue';
import { useFloorPlanEditorStore } from '@/stores/floorplanEditor';
import type { ObjectKind, PlanElement } from '@/types/restaurant';
import { moveWallPerpendicular, orientationOf } from '@/utils/wall-snap';
import { formatMeters, planBounds, snapCm, SNAP_CM, SNAP_FINE_CM, type ViewBox } from '@/utils/restaurant-plan';
import FloorPlanShapes from './FloorPlanShapes.vue';

const props = withDefaults(
  defineProps<{
    /** Clave del preset de mesa activo (paleta de la barra de herramientas). */
    preset?: string;
    /** Tipo de objeto activo cuando la herramienta es «Objeto». */
    objectKind?: ObjectKind;
  }>(),
  { preset: 'mesa4', objectKind: 'bar' },
);

const store = useFloorPlanEditorStore();

const host = ref<HTMLElement | null>(null);

const fallbackView: ViewBox = { x: -100, y: -100, w: 1200, h: 900 };
const view = computed<ViewBox>(() => store.view ?? fallbackView);

interface DragState {
  kind: 'table' | 'element' | 'wall';
  id: string;
  start: { x: number; y: number };
  origin: { x: number; y: number };
}

const ghost = ref<{ id: string; xCm: number; yCm: number } | null>(null);
/** Mientras se arrastra una pared: cuánto se movió. Las que le llegan la siguen en el dibujo, y se confirma una vez al soltar. */
const wallGhost = ref<{ id: string; delta: number } | null>(null);

const pointers = new Map<number, { x: number; y: number }>();
let drag: DragState | null = null;
let panStart: { clientX: number; clientY: number; view: ViewBox; inverse: DOMMatrix } | null = null;
let pinchDistance: number | null = null;
let moved = false;

function svgEl(): SVGSVGElement | null {
  return host.value?.querySelector('svg') ?? null;
}

/** Pantalla → centímetros, con la matriz real del SVG (respeta el aspect ratio). */
function toCm(clientX: number, clientY: number): { x: number; y: number } {
  const svg = svgEl();
  const ctm = svg?.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const point = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: point.x, y: point.y };
}

/** Mesas con la posición «fantasma» aplicada mientras se arrastra. */
const displayTables = computed(() =>
  ghost.value
    ? store.tables.map((t) => (t.id === ghost.value!.id ? { ...t, xCm: ghost.value!.xCm, yCm: ghost.value!.yCm } : t))
    : store.tables,
);

/** Elementos con la pared arrastrada (y las que le llegan) en su posición provisional. */
const displayElements = computed<PlanElement[]>(() => {
  const g = wallGhost.value;
  if (!g) return store.elements;
  const moved = new Map(moveWallPerpendicular(store.walls, g.id, g.delta).map((w) => [w.id, w]));
  return store.elements.map((e) => (e.type === 'wall' ? (moved.get(e.id) ?? e) : e));
});

const zoomedIn = computed(() => view.value.w < 600);

const cursor = computed(() => {
  if (store.activeTool === 'select') return 'grab';
  if (store.activeTool === 'erase') return 'not-allowed';
  return 'crosshair';
});

const wallPreview = computed(() => {
  const a = store.wallAnchor;
  const b = store.pendingWall;
  if (!a || !b) return null;
  return { a, b, length: Math.hypot(b.x - a.x, b.y - a.y) };
});

const isEmpty = computed(() => store.tables.length === 0 && store.elements.length === 0);

function fit(): void {
  store.fitToPlan(planBounds(store.tables, store.elements, { widthCm: store.widthCm, heightCm: store.heightCm }));
}

onMounted(() => {
  if (!store.view) fit();
});

function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** El radio del imán se mide en pantalla (≈14 px) y aquí se pasa a cm con el zoom actual: se siente igual de cerca con cualquier zoom. */
function syncSnapRadius(): void {
  const scale = svgEl()?.getScreenCTM()?.a;
  if (scale && scale > 0) store.setSnapRadius(14 / scale);
}

/** Cuánto se mueve la pared arrastrada (en perpendicular a sí misma): imán de 10 cm y se alinea con las paredes paralelas cercanas. */
function wallDragDelta(id: string, p: { x: number; y: number }, start: { x: number; y: number }, step: number): number {
  const wall = store.walls.find((w) => w.id === id);
  if (!wall) return 0;
  const horizontal = orientationOf(wall) === 'h';
  const base = horizontal ? wall.y1 : wall.x1;
  const raw = base + (horizontal ? p.y - start.y : p.x - start.x);
  let target = snapCm(raw, step);
  let bestD = store.snapRadiusCm;
  for (const c of store.wallAlignments(id)) {
    const d = Math.abs(raw - c);
    if (d <= bestD) {
      target = c;
      bestD = d;
    }
  }
  return target - base;
}

function hitTest(e: PointerEvent): { kind: string; id: string } | null {
  const target = e.target as Element | null;
  const owner = target?.closest?.('[data-kind]') ?? null;
  const kind = owner?.getAttribute('data-kind') ?? null;
  const id = owner?.getAttribute('data-id');
  return kind && id ? { kind, id } : null;
}

function startDragFromHit(hit: { kind: string; id: string }, p: { x: number; y: number }): void {
  if (hit.kind === 'table') {
    const table = store.tables.find((t) => t.id === hit.id);
    if (table) {
      drag = { kind: 'table', id: table.id, start: p, origin: { x: table.xCm ?? 0, y: table.yCm ?? 0 } };
    }
  } else if (hit.kind === 'element') {
    const element = store.elements.find((el) => el.id === hit.id);
    if (element && element.type === 'wall') {
      // Una pared se mueve en perpendicular a sí misma (la horizontal sube o baja); las diagonales no se arrastran.
      if (orientationOf(element) !== 'd') drag = { kind: 'wall', id: element.id, start: p, origin: { x: 0, y: 0 } };
    } else if (element) {
      drag = { kind: 'element', id: element.id, start: p, origin: { x: element.x, y: element.y } };
    }
  }
}

function onPointerDown(e: PointerEvent): void {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
    drag = null;
    panStart = null;
    pinchDistance = distanceBetween(a, b);
    moved = true;
    return;
  }
  if (pointers.size > 2) return;

  moved = false;
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);

  const p = toCm(e.clientX, e.clientY);
  const hit = hitTest(e);
  const tool = store.activeTool;

  if (tool === 'select') {
    if (hit) {
      store.select({ kind: hit.kind as 'table' | 'zone' | 'element', id: hit.id });
      startDragFromHit(hit, p);
    } else {
      const svg = svgEl();
      const ctm = svg?.getScreenCTM();
      if (ctm) panStart = { clientX: e.clientX, clientY: e.clientY, view: { ...view.value }, inverse: ctm.inverse() };
    }
    return;
  }

  if (tool === 'wall') {
    // Se recalcula el imán en el punto exacto del clic (en una tablet no hubo movimiento previo del puntero).
    syncSnapRadius();
    store.moveWallCursor(p.x, p.y, e.shiftKey);
    store.commitWallPoint(p.x, p.y);
    return;
  }

  if (tool === 'erase') {
    if (hit) {
      store.select({ kind: hit.kind as 'table' | 'zone' | 'element', id: hit.id });
      store.removeSelection();
    }
    return;
  }

  if (hit) {
    store.select({ kind: hit.kind as 'table' | 'zone' | 'element', id: hit.id });
    return;
  }

  if (tool === 'table') store.addTableAt(props.preset, p.x, p.y, null);
  else if (tool === 'zone') store.addZone();
  else if (tool === 'door') store.addDoorAt(p.x, p.y);
  else if (tool === 'object') store.addObjectAt(props.objectKind, p.x, p.y);
}

function onPointerMove(e: PointerEvent): void {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size >= 2) {
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
    const distance = distanceBetween(a, b);
    if (pinchDistance && distance > 0) {
      const factor = pinchDistance / distance;
      store.zoomBy(factor, toCm((a.x + b.x) / 2, (a.y + b.y) / 2));
      pinchDistance = distance;
    }
    return;
  }

  const p = toCm(e.clientX, e.clientY);

  if (drag) {
    const step = e.shiftKey ? SNAP_FINE_CM : SNAP_CM;
    const x = snapCm(drag.origin.x + (p.x - drag.start.x), step);
    const y = snapCm(drag.origin.y + (p.y - drag.start.y), step);
    moved = true;
    if (drag.kind === 'table') ghost.value = { id: drag.id, xCm: x, yCm: y };
    else if (drag.kind === 'wall') {
      syncSnapRadius();
      const delta = wallDragDelta(drag.id, p, drag.start, step);
      wallGhost.value = delta === 0 ? null : { id: drag.id, delta };
    }
    return;
  }

  if (panStart) {
    const from = new DOMPoint(panStart.clientX, panStart.clientY).matrixTransform(panStart.inverse);
    const to = new DOMPoint(e.clientX, e.clientY).matrixTransform(panStart.inverse);
    if (Math.abs(to.x - from.x) > 4 || Math.abs(to.y - from.y) > 4) moved = true;
    store.setView({
      x: panStart.view.x - (to.x - from.x),
      y: panStart.view.y - (to.y - from.y),
      w: panStart.view.w,
      h: panStart.view.h,
    });
    return;
  }

  if (store.activeTool === 'wall') {
    syncSnapRadius();
    store.moveWallCursor(p.x, p.y, e.shiftKey);
  }
}

function endGesture(e: PointerEvent): void {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchDistance = null;
  (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);

  if (drag) {
    const active = drag;
    if (active.kind === 'table' && ghost.value) {
      store.setTablePosition(active.id, ghost.value.xCm, ghost.value.yCm);
    } else if (active.kind === 'wall' && wallGhost.value) {
      store.moveWall(active.id, wallGhost.value.delta);
    } else if (active.kind === 'element' && moved) {
      const p = toCm(e.clientX, e.clientY);
      const step = e.shiftKey ? SNAP_FINE_CM : SNAP_CM;
      const dx = snapCm(active.origin.x + (p.x - active.start.x), step) - active.origin.x;
      const dy = snapCm(active.origin.y + (p.y - active.start.y), step) - active.origin.y;
      if (dx !== 0 || dy !== 0) store.moveSelection(dx, dy);
    }
    ghost.value = null;
    wallGhost.value = null;
    drag = null;
    return;
  }

  if (panStart) {
    if (!moved) store.select(null);
    panStart = null;
  }
}

function onWheel(e: WheelEvent): void {
  e.preventDefault();
  store.zoomBy(e.deltaY < 0 ? 0.88 : 1.14, toCm(e.clientX, e.clientY));
}

function onDoubleClick(): void {
  if (store.activeTool === 'wall') store.finishWall();
}

defineExpose({ fit });
</script>

<template>
  <div
    ref="host"
    class="floorplan-canvas position-relative"
    :style="{ cursor }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="endGesture"
    @pointercancel="endGesture"
    @wheel="onWheel"
    @dblclick="onDoubleClick"
  >
    <FloorPlanShapes
      :view="view"
      :width-cm="store.widthCm"
      :height-cm="store.heightCm"
      :zones="store.zones"
      :tables="displayTables"
      :elements="displayElements"
      :selected="store.selection"
      :issue-ids="store.issueIds"
    >
      <template #overlay>
        <!-- Imán: dónde se va a pegar la pared (esquina, cuerpo de otra pared o alineada con una esquina). -->
        <g v-if="store.activeTool === 'wall' && store.wallSnap" aria-hidden="true">
          <circle
            :cx="store.wallSnap.point.x"
            :cy="store.wallSnap.point.y"
            :r="store.snapRadiusCm * 0.7"
            :style="{
              fill: store.wallSnap.kind === 'align' ? 'none' : 'rgba(var(--v-theme-success), 0.25)',
              stroke: store.wallSnap.kind === 'align' ? 'rgb(var(--v-theme-primary))' : 'rgb(var(--v-theme-success))',
              strokeWidth: '3',
              strokeDasharray: store.wallSnap.kind === 'align' ? '6 5' : 'none',
            }"
          />
          <text
            :x="store.wallSnap.point.x"
            :y="store.wallSnap.point.y - store.snapRadiusCm * 0.7 - 10"
            text-anchor="middle"
            :font-size="Math.max(16, view.w / 50)"
            :style="{ fill: store.wallSnap.kind === 'align' ? 'rgb(var(--v-theme-primary))' : 'rgb(var(--v-theme-success))', fontWeight: '600' }"
          >
            {{ $t(`restaurant.plan.snap.${store.wallSnap.kind}`) }}
          </text>
        </g>
        <g v-if="wallPreview" aria-hidden="true">
          <line
            :x1="wallPreview.a.x"
            :y1="wallPreview.a.y"
            :x2="wallPreview.b.x"
            :y2="wallPreview.b.y"
            stroke-dasharray="10 8"
            :style="{ stroke: 'rgb(var(--v-theme-primary))', strokeWidth: '3' }"
          />
          <circle
            :cx="wallPreview.a.x"
            :cy="wallPreview.a.y"
            r="10"
            :style="{ fill: 'rgb(var(--v-theme-primary))' }"
          />
          <text
            :x="(wallPreview.a.x + wallPreview.b.x) / 2"
            :y="(wallPreview.a.y + wallPreview.b.y) / 2 - 16"
            text-anchor="middle"
            :font-size="Math.max(18, view.w / 40)"
            :style="{ fill: 'rgb(var(--v-theme-primary))', fontWeight: '600' }"
          >
            {{ formatMeters(wallPreview.length) }}
          </text>
        </g>
      </template>
    </FloorPlanShapes>

    <div
      v-if="isEmpty"
      class="position-absolute text-medium-emphasis text-center pa-6"
      style="inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none"
    >
      {{ $t('restaurant.plan.emptyCanvas') }}
    </div>

    <v-chip
      v-if="zoomedIn"
      class="position-absolute text-caption"
      style="top: 8px; right: 8px; pointer-events: none"
      color="lightprimary"
      size="small"
    >
      10 cm
    </v-chip>
  </div>
</template>
