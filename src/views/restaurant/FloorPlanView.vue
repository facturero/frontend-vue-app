<script setup lang="ts">
/**
 * Editor del plano del local.
 *
 * Tres piezas: la barra de herramientas, el lienzo (SVG en centímetros) y el
 * panel de propiedades. El estado y los comandos viven en
 * `stores/floorplanEditor.ts`; esta vista solo orquesta el ciclo de carga, el
 * guardado atómico y los diálogos (conflicto, salida con cambios, «Salón»).
 *
 * El borrador se autoguarda en el navegador, así que salir con cambios no los
 * pierde del todo; aun así se pide confirmación, porque no están en el servidor.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useRestaurantEstablishment } from '@/composable/useRestaurantEstablishment';
import { useFloorPlanEditorStore, type EditorTool } from '@/stores/floorplanEditor';
import type { ObjectKind } from '@/types/restaurant';
import { extractErrorCode } from '@/utils/error';
import PageHeader from '@/components/ui/PageHeader.vue';
import RestaurantTabs from '@/components/restaurant/RestaurantTabs.vue';
import EstablishmentSelect from '@/components/restaurant/EstablishmentSelect.vue';
import FloorPlanToolbar from '@/components/restaurant/floorplan/FloorPlanToolbar.vue';
import FloorPlanCanvas from '@/components/restaurant/floorplan/FloorPlanCanvas.vue';
import FloorPlanInspector from '@/components/restaurant/floorplan/FloorPlanInspector.vue';

const { t } = useI18n();
const { restaurant, ready, establishmentId, showSelector, hasEstablishments, bootstrap } = useRestaurantEstablishment();
const auth = useAuthStore();
const editor = useFloorPlanEditorStore();

const canManage = computed(() => auth.can('restaurant:manage'));

const canvas = ref<InstanceType<typeof FloorPlanCanvas> | null>(null);
const preset = ref('mesa4');
const objectKind = ref<ObjectKind>('bar');

const loadError = ref<string | null>(null);
const saveError = ref<string | null>(null);
const noFloor = ref(false);
const restoredDraft = ref(false);
const saving = ref(false);
const snackbar = ref<string | null>(null);

const conflictOpen = ref(false);
const leaveOpen = ref(false);
const roomOpen = ref(false);
const roomError = ref<string | null>(null);
const roomForm = ref({ widthM: 8, heightM: 6 });
const wallLengthM = ref(1);

const floorId = computed(() => restaurant.floor?.id ?? null);

let leaveResolve: ((value: boolean) => void) | null = null;

function scopeKey(): string {
  const user = auth.user as { id?: string; orgId?: string | null } | null;
  return `${user?.orgId ?? 'sin-org'}:${user?.id ?? 'sin-usuario'}`;
}

async function reload(): Promise<void> {
  loadError.value = null;
  noFloor.value = false;
  if (!establishmentId.value) return;
  try {
    if (canManage.value) await restaurant.setup(establishmentId.value);
    await restaurant.fetchFloors(establishmentId.value);
    const first = restaurant.floors[0];
    if (!first) {
      noFloor.value = true;
      return;
    }
    await restaurant.fetchPlan(first.id);
    const plan = restaurant.plan;
    if (!plan) return;
    editor.load(scopeKey(), plan);
    restoredDraft.value = editor.dirty;
    await nextTick();
    canvas.value?.fit();
  } catch {
    loadError.value = restaurant.error;
  }
}

async function load(): Promise<void> {
  await bootstrap();
  await reload();
}

async function onEstablishmentChange(id: string): Promise<void> {
  restaurant.selectEstablishment(id);
  await reload();
}

onMounted(load);

async function save(): Promise<void> {
  const id = floorId.value;
  if (!id) return;
  saveError.value = null;
  saving.value = true;
  try {
    const floor = await restaurant.savePlan(id, editor.toPayload());
    editor.markSaved(floor);
    restoredDraft.value = false;
    snackbar.value = t('restaurant.plan.saved');
  } catch (e) {
    if (extractErrorCode(e) === 'PLAN_VERSION_CONFLICT') conflictOpen.value = true;
    else saveError.value = restaurant.error;
  } finally {
    saving.value = false;
  }
}

/** El otro guardó antes: se descarta el borrador propio y se recarga lo último. */
async function reloadAfterConflict(): Promise<void> {
  conflictOpen.value = false;
  editor.clearDraft();
  await reload();
}

/** Copia el plano propio al portapapeles para no perderlo al recargar. */
async function copyMine(): Promise<void> {
  try {
    await navigator.clipboard.writeText(JSON.stringify(editor.toPayload(), null, 2));
    snackbar.value = t('restaurant.plan.conflictCopied');
  } catch {
    saveError.value = t('restaurant.plan.saveError');
  }
}

function openRoom(): void {
  roomError.value = null;
  roomForm.value = { widthM: 8, heightM: 6 };
  roomOpen.value = true;
}

function confirmRoom(): void {
  const widthCm = Math.round((roomForm.value.widthM || 0) * 100);
  const heightCm = Math.round((roomForm.value.heightM || 0) * 100);
  if (widthCm < 100 || heightCm < 100) {
    roomError.value = t('restaurant.plan.invalidPlan');
    return;
  }
  editor.createRoom(widthCm, heightCm);
  roomOpen.value = false;
}

function applyWallLength(): void {
  const cm = Math.round((wallLengthM.value || 0) * 100);
  if (cm > 0) editor.applyWallLength(cm);
}

// ── Atajos de teclado ────────────────────────────────────────────────────────
const shortcuts: Record<string, EditorTool> = {
  v: 'select',
  w: 'wall',
  d: 'door',
  t: 'table',
  z: 'zone',
  o: 'object',
  e: 'erase',
};

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function onKeydown(e: KeyboardEvent): void {
  if (!canManage.value || isTyping(e.target)) return;
  const key = e.key.toLowerCase();
  if (e.key === 'Escape') {
    editor.finishWall();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && key === 'z') {
    e.preventDefault();
    if (e.shiftKey) editor.redo();
    else editor.undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && key === 'y') {
    e.preventDefault();
    editor.redo();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tool = shortcuts[key];
  if (tool) {
    editor.setTool(tool);
    return;
  }
  if (key === 'delete' || key === 'backspace') {
    e.preventDefault();
    editor.removeSelection();
  }
}

function onBeforeUnload(e: BeforeUnloadEvent): void {
  if (!editor.dirty) return;
  e.preventDefault();
  e.returnValue = '';
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  // Cerrar o recargar la pestaña con cambios sin guardar también avisa.
  window.addEventListener('beforeunload', onBeforeUnload);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('beforeunload', onBeforeUnload);
});

onBeforeRouteLeave(() => {
  if (!editor.dirty) return true;
  return new Promise<boolean>((resolve) => {
    leaveResolve = resolve;
    leaveOpen.value = true;
  });
});

function stay(): void {
  leaveOpen.value = false;
  leaveResolve?.(false);
  leaveResolve = null;
}

function leaveAnyway(): void {
  leaveOpen.value = false;
  leaveResolve?.(true);
  leaveResolve = null;
}
</script>

<template>
  <v-container fluid class="pa-4">
    <PageHeader :title="$t('restaurant.plan.title')" :subtitle="$t('restaurant.plan.intro')">
      <template #actions>
        <v-chip v-if="editor.dirty" color="lightwarning" variant="flat">{{ $t('restaurant.plan.dirty') }}</v-chip>
        <v-chip v-else color="lightsuccess" variant="flat">{{ $t('restaurant.plan.allSaved') }}</v-chip>
        <v-btn
          v-if="canManage"
          color="primary"
          prepend-icon="mdi-content-save"
          :loading="saving"
          :disabled="!floorId"
          data-testid="plan-save"
          @click="save"
        >
          {{ $t('restaurant.plan.save') }}
        </v-btn>
      </template>
    </PageHeader>

    <RestaurantTabs />

    <EstablishmentSelect v-if="showSelector" :model-value="establishmentId" @update:model-value="onEstablishmentChange" />

    <v-alert v-if="loadError" type="error" closable class="mb-4" @click:close="loadError = null">{{ loadError }}</v-alert>
    <v-alert v-else-if="ready && !hasEstablishments" type="info" class="mb-4">
      {{ $t('restaurant.noEstablishment') }}
    </v-alert>
    <v-alert v-else-if="noFloor" type="info" class="mb-4">{{ $t('restaurant.plan.noFloor') }}</v-alert>
    <v-alert v-if="restoredDraft" type="info" closable class="mb-4" @click:close="restoredDraft = false">
      {{ $t('restaurant.plan.draftLoaded') }}
    </v-alert>
    <v-alert v-if="saveError" type="error" closable class="mb-4" @click:close="saveError = null">{{ saveError }}</v-alert>

    <div v-if="ready && floorId" class="d-flex flex-column flex-lg-row ga-4">
      <FloorPlanToolbar
        v-model:preset="preset"
        v-model:object-kind="objectKind"
        @room="openRoom"
        @fit="canvas?.fit()"
      />

      <div class="position-relative flex-grow-1" style="height: 65vh; min-height: 420px">
        <v-sheet class="position-absolute w-100 h-100" style="inset: 0" border>
          <FloorPlanCanvas ref="canvas" :preset="preset" :object-kind="objectKind" />
        </v-sheet>

        <v-sheet
          v-if="editor.activeTool === 'wall'"
          class="pa-2 position-absolute d-flex align-center ga-3 flex-wrap"
          style="top: 8px; left: 8px; right: 8px"
          elevation="2"
        >
          <span class="text-body-2 text-medium-emphasis">{{ $t('restaurant.plan.wallHint') }}</span>
          <v-text-field
            v-if="editor.wallAnchor"
            v-model.number="wallLengthM"
            type="number"
            min="0.1"
            step="0.1"
            :label="$t('restaurant.plan.wallLength')"
            suffix="m"
            style="max-width: 140px"
            @change="applyWallLength"
          />
          <v-btn v-if="editor.wallAnchor" size="small" variant="tonal" @click="editor.finishWall()">
            {{ $t('common.close') }}
          </v-btn>
        </v-sheet>
      </div>

      <FloorPlanInspector />
    </div>

    <v-skeleton-loader v-else-if="!ready" type="image" />

    <!-- Conflicto de versión: otro guardó antes. -->
    <v-dialog v-model="conflictOpen" max-width="520" persistent>
      <v-card>
        <v-card-title>{{ $t('restaurant.plan.conflictTitle') }}</v-card-title>
        <v-card-text>{{ $t('restaurant.plan.conflictBody') }}</v-card-text>
        <v-card-actions class="flex-wrap">
          <v-spacer />
          <v-btn variant="text" @click="copyMine">{{ $t('restaurant.plan.conflictCopy') }}</v-btn>
          <v-btn color="primary" variant="flat" @click="reloadAfterConflict">{{ $t('restaurant.plan.conflictReload') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Salir con cambios sin guardar. -->
    <v-dialog v-model="leaveOpen" max-width="520" persistent>
      <v-card>
        <v-card-title>{{ $t('restaurant.plan.leaveTitle') }}</v-card-title>
        <v-card-text>{{ $t('restaurant.plan.leaveBody') }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="stay">{{ $t('restaurant.plan.leaveStay') }}</v-btn>
          <v-btn color="primary" variant="flat" @click="leaveAnyway">{{ $t('restaurant.plan.leaveLeave') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- «Salón 8 × 6 m»: cuatro paredes y el tamaño del local. -->
    <v-dialog v-model="roomOpen" max-width="480" persistent>
      <v-card>
        <v-card-title>{{ $t('restaurant.plan.roomTitle') }}</v-card-title>
        <v-card-text class="d-flex flex-column ga-3">
          <p class="text-body-2 text-medium-emphasis">{{ $t('restaurant.plan.roomIntro') }}</p>
          <div v-if="roomError"><v-alert type="error">{{ roomError }}</v-alert></div>
          <div class="d-flex ga-3">
            <v-text-field v-model.number="roomForm.widthM" type="number" min="1" step="0.5" :label="$t('restaurant.plan.roomWidth')" suffix="m" />
            <v-text-field v-model.number="roomForm.heightM" type="number" min="1" step="0.5" :label="$t('restaurant.plan.roomHeight')" suffix="m" />
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="roomOpen = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="flat" @click="confirmRoom">{{ $t('restaurant.plan.roomCreate') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar :model-value="snackbar !== null" color="success" @update:model-value="snackbar = null">{{ snackbar }}</v-snackbar>
  </v-container>
</template>
