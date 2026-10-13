<script setup lang="ts">
/**
 * Visor del plano en **solo lectura**. Pinta el mismo documento que el editor
 * pero sin herramientas ni edición: lo reutilizará el entregable 2 para que el
 * cliente elija mesa, y aquí se usa como vista previa en la pantalla de mesas.
 *
 * Comparte la capa de dibujo (`FloorPlanShapes`) con el editor, así que lo que se
 * ve aquí es exactamente lo que se ve allí.
 */
import { computed } from 'vue';
import type { FloorPlan } from '@/types/restaurant';
import { planBounds } from '@/utils/restaurant-plan';
import FloorPlanShapes from './FloorPlanShapes.vue';

const props = withDefaults(
  defineProps<{
    plan: FloorPlan;
    /** Alto del lienzo. Por defecto, un rectángulo cómodo en cualquier pantalla. */
    height?: string;
    showGrid?: boolean;
  }>(),
  { height: '320px', showGrid: false },
);

const paddingCm = 40;

const view = computed(() => {
  const bounds = planBounds(props.plan.tables, props.plan.layout.elements, props.plan.floor);
  return { x: bounds.x - paddingCm, y: bounds.y - paddingCm, w: bounds.w + paddingCm * 2, h: bounds.h + paddingCm * 2 };
});
</script>

<template>
  <div
    class="floorplan-viewer"
    :style="{ height, width: '100%' }"
    data-testid="floorplan-viewer"
  >
    <FloorPlanShapes
      :view="view"
      :width-cm="plan.floor.widthCm"
      :height-cm="plan.floor.heightCm"
      :zones="plan.zones"
      :tables="plan.tables.filter((t) => t.status === 'active')"
      :elements="plan.layout.elements"
      :show-grid="showGrid"
    />
  </div>
</template>
