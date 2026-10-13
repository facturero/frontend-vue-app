<script setup lang="ts">
/**
 * Barra de herramientas del editor: elegir herramienta, tipo de mesa, objeto y
 * los controles de vista (deshacer/rehacer, zoom, encuadre) y el atajo «Salón».
 *
 * Es solo presentación: las acciones van al store del editor o se emiten hacia
 * la vista, que es quien tiene el lienzo para «ajustar».
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useFloorPlanEditorStore, type EditorTool } from '@/stores/floorplanEditor';
import type { ObjectKind } from '@/types/restaurant';
import { TABLE_PRESETS } from '@/utils/restaurant-plan';

const props = defineProps<{ preset: string; objectKind: ObjectKind }>();
const emit = defineEmits<{
  'update:preset': [string];
  'update:objectKind': [ObjectKind];
  room: [];
  join: [];
  fit: [];
}>();

const { t } = useI18n();
const store = useFloorPlanEditorStore();
const auth = useAuthStore();

const canManage = computed(() => auth.can('restaurant:manage'));

interface ToolDef {
  value: EditorTool;
  icon: string;
  shortcut: string;
  largeOnly?: boolean;
}

const tools: ToolDef[] = [
  { value: 'select', icon: 'mdi-cursor-move', shortcut: 'V' },
  { value: 'wall', icon: 'mdi-wall', shortcut: 'W', largeOnly: true },
  { value: 'door', icon: 'mdi-door', shortcut: 'D', largeOnly: true },
  { value: 'table', icon: 'mdi-table-furniture', shortcut: 'T' },
  { value: 'zone', icon: 'mdi-vector-square', shortcut: 'Z' },
  { value: 'object', icon: 'mdi-sofa-outline', shortcut: 'O' },
  { value: 'erase', icon: 'mdi-eraser', shortcut: 'E' },
];

const presetOptions = TABLE_PRESETS.map((p) => ({ title: t(`restaurant.plan.presets.${p.key}`), value: p.key }));
const objectOptions = (
  ['bar', 'column', 'restroom', 'kitchen', 'plant', 'stairs', 'entrance'] as ObjectKind[]
).map((kind) => ({ title: t(`restaurant.plan.objects.${kind}`), value: kind }));

function label(tool: ToolDef): string {
  return `${t(`restaurant.plan.tools.${tool.value}`)} (${tool.shortcut})`;
}
</script>

<template>
  <v-sheet class="pa-2 d-flex flex-row flex-lg-column ga-2 align-center align-lg-stretch">
    <v-btn
      v-for="tool in tools"
      :key="tool.value"
      :icon="tool.icon"
      size="small"
      :color="store.activeTool === tool.value ? 'primary' : undefined"
      :variant="store.activeTool === tool.value ? 'flat' : 'text'"
      :title="label(tool)"
      :class="{ 'd-none d-lg-flex': tool.largeOnly }"
      @click="store.setTool(tool.value)"
    />

    <v-divider class="d-none d-lg-flex my-1" />

    <v-btn
      icon="mdi-undo"
      size="small"
      variant="text"
      :disabled="!store.canUndo || !canManage"
      :title="$t('restaurant.plan.undo')"
      @click="store.undo()"
    />
    <v-btn
      icon="mdi-redo"
      size="small"
      variant="text"
      :disabled="!store.canRedo || !canManage"
      :title="$t('restaurant.plan.redo')"
      @click="store.redo()"
    />

    <v-divider class="d-none d-lg-flex my-1" />

    <v-btn icon="mdi-magnify-plus-outline" size="small" variant="text" :title="$t('restaurant.plan.zoomIn')" @click="store.zoomBy(0.8)" />
    <v-btn icon="mdi-magnify-minus-outline" size="small" variant="text" :title="$t('restaurant.plan.zoomOut')" @click="store.zoomBy(1.25)" />
    <v-btn icon="mdi-fit-to-page-outline" size="small" variant="text" :title="$t('restaurant.plan.zoomFit')" @click="emit('fit')" />

    <v-divider class="d-none d-lg-flex my-1" />

    <v-btn
      v-if="canManage"
      icon="mdi-vector-rectangle"
      size="small"
      variant="text"
      :title="$t('restaurant.plan.room')"
      @click="emit('room')"
    />

    <!-- «Unir paredes»: solo cuando hay paredes; el número avisa cuántos extremos casi tocan a otra pared. -->
    <v-badge v-if="canManage && store.walls.length > 0" :content="store.looseWallEnds.length" :model-value="store.looseWallEnds.length > 0" color="warning">
      <v-btn icon="mdi-vector-combine" size="small" variant="text" :title="$t('restaurant.plan.join')" @click="emit('join')" />
    </v-badge>

    <v-select
      v-if="store.activeTool === 'table'"
      :model-value="props.preset"
      :items="presetOptions"
      :label="$t('restaurant.plan.preset')"
      class="d-none d-lg-flex"
      style="min-width: 180px"
      @update:model-value="emit('update:preset', $event)"
    />

    <v-select
      v-if="store.activeTool === 'object'"
      :model-value="props.objectKind"
      :items="objectOptions"
      :label="$t('restaurant.plan.objectKind')"
      class="d-none d-lg-flex"
      style="min-width: 180px"
      @update:model-value="emit('update:objectKind', $event as ObjectKind)"
    />
  </v-sheet>
</template>
