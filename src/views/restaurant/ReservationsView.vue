<script setup lang="ts">
/**
 * Reservas del día.
 *
 * La pantalla de quien recibe a los clientes: quién viene, cuántos son, a qué hora y en qué mesa. Se anotan las que llegan por
 * teléfono y se marca el avance (sentar, terminar, no se presentó). Cancelar libera las mesas al instante y, si el cliente dejó
 * su correo, le avisa.
 *
 * Las reservas que hace el cliente solo por internet entran solas: aparecen aquí con la marca «Por internet».
 */
import { computed, onMounted, ref, watch } from 'vue';
import DateField from '@/components/ui/DateField.vue';
import { notify as appNotify } from '@/composable/useNotify';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useRestaurantEstablishment } from '@/composable/useRestaurantEstablishment';
import { shiftDate, todayLocal, useReservationsStore } from '@/stores/reservations';
import { reservationActions, reservationStatusColor } from '@/utils/reservations';
import type { Reservation } from '@/types/restaurant';
import PageHeader from '@/components/ui/PageHeader.vue';
import RestaurantTabs from '@/components/restaurant/RestaurantTabs.vue';
import EstablishmentSelect from '@/components/restaurant/EstablishmentSelect.vue';
import ReservationDialog from '@/components/restaurant/ReservationDialog.vue';
import { restaurantApi } from '@/api/restaurant';
import type { DiningTable } from '@/types/restaurant';

const { t, locale } = useI18n();
const { restaurant, ready, establishmentId, showSelector, hasEstablishments, bootstrap } = useRestaurantEstablishment();
const store = useReservationsStore();
const auth = useAuthStore();

const canManage = computed(() => auth.can('reservation:manage'));

const loadError = ref<string | null>(null);
/** Cada aviso lleva su propia clave: así reinicia el temporizador del aviso y no hereda el que ya estaba por cerrarse. */
const showClosed = ref(false);
const dialog = ref(false);
const tables = ref<DiningTable[]>([]);
const cancelTarget = ref<Reservation | null>(null);
const cancelReason = ref('');

const visible = computed(() =>
  store.reservations.filter((r) => showClosed.value || (r.status !== 'cancelled' && r.status !== 'no_show')),
);
const hiddenCount = computed(() => store.reservations.length - visible.value.length);
const isToday = computed(() => store.date === todayLocal());

/** «sábado, 17 de octubre»: la fecha se arma a mediodía UTC para que ninguna zona horaria la corra de día. */
const dayLabel = computed(() => {
  const [y, m, d] = store.date.split('-').map(Number);
  const text = new Intl.DateTimeFormat(locale.value, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 12)),
  );
  // Solo la primera letra en mayúscula («Miércoles, 14 de octubre»): `text-capitalize` pondría «De» y «Octubre» también.
  return text.charAt(0).toLocaleUpperCase(locale.value) + text.slice(1);
});

const headers = computed(() => [
  { title: t('restaurant.reservations.columns.time'), key: 'time', sortable: false, align: 'start' as const },
  { title: t('restaurant.reservations.columns.guest'), key: 'guestName', sortable: false, align: 'start' as const },
  { title: t('restaurant.reservations.columns.party'), key: 'partySize', sortable: false, align: 'start' as const },
  { title: t('restaurant.reservations.columns.tables'), key: 'tables', sortable: false, align: 'start' as const },
  { title: t('common.status'), key: 'status', sortable: false, align: 'start' as const },
  { title: t('common.actions'), key: 'actions', sortable: false, align: 'end' as const },
]);

function notify(text: string, color = 'success'): void {
  // Envoltorio del aviso global (composable/useNotify): las llamadas de esta vista ya pasan su color.
  if (color === 'error') appNotify.error(text);
  else appNotify.success(text);
}

async function loadDay(): Promise<void> {
  if (!establishmentId.value) return;
  loadError.value = null;
  try {
    await store.fetchDay(establishmentId.value, store.date);
  } catch {
    loadError.value = store.error;
  }
}

async function load(): Promise<void> {
  loadError.value = null;
  await bootstrap();
  if (!establishmentId.value) return;
  try {
    // Idempotente. Solo con permiso del mapa: quien solo recibe clientes no debe provocar un 403 aquí.
    if (auth.can('restaurant:manage')) await restaurant.setup(establishmentId.value);
    tables.value = await restaurantApi.listTables(establishmentId.value, { status: 'active' }).catch(() => []);
  } catch {
    loadError.value = restaurant.error;
    return;
  }
  await loadDay();
}

async function onEstablishmentChange(id: string): Promise<void> {
  restaurant.selectEstablishment(id);
  await load();
}

function goTo(day: string): void {
  if (day) store.date = day;
}

onMounted(load);
watch(
  () => store.date,
  () => void loadDay(),
);

async function runAction(r: Reservation, status: 'seated' | 'completed' | 'no_show', doneKey: string): Promise<void> {
  try {
    await store.changeStatus(r.id, status);
    notify(t(doneKey));
  } catch {
    notify(store.error ?? t('common.saveError'), 'error');
  }
}

function openCancel(r: Reservation): void {
  cancelTarget.value = r;
  cancelReason.value = '';
}

async function confirmCancel(): Promise<void> {
  const target = cancelTarget.value;
  if (!target) return;
  try {
    await store.cancel(target.id, cancelReason.value.trim() || null);
    notify(t('restaurant.reservations.cancelled'));
    cancelTarget.value = null;
  } catch {
    notify(store.error ?? t('common.saveError'), 'error');
  }
}

async function onCreated(): Promise<void> {
  notify(t('restaurant.reservations.dialog.created'));
}
</script>

<template>
  <v-container>
    <PageHeader :title="$t('restaurant.reservations.title')" :subtitle="$t('restaurant.reservations.intro')">
      <template #actions>
        <v-btn
          v-if="canManage && establishmentId"
          color="primary"
          prepend-icon="mdi-plus"
          data-testid="resv-new"
          @click="dialog = true"
        >
          {{ $t('restaurant.reservations.new') }}
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

    <template v-else>
      <!-- Navegación por días -->
      <div class="d-flex flex-wrap align-center ga-2 mb-4">
        <v-btn icon="mdi-chevron-left" variant="text" :title="$t('restaurant.reservations.prevDay')" @click="goTo(shiftDate(store.date, -1))" />
        <DateField
          :model-value="store.date"
          :label="$t('restaurant.reservations.day')"
          style="max-width: 190px"
          data-testid="resv-day"
          required
          @update:model-value="(v) => v && goTo(v)"
        />
        <v-btn icon="mdi-chevron-right" variant="text" :title="$t('restaurant.reservations.nextDay')" @click="goTo(shiftDate(store.date, 1))" />
        <v-btn v-if="!isToday" variant="tonal" @click="goTo(todayLocal())">{{ $t('restaurant.reservations.today') }}</v-btn>
        <v-spacer />
        <v-switch v-model="showClosed" :label="$t('restaurant.reservations.showClosed')" />
      </div>

      <div class="d-flex flex-wrap align-center ga-2 mb-4">
        <div class="text-title-large">{{ dayLabel }}</div>
        <v-chip size="small" variant="flat" color="lightprimary" data-testid="resv-count">
          {{ $t('restaurant.reservations.summary', { count: store.active.length, guests: store.expectedGuests }) }}
        </v-chip>
        <span v-if="hiddenCount && !showClosed" class="text-body-medium text-medium-emphasis">
          {{ $t('restaurant.reservations.hidden', { count: hiddenCount }) }}
        </span>
      </div>

      <v-card>
        <v-data-table :headers="headers" :items="visible" :loading="store.loading" item-value="id" :items-per-page="100" hide-default-footer>
          <template #item.time="{ item }">
            <span class="font-weight-medium">{{ item.time }}</span>
          </template>

          <template #item.guestName="{ item }">
            <div class="font-weight-medium">{{ item.guestName }}</div>
            <div class="text-body-medium text-medium-emphasis">
              <a :href="`tel:${item.guestPhone}`">{{ item.guestPhone }}</a>
              <v-icon
                v-if="item.source === 'online'"
                size="small"
                class="ml-1"
                icon="mdi-web"
                :title="$t('restaurant.reservations.source.online')"
              />
            </div>
            <div v-if="item.notes" class="text-body-medium text-medium-emphasis">
              <v-icon size="x-small" icon="mdi-note-text-outline" /> {{ item.notes }}
            </div>
          </template>

          <template #item.tables="{ item }">
            <v-chip v-for="table in item.tables" :key="table.id" size="x-small" class="mr-1">{{ table.name }}</v-chip>
          </template>

          <template #item.status="{ item }">
            <v-chip size="x-small" variant="flat" :color="reservationStatusColor(item.status)">
              {{ $t(`restaurant.reservations.status.${item.status}`) }}
            </v-chip>
          </template>

          <template #item.actions="{ item }">
            <template v-if="canManage">
              <v-btn
                v-if="reservationActions(item.status).seat"
                size="small"
                variant="tonal"
                color="success"
                class="mr-1"
                @click="runAction(item, 'seated', 'restaurant.reservations.seated')"
              >
                {{ $t('restaurant.reservations.actions.seat') }}
              </v-btn>
              <v-btn
                v-if="reservationActions(item.status).complete"
                size="small"
                variant="tonal"
                class="mr-1"
                @click="runAction(item, 'completed', 'restaurant.reservations.completed')"
              >
                {{ $t('restaurant.reservations.actions.complete') }}
              </v-btn>
              <v-btn
                v-if="reservationActions(item.status).noShow"
                size="small"
                variant="text"
                :title="$t('restaurant.reservations.actions.noShow')"
                icon="mdi-account-off-outline"
                @click="runAction(item, 'no_show', 'restaurant.reservations.noShown')"
              />
              <v-btn
                v-if="reservationActions(item.status).cancel"
                size="small"
                variant="text"
                icon="mdi-close"
                :title="$t('restaurant.reservations.actions.cancel')"
                @click="openCancel(item)"
              />
            </template>
          </template>

          <template #no-data>
            <div class="text-center text-medium-emphasis pa-6">{{ $t('restaurant.reservations.empty') }}</div>
          </template>
        </v-data-table>
      </v-card>
    </template>

    <ReservationDialog
      v-if="establishmentId"
      v-model="dialog"
      :establishment-id="establishmentId"
      :initial-date="store.date"
      :tables="tables"
      @created="onCreated"
    />

    <v-dialog :model-value="cancelTarget !== null" max-width="480" @update:model-value="cancelTarget = null">
      <v-card v-if="cancelTarget">
        <v-card-title>{{ $t('restaurant.reservations.cancelDialog.title') }}</v-card-title>
        <v-card-text class="d-flex flex-column ga-4">
          <div>
            {{
              $t('restaurant.reservations.cancelDialog.body', {
                name: cancelTarget.guestName,
                time: cancelTarget.time,
                party: cancelTarget.partySize,
              })
            }}
          </div>
          <div class="text-body-medium text-medium-emphasis">
            {{
              cancelTarget.guestEmail
                ? $t('restaurant.reservations.cancelDialog.willEmail', { email: cancelTarget.guestEmail })
                : $t('restaurant.reservations.cancelDialog.noEmail')
            }}
          </div>
          <v-text-field v-model="cancelReason" :label="$t('restaurant.reservations.cancelDialog.reason')" maxlength="300" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="cancelTarget = null">{{ $t('restaurant.reservations.cancelDialog.keep') }}</v-btn>
          <v-btn color="error" variant="flat" :loading="store.saving" @click="confirmCancel">
            {{ $t('restaurant.reservations.cancelDialog.confirm') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

  </v-container>
</template>
