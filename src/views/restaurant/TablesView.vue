<script setup lang="ts">
/**
 * Mesas del local.
 *
 * Es la pantalla de entrada del plugin. Quien llega sin nada montado ve una
 * pregunta y un botón («¿Cuántas mesas tienes?» → alta en bloque); quien ya las
 * tiene ve la lista y un atajo al plano. Aquí se editan los datos que no
 * necesitan dibujo (nombre, capacidad, zona, activa); la forma, el tamaño y la
 * posición se ajustan en el editor del plano.
 *
 * Una mesa nunca se borra: se desactiva y conserva su id, para no romper las
 * reservas del entregable 2.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useRestaurantEstablishment } from '@/composable/useRestaurantEstablishment';
import type { DiningTable } from '@/types/restaurant';
import PageHeader from '@/components/ui/PageHeader.vue';
import RestaurantTabs from '@/components/restaurant/RestaurantTabs.vue';
import EstablishmentSelect from '@/components/restaurant/EstablishmentSelect.vue';
import TableDialog from '@/components/restaurant/TableDialog.vue';
import BulkTablesDialog from '@/components/restaurant/BulkTablesDialog.vue';
import FloorPlanViewer from '@/components/restaurant/floorplan/FloorPlanViewer.vue';

const { t } = useI18n();
const { restaurant, ready, establishmentId, showSelector, hasEstablishments, bootstrap } = useRestaurantEstablishment();
const auth = useAuthStore();

const canManage = computed(() => auth.can('restaurant:manage'));

const loadError = ref<string | null>(null);
const snackbar = ref<{ text: string; color: string } | null>(null);

const tableDialog = ref(false);
const bulkDialog = ref(false);
const editing = ref<DiningTable | null>(null);
const formError = ref<string | null>(null);
const deactivateTarget = ref<DiningTable | null>(null);

const tables = computed(() => restaurant.tables);
const zones = computed(() => restaurant.zones);
const floorId = computed(() => restaurant.floor?.id ?? null);
const hasTables = computed(() => tables.value.length > 0);
const planElements = computed(() => restaurant.plan?.layout.elements ?? []);
const hasDrawing = computed(() => planElements.value.length > 0 || tables.value.some((tb) => tb.xCm !== null));

const headers = computed(() => [
  { title: t('restaurant.tables.name'), key: 'name', sortable: true, align: 'start' as const },
  { title: t('restaurant.tables.capacityRange'), key: 'capacityMin', sortable: false, align: 'start' as const },
  { title: t('restaurant.tables.zone'), key: 'zoneId', sortable: false, align: 'start' as const },
  { title: t('restaurant.tables.position'), key: 'placed', sortable: false, align: 'start' as const },
  { title: t('common.status'), key: 'status', sortable: false, align: 'start' as const },
  { title: t('common.actions'), key: 'actions', sortable: false, align: 'end' as const },
]);

function zoneLabel(zoneId: string | null): string {
  if (!zoneId) return t('restaurant.tables.noZone');
  return zones.value.find((z) => z.id === zoneId)?.name ?? t('restaurant.tables.noZone');
}

function notify(text: string, color = 'success'): void {
  snackbar.value = { text, color };
}

async function load(): Promise<void> {
  loadError.value = null;
  await bootstrap();
  if (!establishmentId.value) return;
  try {
    // Idempotente: deja planta y horario si aún no existen. Solo con permiso de
    // gestión, porque crear datos con permiso de solo lectura daría 403.
    if (canManage.value) await restaurant.setup(establishmentId.value);
    await restaurant.fetchFloors(establishmentId.value);
    const first = restaurant.floors[0];
    if (first) await restaurant.fetchPlan(first.id);
  } catch {
    loadError.value = restaurant.error;
  }
}

onMounted(load);

async function onEstablishmentChange(id: string): Promise<void> {
  restaurant.selectEstablishment(id);
  await load();
}

function openCreate(): void {
  editing.value = null;
  formError.value = null;
  tableDialog.value = true;
}

function openEdit(table: DiningTable): void {
  editing.value = table;
  formError.value = null;
  tableDialog.value = true;
}

function openBulk(): void {
  formError.value = null;
  bulkDialog.value = true;
}

async function onTableSubmit(payload: {
  name: string;
  capacityMin: number;
  capacityMax: number;
  zoneId: string | null;
  active: boolean;
}): Promise<void> {
  formError.value = null;
  const id = floorId.value;
  if (!id) return;
  try {
    if (editing.value) {
      await restaurant.updateTable(editing.value.id, {
        name: payload.name,
        capacityMin: payload.capacityMin,
        capacityMax: payload.capacityMax,
        zoneId: payload.zoneId,
        status: payload.active ? 'active' : 'inactive',
      });
      notify(t('restaurant.tables.updated'));
    } else {
      // Nace sin ubicar (`xCm`/`yCm` nulos): existe y es reservable, y el editor
      // del plano la coloca en una rejilla de trabajo al abrirlo.
      await restaurant.createTable(id, {
        name: payload.name,
        capacityMin: payload.capacityMin,
        capacityMax: payload.capacityMax,
        zoneId: payload.zoneId,
      });
      notify(t('restaurant.tables.created'));
    }
    tableDialog.value = false;
    editing.value = null;
  } catch {
    formError.value = restaurant.error;
  }
}

async function onBulkSubmit(payload: { count: number; capacityMin: number; capacityMax: number; prefix: string }): Promise<void> {
  formError.value = null;
  if (!floorId.value) return;
  try {
    await restaurant.bulkCreateTables(floorId.value, payload);
    notify(t('restaurant.bulk.created', { count: payload.count }));
    bulkDialog.value = false;
  } catch {
    formError.value = restaurant.error;
  }
}

async function confirmDeactivate(): Promise<void> {
  if (!deactivateTarget.value) return;
  try {
    await restaurant.updateTable(deactivateTarget.value.id, { status: 'inactive' });
    notify(t('restaurant.tables.deactivated'));
    deactivateTarget.value = null;
  } catch {
    notify(restaurant.error ?? t('common.noData'), 'error');
  }
}

async function reactivate(table: DiningTable): Promise<void> {
  try {
    await restaurant.updateTable(table.id, { status: 'active' });
    notify(t('restaurant.tables.reactivated'));
  } catch {
    notify(restaurant.error ?? t('common.noData'), 'error');
  }
}
</script>

<template>
  <v-container>
    <PageHeader :title="$t('restaurant.tables.title')" :subtitle="$t('restaurant.tables.intro')">
      <template #actions>
        <v-btn v-if="hasTables" variant="text" prepend-icon="mdi-vector-rectangle" :to="{ name: 'restaurant-plan' }">
          {{ hasDrawing ? $t('restaurant.tables.openPlan') : $t('restaurant.tables.drawPlan') }}
        </v-btn>
        <v-btn v-if="canManage && hasTables" color="primary" prepend-icon="mdi-plus" @click="openCreate">
          {{ $t('restaurant.tables.add') }}
        </v-btn>
      </template>
    </PageHeader>

    <RestaurantTabs />

    <EstablishmentSelect v-if="showSelector" :model-value="establishmentId" @update:model-value="onEstablishmentChange" />

    <v-alert v-if="loadError" type="error" closable class="mb-4" @click:close="loadError = null">
      {{ loadError }}
    </v-alert>

    <v-alert v-else-if="ready && !hasEstablishments" type="info" class="mb-4">
      {{ $t('restaurant.noEstablishment') }}
    </v-alert>

    <v-skeleton-loader v-else-if="!ready" type="table" />

    <!-- Arranque: quien no tiene nada montado empieza aquí. -->
    <v-card v-else-if="!hasTables" class="pa-6 text-center">
      <div class="text-h6 mb-2">{{ $t('restaurant.tables.emptyTitle') }}</div>
      <p class="text-body-2 text-medium-emphasis mb-4 mx-auto" style="max-width: 520px">
        {{ $t('restaurant.tables.emptyIntro') }}
      </p>
      <v-btn v-if="canManage" color="primary" size="large" prepend-icon="mdi-table-furniture" @click="openBulk">
        {{ $t('restaurant.tables.start') }}
      </v-btn>
    </v-card>

    <template v-else>
      <v-card class="mb-4">
        <v-data-table :headers="headers" :items="tables" :loading="restaurant.loading" item-value="id" :items-per-page="50">
          <template #item.name="{ item }">
            <span class="font-weight-medium">{{ item.name }}</span>
          </template>

          <template #item.capacityMin="{ item }">{{ item.capacityMin }}–{{ item.capacityMax }}</template>

          <template #item.zoneId="{ item }">{{ zoneLabel(item.zoneId) }}</template>

          <template #item.placed="{ item }">
            <v-chip size="x-small" variant="flat" :color="item.xCm !== null ? 'lightsuccess' : 'lightwarning'">
              {{ item.xCm !== null ? $t('restaurant.tables.placed') : $t('restaurant.tables.unplaced') }}
            </v-chip>
          </template>

          <template #item.status="{ item }">
            <v-chip size="x-small" variant="flat" :color="item.status === 'active' ? 'lightsuccess' : 'lightwarning'">
              {{ item.status === 'active' ? $t('common.active') : $t('common.inactive') }}
            </v-chip>
          </template>

          <template #item.actions="{ item }">
            <v-btn v-if="canManage" size="small" variant="text" icon="mdi-pencil" :title="$t('common.edit')" @click="openEdit(item)" />
            <v-btn
              v-if="canManage && item.status === 'active'"
              size="small"
              variant="text"
              icon="mdi-archive-off-outline"
              :title="$t('restaurant.tables.deactivate')"
              @click="deactivateTarget = item"
            />
            <v-btn
              v-if="canManage && item.status === 'inactive'"
              size="small"
              variant="text"
              icon="mdi-restore"
              :title="$t('restaurant.tables.reactivate')"
              @click="reactivate(item)"
            />
          </template>

          <template #no-data>
            <div class="text-center text-medium-emphasis pa-6">{{ $t('restaurant.tables.noTables') }}</div>
          </template>
        </v-data-table>
      </v-card>

      <v-card v-if="hasDrawing" class="pa-4">
        <div class="d-flex align-center justify-space-between mb-2 ga-4">
          <div>
            <div class="text-h6">{{ $t('restaurant.tables.planCardTitle') }}</div>
            <div class="text-body-2 text-medium-emphasis">{{ $t('restaurant.tables.planCardIntro') }}</div>
          </div>
          <v-btn variant="tonal" :to="{ name: 'restaurant-plan' }">{{ $t('restaurant.tables.openPlan') }}</v-btn>
        </div>
        <FloorPlanViewer v-if="restaurant.plan" :plan="restaurant.plan" height="360px" />
      </v-card>
    </template>

    <TableDialog
      v-model="tableDialog"
      :table="editing"
      :zones="zones"
      :saving="restaurant.saving"
      :error="formError"
      @submit="onTableSubmit"
    />

    <BulkTablesDialog v-model="bulkDialog" :saving="restaurant.saving" :error="formError" @submit="onBulkSubmit" />

    <v-dialog :model-value="deactivateTarget !== null" max-width="480" @update:model-value="deactivateTarget = null">
      <v-card v-if="deactivateTarget">
        <v-card-title>{{ $t('restaurant.tables.deactivateTitle') }}</v-card-title>
        <v-card-text>{{ $t('restaurant.tables.deactivateBody', { name: deactivateTarget.name }) }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deactivateTarget = null">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="error" variant="flat" :loading="restaurant.saving" @click="confirmDeactivate">
            {{ $t('restaurant.tables.deactivate') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar :model-value="snackbar !== null" :color="snackbar?.color" @update:model-value="snackbar = null">
      {{ snackbar?.text }}
    </v-snackbar>
  </v-container>
</template>
