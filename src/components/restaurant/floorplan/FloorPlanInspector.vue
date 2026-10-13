<script setup lang="ts">
/**
 * Panel de propiedades del editor. Muestra y edita lo que está seleccionado
 * (mesa, zona o elemento) y ofrece girar, duplicar en fila y borrar.
 *
 * Los campos no escriben en el store en cada tecla: se editan en local y se
 * confirman al salir del campo (`@change`), para no llenar la pila de deshacer
 * con una entrada por letra.
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useFloorPlanEditorStore } from '@/stores/floorplanEditor';
import type { ObjectKind, TableShape, ZoneColor } from '@/types/restaurant';
import { formatMeters, ZONE_COLORS } from '@/utils/restaurant-plan';

const { t, locale } = useI18n();
const store = useFloorPlanEditorStore();
const auth = useAuthStore();

const canManage = computed(() => auth.can('restaurant:manage'));
const kind = computed(() => store.selection?.kind ?? null);

const shapeOptions = computed(() => [
  { title: t('restaurant.inspector.shapes.rect'), value: 'rect' },
  { title: t('restaurant.inspector.shapes.round'), value: 'round' },
]);

const objectOptions = (
  ['bar', 'column', 'restroom', 'kitchen', 'plant', 'stairs', 'entrance'] as ObjectKind[]
).map((item) => ({ title: t(`restaurant.plan.objects.${item}`), value: item }));

const zoneOptions = computed(() => [
  { title: t('restaurant.tables.noZone'), value: null },
  ...store.zones.map((z) => ({ title: z.name, value: z.id })),
]);

const form = ref({
  name: '',
  capacityMin: 1,
  capacityMax: 2,
  zoneId: null as string | null,
  shape: 'rect' as TableShape,
  widthCm: 0,
  heightCm: 0,
  color: 'primary' as ZoneColor,
  label: '',
  doorWidthCm: 90,
  floorWidthM: 0,
  floorHeightM: 0,
});

function syncForm(): void {
  form.value.floorWidthM = store.effectiveWidthCm !== null ? store.effectiveWidthCm / 100 : 0;
  form.value.floorHeightM = store.effectiveHeightCm !== null ? store.effectiveHeightCm / 100 : 0;
  const table = store.selectedTable;
  if (table) {
    form.value.name = table.name;
    form.value.capacityMin = table.capacityMin;
    form.value.capacityMax = table.capacityMax;
    form.value.zoneId = table.zoneId;
    form.value.shape = table.shape;
    form.value.widthCm = table.widthCm;
    form.value.heightCm = table.heightCm;
    return;
  }
  const zone = store.selectedZone;
  if (zone) {
    form.value.name = zone.name;
    form.value.color = zone.color;
    return;
  }
  const element = store.selectedElement;
  if (element?.type === 'door') form.value.doorWidthCm = element.widthCm;
  else if (element?.type === 'object') form.value.label = element.label ?? '';
}

watch(() => [store.selection?.kind, store.selection?.id], syncForm, { immediate: true });
// Las medidas del local llegan cuando termina de cargar el plano, normalmente DESPUÉS de montarse el inspector (que solo miraba la
// selección): los campos se quedaban en 0 m aunque el salón midiera 9 × 7 m. También cambian al dibujar un «Salón» o al deshacer.
watch(
  () => [store.effectiveWidthCm, store.effectiveHeightCm],
  () => {
    form.value.floorWidthM = store.effectiveWidthCm !== null ? store.effectiveWidthCm / 100 : 0;
    form.value.floorHeightM = store.effectiveHeightCm !== null ? store.effectiveHeightCm / 100 : 0;
  },
);

function patchTable(patch: Parameters<typeof store.updateTable>[1]): void {
  const table = store.selectedTable;
  if (table) store.updateTable(table.id, patch);
}

/** Fijar las medidas del local sin dibujar: el mismo dato que escribe «Salón». */
function commitFloorSize(): void {
  const widthCm = Math.round(form.value.floorWidthM * 100);
  const heightCm = Math.round(form.value.floorHeightM * 100);
  if (!Number.isFinite(widthCm) || !Number.isFinite(heightCm) || widthCm < 100 || heightCm < 100) {
    syncForm();
    return;
  }
  store.setFloorSize(widthCm, heightCm);
}

function commitName(): void {
  const name = form.value.name.trim();
  if (!name) {
    syncForm();
    return;
  }
  if (store.selectedTable) patchTable({ name });
  else if (store.selectedZone) store.updateZone(store.selectedZone.id, { name });
}

/** Superficie del local en m² (con un decimal), para que el dueño vea de un vistazo cuánto mide. */
const floorAreaM2 = computed(() => Math.round(form.value.floorWidthM * form.value.floorHeightM * 10) / 10);
/** Con la coma o el punto decimal del idioma («73,2» en español): el parámetro de i18n entra como texto, no se formatea solo. */
const floorAreaText = computed(() => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(floorAreaM2.value));

const issues = computed(() => {
  const found = store.issues;
  return [
    { key: 'overlapping', ids: found.overlapping },
    { key: 'narrowAisles', ids: found.narrowAisles },
    { key: 'outsideFloor', ids: found.outsideFloor },
    { key: 'invalidCapacity', ids: found.invalidCapacity },
    { key: 'looseWalls', ids: store.looseWallEnds },
  ].filter((entry) => entry.ids.length > 0);
});

// Duplicar en fila
const duplicateOpen = ref(false);
const duplicate = ref({ count: 3, direction: 'right' as 'right' | 'down', spacingM: 1 });
const duplicateOptions = computed(() => [
  { title: t('restaurant.inspector.duplicateRight'), value: 'right' },
  { title: t('restaurant.inspector.duplicateDown'), value: 'down' },
]);

function openDuplicate(): void {
  duplicate.value = { count: 3, direction: 'right', spacingM: 1 };
  duplicateOpen.value = true;
}

function confirmDuplicate(): void {
  const table = store.selectedTable;
  if (!table) return;
  store.duplicateTable(table.id, {
    count: Math.max(1, Math.min(20, Math.round(duplicate.value.count))),
    direction: duplicate.value.direction,
    spacingCm: Math.round(duplicate.value.spacingM * 100),
  });
  duplicateOpen.value = false;
}
</script>

<template>
  <v-sheet class="pa-4 d-flex flex-column ga-3 flex-shrink-0" style="min-width: 320px">
    <!-- Mesa -->
    <template v-if="kind === 'table' && store.selectedTable">
      <div class="text-h6">{{ $t('restaurant.inspector.table') }}</div>
      <v-text-field
        v-model="form.name"
        :label="$t('restaurant.inspector.name')"
        :disabled="!canManage"
        @change="commitName"
      />
      <div class="d-flex ga-2">
        <v-text-field
          v-model.number="form.capacityMin"
          type="number"
          min="1"
          :label="$t('restaurant.inspector.capacityMin')"
          :disabled="!canManage"
          @change="patchTable({ capacityMin: Number($event) })"
        />
        <v-text-field
          v-model.number="form.capacityMax"
          type="number"
          min="1"
          :label="$t('restaurant.inspector.capacityMax')"
          :disabled="!canManage"
          @change="patchTable({ capacityMax: Number($event) })"
        />
      </div>
      <v-select
        v-model="form.zoneId"
        :items="zoneOptions"
        :label="$t('restaurant.inspector.zone')"
        :disabled="!canManage"
        @update:model-value="patchTable({ zoneId: $event })"
      />
      <v-select
        v-model="form.shape"
        :items="shapeOptions"
        :label="$t('restaurant.inspector.shape')"
        :disabled="!canManage"
        @update:model-value="patchTable({ shape: $event as TableShape })"
      />
      <div class="d-flex ga-2">
        <v-text-field
          v-model.number="form.widthCm"
          type="number"
          min="20"
          step="10"
          :label="$t('restaurant.inspector.width')"
          suffix="cm"
          :disabled="!canManage"
          @change="patchTable({ widthCm: Number($event) })"
        />
        <v-text-field
          v-model.number="form.heightCm"
          type="number"
          min="20"
          step="10"
          :label="$t('restaurant.inspector.height')"
          suffix="cm"
          :disabled="!canManage || form.shape === 'round'"
          @change="patchTable({ heightCm: Number($event) })"
        />
      </div>
      <div class="text-body-2 text-medium-emphasis">
        {{ $t('restaurant.inspector.position') }}: {{ Math.round(store.selectedTable.xCm ?? 0) }},
        {{ Math.round(store.selectedTable.yCm ?? 0) }} cm · {{ $t('restaurant.inspector.rotation') }}:
        {{ store.selectedTable.rotationDeg }}°
      </div>
      <div class="d-flex ga-2 flex-wrap">
        <v-btn
          v-if="canManage"
          size="small"
          variant="tonal"
          prepend-icon="mdi-rotate-right"
          @click="store.rotateTable(store.selectedTable.id)"
        >
          {{ $t('restaurant.inspector.rotate') }}
        </v-btn>
        <v-btn size="small" variant="tonal" prepend-icon="mdi-content-copy" :disabled="!canManage" @click="openDuplicate">
          {{ $t('restaurant.inspector.duplicate') }}
        </v-btn>
      </div>
    </template>

    <!-- Zona -->
    <template v-else-if="kind === 'zone' && store.selectedZone">
      <div class="text-h6">{{ $t('restaurant.inspector.zone') }}</div>
      <v-text-field
        v-model="form.name"
        :label="$t('restaurant.inspector.name')"
        :disabled="!canManage"
        @change="commitName"
      />
      <div class="text-body-2 text-medium-emphasis">{{ $t('restaurant.inspector.color') }}</div>
      <div class="d-flex ga-1 flex-wrap">
        <v-btn
          v-for="color in ZONE_COLORS"
          :key="color"
          :color="color"
          size="x-small"
          icon
          variant="flat"
          :disabled="!canManage"
          :style="{ outline: store.selectedZone.color === color ? '2px solid rgb(var(--v-theme-on-surface))' : 'none' }"
          @click="store.updateZone(store.selectedZone.id, { color })"
        />
      </div>
      <div><v-alert type="info">{{ $t('restaurant.inspector.zoneStructure') }}</v-alert></div>
    </template>

    <!-- Elemento -->
    <template v-else-if="kind === 'element' && store.selectedElement">
      <div class="text-h6">{{ $t('restaurant.inspector.element') }}</div>

      <template v-if="store.selectedElement.type === 'door'">
        <v-text-field
          v-model.number="form.doorWidthCm"
          type="number"
          min="40"
          step="10"
          :label="$t('restaurant.inspector.doorWidth')"
          suffix="cm"
          :disabled="!canManage"
          @change="store.updateElement(store.selectedElement.id, { widthCm: Number($event) })"
        />
      </template>

      <template v-else-if="store.selectedElement.type === 'object'">
        <v-select
          :model-value="store.selectedElement.kind"
          :items="objectOptions"
          :label="$t('restaurant.plan.objectKind')"
          :disabled="!canManage"
          @update:model-value="store.updateElement(store.selectedElement.id, { kind: $event as ObjectKind })"
        />
        <v-text-field
          v-model="form.label"
          :label="$t('restaurant.inspector.label')"
          :disabled="!canManage"
          @change="store.updateElement(store.selectedElement.id, { label: String($event) })"
        />
      </template>

      <template v-else>
        <div class="text-body-2 text-medium-emphasis">
          {{ $t('restaurant.inspector.length') }}:
          {{
            formatMeters(
              Math.hypot(
                store.selectedElement.x2 - store.selectedElement.x1,
                store.selectedElement.y2 - store.selectedElement.y1,
              ),
            )
          }}
        </div>
        <div v-if="canManage" class="text-caption text-medium-emphasis">{{ $t('restaurant.inspector.wallDragHint') }}</div>
      </template>

      <v-btn
        v-if="canManage && store.selectedElement.type !== 'wall'"
        size="small"
        variant="tonal"
        prepend-icon="mdi-rotate-right"
        @click="store.rotateSelection()"
      >
        {{ $t('restaurant.inspector.rotate') }}
      </v-btn>
    </template>

    <!-- Nada seleccionado: se ofrecen las medidas del local. -->
    <template v-else>
      <div class="text-body-2 text-medium-emphasis">{{ $t('restaurant.inspector.empty') }}</div>
      <!-- Las medidas del local: una tarjeta propia, con un campo debajo del otro (lado a lado quedaban apretados en 340 px). -->
      <v-sheet border class="pa-4 d-flex flex-column ga-4">
        <div>
          <div class="text-h6">{{ $t('restaurant.inspector.floorSize') }}</div>
          <div class="text-body-2 text-medium-emphasis">{{ $t('restaurant.inspector.floorSizeHint') }}</div>
        </div>
        <v-text-field
          v-model.number="form.floorWidthM"
          type="number"
          min="1"
          step="0.5"
          density="comfortable"
          :label="$t('restaurant.inspector.width')"
          suffix="m"
          :disabled="!canManage"
          @change="commitFloorSize"
        />
        <v-text-field
          v-model.number="form.floorHeightM"
          type="number"
          min="1"
          step="0.5"
          density="comfortable"
          :label="$t('restaurant.inspector.height')"
          suffix="m"
          :disabled="!canManage"
          @change="commitFloorSize"
        />
        <div v-if="floorAreaM2 > 0" class="text-subtitle-1 font-weight-medium">
          {{ $t('restaurant.inspector.area', { area: floorAreaText }) }}
        </div>
      </v-sheet>
    </template>

    <v-btn
      v-if="canManage && kind"
      color="error"
      variant="tonal"
      prepend-icon="mdi-delete-outline"
      @click="store.removeSelection()"
    >
      {{ $t('restaurant.inspector.delete') }}
    </v-btn>

    <template v-if="issues.length">
      <v-divider />
      <div class="text-subtitle-2">{{ $t('restaurant.plan.issues.title') }}</div>
      <!-- Cada aviso va en su `div`: `v-alert` trae `flex: 1 1 0%` y, directo en una columna flex, se encoge a 0 o se estira a todo el alto. -->
      <div v-for="issue in issues" :key="issue.key">
        <v-alert type="warning">
          {{ $t(`restaurant.plan.issues.${issue.key}`, { count: issue.ids.length }) }}
          <div v-if="issue.key === 'looseWalls' && canManage" class="mt-2">
            <v-btn size="small" variant="flat" color="warning" prepend-icon="mdi-vector-combine" @click="store.joinWalls()">
              {{ $t('restaurant.plan.join') }}
            </v-btn>
          </div>
        </v-alert>
      </div>
    </template>

    <v-dialog v-model="duplicateOpen" max-width="420">
      <v-card>
        <v-card-title>{{ $t('restaurant.inspector.duplicateTitle') }}</v-card-title>
        <v-card-text class="d-flex flex-column ga-3">
          <v-text-field v-model.number="duplicate.count" type="number" min="1" max="20" :label="$t('restaurant.inspector.duplicateCount')" />
          <v-select v-model="duplicate.direction" :items="duplicateOptions" :label="$t('restaurant.inspector.duplicateDirection')" />
          <v-text-field v-model.number="duplicate.spacingM" type="number" min="0" step="0.1" :label="$t('restaurant.inspector.duplicateSpacing')" suffix="m" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="duplicateOpen = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="flat" @click="confirmDuplicate">{{ $t('restaurant.inspector.duplicateConfirm') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-sheet>
</template>
