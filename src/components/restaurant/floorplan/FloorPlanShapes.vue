<script setup lang="ts">
/**
 * Capa de dibujo del plano, compartida por el editor y el visor de solo lectura.
 *
 * Pinta TODO el documento (cuadrícula, zonas, paredes, puertas, objetos y mesas)
 * dentro del `viewBox` que le llegue. El SVG está en **centímetros**: por eso el
 * grosor de una pared o el tamaño de una letra son números en cm, no píxeles, y
 * el zoom no necesita recalcular nada — solo cambia el `viewBox`.
 *
 * Los colores salen siempre de tokens del tema (`rgb(var(--v-theme-…))`): ni un
 * hexadecimal, para que el modo oscuro se vea bien sin reglas aparte.
 *
 * No decide nada de interacción: cada figura lleva `data-kind`/`data-id` y quien
 * la use escucha los eventos de puntero en el `<svg>` y pregunta al DOM qué se
 * tocó. Así el visor reutiliza el mismo dibujo sin arrastrar herramientas.
 */
import { computed } from 'vue';
import type { DiningTable, PlanElement, Zone } from '@/types/restaurant';
import { tableBox, zoneBounds, GRID_MAJOR_CM, type Box, type ViewBox } from '@/utils/restaurant-plan';

type WallElement = Extract<PlanElement, { type: 'wall' }>;
type DoorElement = Extract<PlanElement, { type: 'door' }>;
type ObjectElement = Extract<PlanElement, { type: 'object' }>;

const props = withDefaults(
  defineProps<{
    view: ViewBox;
    widthCm: number | null;
    heightCm: number | null;
    zones?: Zone[];
    tables?: DiningTable[];
    elements?: PlanElement[];
    selected?: { kind: string; id: string } | null;
    issueIds?: Set<string>;
    showGrid?: boolean;
  }>(),
  { zones: () => [], tables: () => [], elements: () => [], selected: null, showGrid: true },
);

const zones = computed(() => props.zones);
const tables = computed(() => props.tables);
const walls = computed<WallElement[]>(() => props.elements.filter((e): e is WallElement => e.type === 'wall'));
const doors = computed<DoorElement[]>(() => props.elements.filter((e): e is DoorElement => e.type === 'door'));
const objects = computed<ObjectElement[]>(() => props.elements.filter((e): e is ObjectElement => e.type === 'object'));
const issueIds = computed(() => props.issueIds ?? new Set<string>());

// Las variables de Vuetify son «R,G,B» separadas por comas: la transparencia va con `rgba(var(…), a)`. La sintaxis moderna
// `rgb(var(…) / a)` mezcla comas y barra, es inválida, y el navegador pinta el relleno de negro (paredes y zonas salieron negras).
function token(color: string, alpha = 1): string {
  return alpha === 1 ? `rgb(var(--v-theme-${color}))` : `rgba(var(--v-theme-${color}), ${alpha})`;
}

function isSelected(kind: string, id: string): boolean {
  return props.selected?.kind === kind && props.selected?.id === id;
}

function isIssue(id: string): boolean {
  return issueIds.value.has(id);
}

const hasFloor = computed(() => props.widthCm !== null && props.heightCm !== null);

/**
 * Cuadrícula: cada metro siempre, y cada 10 cm solo al acercarse (a lo lejos esas
 * líneas se funden en una mancha gris). Se calculan solo las líneas visibles en
 * el `viewBox` para no dibujar cientos de trazos fuera de pantalla.
 */
const gridLines = computed(() => {
  const { x, y, w, h } = props.view;
  const step = w < 600 ? 10 : GRID_MAJOR_CM;
  const startX = Math.floor(x / step) * step;
  const startY = Math.floor(y / step) * step;
  const vertical: Array<{ x: number; major: boolean }> = [];
  const horizontal: Array<{ y: number; major: boolean }> = [];
  for (let gx = startX; gx <= x + w; gx += step) vertical.push({ x: gx, major: gx % GRID_MAJOR_CM === 0 });
  for (let gy = startY; gy <= y + h; gy += step) horizontal.push({ y: gy, major: gy % GRID_MAJOR_CM === 0 });
  return { vertical, horizontal };
});

/** Área de una zona: el envolvente de sus mesas (el contrato no guarda geometría). */
const zoneBoxes = computed(() =>
  zones.value
    .map((zone) => ({ zone, box: zoneBounds(tables.value, zone.id) }))
    .filter((entry): entry is { zone: Zone; box: Box } => entry.box !== null),
);

const floorBox = computed<Box>(() =>
  hasFloor.value
    ? { x: 0, y: 0, w: props.widthCm as number, h: props.heightCm as number }
    : { x: props.view.x, y: props.view.y, w: props.view.w, h: props.view.h },
);

function tableStyle(table: DiningTable): Record<string, string> {
  const stroke = isIssue(table.id)
    ? token('error')
    : isSelected('table', table.id)
      ? token('primary')
      : token('on-surface', 0.55);
  return {
    fill: token('surface'),
    stroke,
    strokeWidth: isSelected('table', table.id) || isIssue(table.id) ? '4' : '2',
    ...(isIssue(table.id) ? { strokeDasharray: '8 6' } : {}),
  };
}

function tableLabelSize(table: DiningTable): number {
  const box = tableBox(table);
  return Math.max(14, Math.min(34, Math.min(box.w, box.h) * 0.3));
}

function wallStyle(element: WallElement): Record<string, string> {
  return {
    stroke: token('on-surface', 0.8),
    strokeWidth: String(element.thicknessCm),
    strokeLinecap: 'square',
  };
}

function objectLabelSize(element: ObjectElement): number {
  return Math.max(12, Math.min(28, Math.min(element.widthCm, element.heightCm) * 0.3));
}

function doorSwing(widthCm: number): string {
  return `M 0 0 A ${widthCm} ${widthCm} 0 0 1 ${widthCm} ${widthCm}`;
}
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :viewBox="`${view.x} ${view.y} ${view.w} ${view.h}`"
    style="touch-action: none; display: block; width: 100%; height: 100%"
  >
    <!-- Fondo del salón: solo se pinta si hay medidas; si no, el lienzo queda sin límite. -->
    <rect
      v-if="hasFloor"
      :x="floorBox.x"
      :y="floorBox.y"
      :width="floorBox.w"
      :height="floorBox.h"
      :style="{ fill: token('surface'), stroke: token('on-surface', 0.25), strokeWidth: '3' }"
    />

    <g v-if="showGrid" aria-hidden="true">
      <line
        v-for="(line, i) in gridLines.vertical"
        :key="`v${i}`"
        :x1="line.x"
        :y1="view.y"
        :x2="line.x"
        :y2="view.y + view.h"
        :style="{ stroke: token('on-surface', line.major ? 0.12 : 0.05), strokeWidth: line.major ? '1' : '0.5' }"
      />
      <line
        v-for="(line, i) in gridLines.horizontal"
        :key="`h${i}`"
        :x1="view.x"
        :y1="line.y"
        :x2="view.x + view.w"
        :y2="line.y"
        :style="{ stroke: token('on-surface', line.major ? 0.12 : 0.05), strokeWidth: line.major ? '1' : '0.5' }"
      />
    </g>

    <!-- Zonas: semitransparentes y por debajo de todo para no tapar las mesas. -->
    <g>
      <g v-for="entry in zoneBoxes" :key="entry.zone.id" data-kind="zone" :data-id="entry.zone.id">
        <rect
          :x="entry.box.x"
          :y="entry.box.y"
          :width="entry.box.w"
          :height="entry.box.h"
          rx="8"
          :style="{
            fill: token(entry.zone.color, 0.16),
            stroke: isSelected('zone', entry.zone.id) ? token(entry.zone.color) : token(entry.zone.color, 0.5),
            strokeWidth: isSelected('zone', entry.zone.id) ? '4' : '2',
          }"
        />
        <text
          :x="entry.box.x + 12"
          :y="entry.box.y + 12"
          dominant-baseline="hanging"
          :font-size="26"
          :style="{ fill: token(entry.zone.color), fontWeight: '600' }"
        >
          {{ entry.zone.name }}
        </text>
      </g>
    </g>

    <!-- Paredes -->
    <g>
      <line
        v-for="wall in walls"
        :key="wall.id"
        :x1="wall.x1"
        :y1="wall.y1"
        :x2="wall.x2"
        :y2="wall.y2"
        data-kind="element"
        :data-id="wall.id"
        :style="wallStyle(wall)"
      />
    </g>

    <!-- Puertas -->
    <g>
      <g
        v-for="door in doors"
        :key="door.id"
        data-kind="element"
        :data-id="door.id"
        :transform="`translate(${door.x} ${door.y}) rotate(${door.rotationDeg})`"
      >
        <rect :width="door.widthCm" :height="8" :style="{ fill: token('warning') }" />
        <path
          :d="doorSwing(door.widthCm)"
          fill="none"
          :style="{ stroke: token('warning', 0.5), strokeWidth: '2', strokeDasharray: '6 4' }"
        />
      </g>
    </g>

    <!-- Objetos decorativos -->
    <g>
      <g v-for="element in objects" :key="element.id" data-kind="element" :data-id="element.id">
        <rect
          :x="element.x"
          :y="element.y"
          :width="element.widthCm"
          :height="element.heightCm"
          rx="4"
          :style="{
            fill: token('grey200'),
            stroke: isSelected('element', element.id) ? token('primary') : token('on-surface', 0.4),
            strokeWidth: isSelected('element', element.id) ? '4' : '2',
          }"
        />
        <text
          :x="element.x + element.widthCm / 2"
          :y="element.y + element.heightCm / 2"
          text-anchor="middle"
          dominant-baseline="middle"
          :font-size="objectLabelSize(element)"
          :style="{ fill: token('on-surface') }"
        >
          {{ element.label ?? '' }}
        </text>
      </g>
    </g>

    <!-- Mesas: por encima de paredes y zonas. -->
    <g>
      <g
        v-for="table in tables"
        :key="table.id"
        data-kind="table"
        :data-id="table.id"
        :transform="`translate(${tableBox(table).x} ${tableBox(table).y})`"
      >
        <rect
          v-if="table.shape === 'rect'"
          :width="tableBox(table).w"
          :height="tableBox(table).h"
          rx="6"
          :style="tableStyle(table)"
        />
        <ellipse
          v-else
          :cx="tableBox(table).w / 2"
          :cy="tableBox(table).h / 2"
          :rx="tableBox(table).w / 2"
          :ry="tableBox(table).h / 2"
          :style="tableStyle(table)"
        />
        <text
          :x="tableBox(table).w / 2"
          :y="tableBox(table).h / 2"
          text-anchor="middle"
          dominant-baseline="middle"
          :font-size="tableLabelSize(table)"
          :style="{ fill: token('on-surface'), fontWeight: '600' }"
        >
          {{ table.name }}
        </text>
      </g>
    </g>

    <slot name="overlay" />
  </svg>
</template>
