<script setup lang="ts">
/**
 * Página de reservas del restaurante.
 *
 * Aquí el dueño decide si sus clientes pueden reservar por internet, con qué dirección y bajo qué reglas (cuántas personas,
 * cuántas mesas, con cuánta anticipación). La dirección es la que se comparte en redes, en Google o en la puerta del local:
 * `reservas.noahsolution.com/<dirección>`.
 *
 * El interruptor es lo último que se enciende: antes hay que tener horarios y mesas, y la pantalla lo dice.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { notify } from '@/composable/useNotify';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useRestaurantEstablishment } from '@/composable/useRestaurantEstablishment';
import { useReservationsStore } from '@/stores/reservations';
import { restaurantApi } from '@/api/restaurant';
import { NOTICE_PRESETS, publicReservationUrl, reservationsBaseUrl, slugify } from '@/utils/reservations';
import type { ReservationSettingsInput } from '@/types/restaurant';
import PageHeader from '@/components/ui/PageHeader.vue';
import RestaurantTabs from '@/components/restaurant/RestaurantTabs.vue';
import EstablishmentSelect from '@/components/restaurant/EstablishmentSelect.vue';

const { t } = useI18n();
const { restaurant, ready, establishmentId, showSelector, hasEstablishments, bootstrap } = useRestaurantEstablishment();
const store = useReservationsStore();
const auth = useAuthStore();

const canManage = computed(() => auth.can('reservation:manage'));

const loadError = ref<string | null>(null);
const saveError = ref<string | null>(null);
const hasShifts = ref(true);
const hasTables = ref(true);

const enabled = ref(false);
const displayName = ref('');
const slug = ref('');
const slugTouched = ref(false);
const contactPhone = ref('');
const publicNote = ref('');
const notifyEmail = ref('');
const maxPartySize = ref(10);
const maxTablesPerReservation = ref(3);
const maxDaysAhead = ref(30);
const minNoticeMinutes = ref(60);

const noticeItems = computed(() =>
  NOTICE_PRESETS.map((minutes) => ({ title: t(`restaurant.reservations.settings.notice.${minutes}`), value: minutes })),
);

const publicUrl = computed(() => publicReservationUrl(slug.value.trim().toLowerCase() || null));
const urlPrefix = computed(() => `${reservationsBaseUrl().replace(/^https?:\/\//, '')}/`);

/** Lo guardado, en la misma forma que el formulario, para saber si hay cambios sin guardar. */
function snapshot(): ReservationSettingsInput {
  return {
    enabled: enabled.value,
    displayName: displayName.value.trim() || null,
    publicSlug: slug.value.trim().toLowerCase() || null,
    contactPhone: contactPhone.value.trim() || null,
    publicNote: publicNote.value.trim() || null,
    notifyEmail: notifyEmail.value.trim() || null,
    maxPartySize: maxPartySize.value,
    maxTablesPerReservation: maxTablesPerReservation.value,
    maxDaysAhead: maxDaysAhead.value,
    minNoticeMinutes: minNoticeMinutes.value,
  };
}

const saved = ref('');
const dirty = computed(() => JSON.stringify(snapshot()) !== saved.value);

function syncFromStore(): void {
  const s = store.settings;
  if (!s) return;
  enabled.value = s.enabled;
  displayName.value = s.displayName ?? '';
  slug.value = s.publicSlug ?? '';
  slugTouched.value = Boolean(s.publicSlug);
  contactPhone.value = s.contactPhone ?? '';
  publicNote.value = s.publicNote ?? '';
  notifyEmail.value = s.notifyEmail ?? '';
  maxPartySize.value = s.maxPartySize;
  maxTablesPerReservation.value = s.maxTablesPerReservation;
  maxDaysAhead.value = s.maxDaysAhead;
  minNoticeMinutes.value = s.minNoticeMinutes;
  saved.value = JSON.stringify(snapshot());
}

// Mientras el dueño no haya tocado la dirección, se sugiere a partir del nombre.
watch(displayName, (name) => {
  if (!slugTouched.value) slug.value = slugify(name);
});

async function load(): Promise<void> {
  loadError.value = null;
  await bootstrap();
  if (!establishmentId.value) return;
  try {
    await store.fetchSettings(establishmentId.value);
    syncFromStore();
  } catch {
    loadError.value = store.error;
    return;
  }
  // Lo que falta antes de poder encender: horarios con turnos y al menos una mesa.
  try {
    const [schedule, tableList] = await Promise.all([
      restaurantApi.getSchedule(establishmentId.value),
      restaurantApi.listTables(establishmentId.value, { status: 'active' }),
    ]);
    hasShifts.value = schedule.shifts.length > 0;
    hasTables.value = tableList.length > 0;
  } catch {
    // Sin esos datos (el local aún no está inicializado) no se pueden dar avisos; la pantalla funciona igual.
    hasShifts.value = false;
    hasTables.value = false;
  }
}

async function onEstablishmentChange(id: string): Promise<void> {
  restaurant.selectEstablishment(id);
  await load();
}

onMounted(load);

async function save(): Promise<void> {
  if (!establishmentId.value) return;
  saveError.value = null;
  try {
    await store.saveSettings(establishmentId.value, snapshot());
    syncFromStore();
    notify.success(t('restaurant.reservations.settings.saved'));
  } catch {
    saveError.value = store.error;
  }
}

async function copyLink(): Promise<void> {
  if (!publicUrl.value) return;
  try {
    await navigator.clipboard.writeText(publicUrl.value);
    notify.success(t('restaurant.reservations.settings.copied'));
  } catch {
    notify.info(publicUrl.value);
  }
}
</script>

<template>
  <v-container>
    <PageHeader :title="$t('restaurant.reservations.settings.title')" :subtitle="$t('restaurant.reservations.settings.intro')">
      <template #actions>
        <v-btn v-if="canManage" color="primary" :disabled="!dirty" :loading="store.saving" data-testid="resv-settings-save" @click="save">
          {{ $t('common.save') }}
        </v-btn>
      </template>
    </PageHeader>

    <RestaurantTabs />

    <EstablishmentSelect v-if="showSelector" :model-value="establishmentId" @update:model-value="onEstablishmentChange" />

    <v-alert v-if="loadError" type="error" closable class="mb-4" @click:close="loadError = null">{{ loadError }}</v-alert>
    <v-alert v-else-if="ready && !hasEstablishments" type="info" class="mb-4">{{ $t('restaurant.noEstablishment') }}</v-alert>
    <v-skeleton-loader v-else-if="!ready || !store.settings" type="card" />

    <template v-else>
      <div v-if="saveError"><v-alert type="error" closable class="mb-4" @click:close="saveError = null">{{ saveError }}</v-alert></div>

      <div v-if="!hasShifts || !hasTables" class="mb-4">
        <v-alert type="warning">
          <div class="mb-2">{{ $t('restaurant.reservations.settings.notReady') }}</div>
          <div class="d-flex flex-wrap ga-2">
            <v-btn v-if="!hasShifts" size="small" variant="tonal" :to="{ name: 'restaurant-schedule' }">
              {{ $t('restaurant.reservations.settings.needSchedule') }}
            </v-btn>
            <v-btn v-if="!hasTables" size="small" variant="tonal" :to="{ name: 'restaurant-tables' }">
              {{ $t('restaurant.reservations.settings.needTables') }}
            </v-btn>
          </div>
        </v-alert>
      </div>

      <v-card class="mb-4">
        <v-card-title>{{ $t('restaurant.reservations.settings.pageTitle') }}</v-card-title>
        <v-card-text class="d-flex flex-column ga-4">
          <v-switch
            v-model="enabled"
            color="primary"
            :disabled="!canManage"
            :label="$t('restaurant.reservations.settings.enabled')"
            :hint="enabled ? $t('restaurant.reservations.settings.enabledOn') : $t('restaurant.reservations.settings.enabledOff')"
            persistent-hint
            data-testid="resv-enabled"
          />

          <v-text-field
            v-model="displayName"
            :disabled="!canManage"
            :label="$t('restaurant.reservations.settings.name')"
            :hint="$t('restaurant.reservations.settings.nameHint')"
            persistent-hint
            maxlength="120"
            data-testid="resv-name-public"
          />

          <v-text-field
            v-model="slug"
            :disabled="!canManage"
            :label="$t('restaurant.reservations.settings.link')"
            :prefix="urlPrefix"
            :hint="$t('restaurant.reservations.settings.linkHint')"
            persistent-hint
            maxlength="60"
            data-testid="resv-slug"
            @update:model-value="slugTouched = true"
          >
            <template v-if="publicUrl" #append-inner>
              <v-btn size="small" variant="text" icon="mdi-content-copy" :title="$t('restaurant.reservations.settings.copy')" @click="copyLink" />
              <v-btn
                size="small"
                variant="text"
                icon="mdi-open-in-new"
                :href="publicUrl"
                target="_blank"
                rel="noopener"
                :title="$t('restaurant.reservations.settings.open')"
              />
            </template>
          </v-text-field>

          <div class="d-flex flex-wrap ga-4">
            <v-text-field
              v-model="contactPhone"
              type="tel"
              :disabled="!canManage"
              :label="$t('restaurant.reservations.settings.phone')"
              :hint="$t('restaurant.reservations.settings.phoneHint')"
              persistent-hint
              style="min-width: 240px; flex: 1"
            />
            <v-text-field
              v-model="notifyEmail"
              type="email"
              :disabled="!canManage"
              :label="$t('restaurant.reservations.settings.notifyEmail')"
              :hint="$t('restaurant.reservations.settings.notifyEmailHint')"
              persistent-hint
              style="min-width: 240px; flex: 1"
            />
          </div>

          <v-textarea
            v-model="publicNote"
            :disabled="!canManage"
            rows="2"
            auto-grow
            counter="500"
            maxlength="500"
            :label="$t('restaurant.reservations.settings.note')"
            :hint="$t('restaurant.reservations.settings.noteHint')"
            persistent-hint
          />
        </v-card-text>
      </v-card>

      <v-card>
        <v-card-title>{{ $t('restaurant.reservations.settings.rulesTitle') }}</v-card-title>
        <v-card-subtitle>{{ $t('restaurant.reservations.settings.rulesIntro') }}</v-card-subtitle>
        <v-card-text class="d-flex flex-wrap ga-4">
          <v-text-field
            v-model.number="maxPartySize"
            type="number"
            min="1"
            max="100"
            :disabled="!canManage"
            :label="$t('restaurant.reservations.settings.maxParty')"
            :hint="$t('restaurant.reservations.settings.maxPartyHint')"
            persistent-hint
            style="min-width: 220px; flex: 1"
          />
          <v-text-field
            v-model.number="maxTablesPerReservation"
            type="number"
            min="1"
            max="10"
            :disabled="!canManage"
            :label="$t('restaurant.reservations.settings.maxTables')"
            :hint="$t('restaurant.reservations.settings.maxTablesHint')"
            persistent-hint
            style="min-width: 220px; flex: 1"
          />
          <v-text-field
            v-model.number="maxDaysAhead"
            type="number"
            min="1"
            max="365"
            :disabled="!canManage"
            :label="$t('restaurant.reservations.settings.daysAhead')"
            :hint="$t('restaurant.reservations.settings.daysAheadHint')"
            persistent-hint
            style="min-width: 220px; flex: 1"
          />
          <v-select
            v-model="minNoticeMinutes"
            :items="noticeItems"
            :disabled="!canManage"
            :label="$t('restaurant.reservations.settings.notice.label')"
            :hint="$t('restaurant.reservations.settings.noticeHint')"
            persistent-hint
            style="min-width: 220px; flex: 1"
          />
        </v-card-text>
      </v-card>
    </template>

  </v-container>
</template>
