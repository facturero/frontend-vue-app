<script setup lang="ts">
/**
 * Horarios del local.
 *
 * Tres bloques: turnos por día de la semana, ajustes (cada cuánto se ofrece
 * mesa, margen de limpieza, zona horaria y duración según el tamaño del grupo) y
 * excepciones de fechas sueltas. La vista previa es la comprobación real: enseña
 * los turnos que verá el cliente al reservar.
 *
 * Los turnos se editan en local y se mandan enteros al guardar: el servicio
 * sustituye todos los turnos de una vez y valida que no se solapen.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useRestaurantEstablishment } from '@/composable/useRestaurantEstablishment';
import type { PartyDuration, ScheduleException, ShiftInput } from '@/types/restaurant';
import PageHeader from '@/components/ui/PageHeader.vue';
import RestaurantTabs from '@/components/restaurant/RestaurantTabs.vue';
import EstablishmentSelect from '@/components/restaurant/EstablishmentSelect.vue';

const { t } = useI18n();
const { restaurant, ready, establishmentId, showSelector, hasEstablishments, bootstrap } = useRestaurantEstablishment();
const auth = useAuthStore();

const canManage = computed(() => auth.can('restaurant:manage'));

const loadError = ref<string | null>(null);
const saveError = ref<string | null>(null);
const snackbar = ref<string | null>(null);

/** Lunes primero, como se lee un horario; el domingo (0) va al final. */
const weekdays = [1, 2, 3, 4, 5, 6, 0];
const slotOptions = [5, 10, 15, 20, 30, 60];
const timezones = [
  'America/Guayaquil',
  'America/Bogota',
  'America/Lima',
  'America/Mexico_City',
  'America/New_York',
  'America/Panama',
  'Europe/Madrid',
];

const shifts = ref<ShiftInput[]>([]);
const timezone = ref('America/Guayaquil');
const slotMinutes = ref(30);
const cleanupMinutes = ref(15);
const durations = ref<PartyDuration[]>([]);
const exceptionDialog = ref(false);
const exceptionForm = ref({ onDate: '', kind: 'closed' as 'closed' | 'special_hours', opensAt: '12:00', closesAt: '15:00', reason: '' });
const exceptionError = ref<string | null>(null);
const previewDate = ref(new Date().toISOString().slice(0, 10));

const schedule = computed(() => restaurant.schedule);
const exceptions = computed(() => [...(schedule.value?.exceptions ?? [])].sort((a, b) => a.onDate.localeCompare(b.onDate)));

const dirty = computed(() => {
  const view = schedule.value;
  if (!view) return false;
  const current = JSON.stringify({
    shifts: shifts.value,
    timezone: timezone.value,
    slotMinutes: slotMinutes.value,
    cleanupMinutes: cleanupMinutes.value,
    durations: durations.value,
  });
  const saved = JSON.stringify({
    shifts: view.shifts.map((s) => ({ weekday: s.weekday, opensAt: s.opensAt, closesAt: s.closesAt, label: s.label })),
    timezone: view.schedule.timezone,
    slotMinutes: view.schedule.slotMinutes,
    cleanupMinutes: view.schedule.cleanupMinutes,
    durations: view.schedule.durationByPartySize,
  });
  return current !== saved;
});

function syncFromStore(): void {
  const view = schedule.value;
  if (!view) return;
  shifts.value = view.shifts.map((s) => ({ weekday: s.weekday, opensAt: s.opensAt, closesAt: s.closesAt, label: s.label }));
  timezone.value = view.schedule.timezone;
  slotMinutes.value = view.schedule.slotMinutes;
  cleanupMinutes.value = view.schedule.cleanupMinutes;
  durations.value = view.schedule.durationByPartySize.map((d) => ({ ...d }));
}

async function load(): Promise<void> {
  loadError.value = null;
  await bootstrap();
  if (!establishmentId.value) return;
  try {
    if (canManage.value) await restaurant.setup(establishmentId.value);
    await restaurant.fetchSchedule(establishmentId.value);
    syncFromStore();
  } catch {
    loadError.value = restaurant.error;
  }
}

async function onEstablishmentChange(id: string): Promise<void> {
  restaurant.selectEstablishment(id);
  await load();
}

onMounted(load);

function shiftsFor(weekday: number): ShiftInput[] {
  return shifts.value.filter((s) => s.weekday === weekday);
}

function addShift(weekday: number): void {
  shifts.value = [...shifts.value, { weekday, opensAt: '12:00', closesAt: '15:00', label: null }];
}

function removeShift(shift: ShiftInput): void {
  shifts.value = shifts.value.filter((s) => s !== shift);
}

/** Copia los turnos de ese día a los otros seis: ahorra repetir el mismo horario. */
function copyToAll(weekday: number): void {
  const source = shiftsFor(weekday).map((s) => ({ opensAt: s.opensAt, closesAt: s.closesAt, label: s.label ?? null }));
  if (source.length === 0) return;
  const others = shifts.value.filter((s) => s.weekday !== weekday);
  shifts.value = [...others, ...weekdays.flatMap((day) => source.map((s) => ({ weekday: day, ...s })))];
  snackbar.value = t('restaurant.schedule.copyDone');
}

function addDuration(): void {
  const lastNumeric = [...durations.value].reverse().find((d) => d.upTo !== null);
  const nextUpTo = (lastNumeric?.upTo ?? 0) + 2;
  const lastMinutes = durations.value[durations.value.length - 1]?.minutes ?? 60;
  durations.value = [
    ...durations.value.filter((d) => d.upTo !== null),
    { upTo: nextUpTo, minutes: lastMinutes },
    { upTo: null, minutes: lastMinutes + 30 },
  ];
}

function removeDuration(index: number): void {
  durations.value = durations.value.filter((_, i) => i !== index);
}

async function save(): Promise<void> {
  if (!establishmentId.value) return;
  saveError.value = null;
  try {
    await restaurant.saveSchedule(establishmentId.value, {
      timezone: timezone.value,
      slotMinutes: slotMinutes.value,
      cleanupMinutes: cleanupMinutes.value,
      durationByPartySize: durations.value,
      shifts: shifts.value,
    });
    syncFromStore();
    snackbar.value = t('restaurant.schedule.saved');
  } catch {
    saveError.value = restaurant.error;
  }
}

// ── Excepciones ──────────────────────────────────────────────────────────────

function openException(): void {
  exceptionError.value = null;
  exceptionForm.value = { onDate: new Date().toISOString().slice(0, 10), kind: 'closed', opensAt: '12:00', closesAt: '15:00', reason: '' };
  exceptionDialog.value = true;
}

async function submitException(): Promise<void> {
  exceptionError.value = null;
  if (!establishmentId.value) return;
  if (!exceptionForm.value.onDate) {
    exceptionError.value = t('common.date');
    return;
  }
  try {
    await restaurant.addException(establishmentId.value, {
      onDate: exceptionForm.value.onDate,
      kind: exceptionForm.value.kind,
      opensAt: exceptionForm.value.kind === 'special_hours' ? exceptionForm.value.opensAt : null,
      closesAt: exceptionForm.value.kind === 'special_hours' ? exceptionForm.value.closesAt : null,
      reason: exceptionForm.value.reason || null,
    });
    exceptionDialog.value = false;
    snackbar.value = t('restaurant.schedule.created');
  } catch {
    exceptionError.value = restaurant.error;
  }
}

async function removeException(exception: ScheduleException): Promise<void> {
  try {
    await restaurant.removeException(exception.id);
    snackbar.value = t('restaurant.schedule.removed');
  } catch {
    snackbar.value = restaurant.error ?? t('restaurant.schedule.saveError');
  }
}

function exceptionLabel(exception: ScheduleException): string {
  if (exception.kind === 'closed') return t('restaurant.schedule.kindClosed');
  return `${t('restaurant.schedule.kindSpecial')} · ${exception.opensAt ?? ''}–${exception.closesAt ?? ''}`;
}

// ── Vista previa ─────────────────────────────────────────────────────────────

async function runPreview(): Promise<void> {
  if (!establishmentId.value || !previewDate.value) return;
  try {
    await restaurant.previewSlots(establishmentId.value, previewDate.value);
  } catch {
    saveError.value = restaurant.error;
  }
}

/** `startsAt` viene con la hora local del local en el ISO: se muestra tal cual. */
function slotTime(startsAt: string): string {
  const match = startsAt.match(/T(\d{2}:\d{2})/);
  return match ? match[1]! : startsAt;
}

onMounted(runPreview);
</script>

<template>
  <v-container>
    <PageHeader :title="$t('restaurant.schedule.title')" :subtitle="$t('restaurant.schedule.intro')">
      <template #actions>
        <v-chip v-if="dirty" color="lightwarning" variant="flat">{{ $t('restaurant.plan.dirty') }}</v-chip>
        <v-btn v-if="canManage" color="primary" prepend-icon="mdi-content-save" :loading="restaurant.saving" @click="save">
          {{ $t('restaurant.schedule.save') }}
        </v-btn>
      </template>
    </PageHeader>

    <RestaurantTabs />

    <EstablishmentSelect v-if="showSelector" :model-value="establishmentId" @update:model-value="onEstablishmentChange" />

    <v-alert v-if="loadError" type="error" closable class="mb-4" @click:close="loadError = null">{{ loadError }}</v-alert>
    <v-alert v-else-if="ready && !hasEstablishments" type="info" class="mb-4">
      {{ $t('restaurant.noEstablishment') }}
    </v-alert>
    <v-alert v-if="saveError" type="error" closable class="mb-4" @click:close="saveError = null">{{ saveError }}</v-alert>

    <v-skeleton-loader v-if="!ready" type="article" />

    <template v-else-if="schedule">
      <v-card class="mb-4">
        <v-card-title>{{ $t('restaurant.schedule.shifts') }}</v-card-title>
        <v-card-subtitle>{{ $t('restaurant.schedule.shiftsIntro') }}</v-card-subtitle>
        <v-card-text>
          <div v-for="weekday in weekdays" :key="weekday" class="mb-4">
            <div class="d-flex align-center ga-2 mb-1">
              <span class="text-subtitle-2">{{ $t(`restaurant.schedule.weekdays.${weekday}`) }}</span>
              <v-btn
                v-if="canManage && shiftsFor(weekday).length"
                size="x-small"
                variant="text"
                :title="$t('restaurant.schedule.copyToAll')"
                @click="copyToAll(weekday)"
              >
                {{ $t('restaurant.schedule.copyToAll') }}
              </v-btn>
            </div>

            <div v-if="!shiftsFor(weekday).length" class="text-body-2 text-medium-emphasis">
              {{ $t('restaurant.schedule.noShifts') }}
            </div>

            <div v-for="shift in shiftsFor(weekday)" :key="weekday + shift.opensAt + shift.closesAt" class="d-flex align-center ga-2 mb-2 flex-wrap">
              <v-text-field
                v-model="shift.opensAt"
                type="time"
                :label="$t('restaurant.schedule.opensAt')"
                style="max-width: 140px"
                :disabled="!canManage"
              />
              <v-text-field
                v-model="shift.closesAt"
                type="time"
                :label="$t('restaurant.schedule.closesAt')"
                style="max-width: 140px"
                :disabled="!canManage"
              />
              <v-text-field
                v-model="shift.label"
                :label="$t('restaurant.schedule.label')"
                :placeholder="$t('restaurant.schedule.labelPlaceholder')"
                style="max-width: 200px"
                :disabled="!canManage"
              />
              <v-btn
                v-if="canManage"
                size="small"
                variant="text"
                icon="mdi-close"
                :title="$t('restaurant.schedule.removeShift')"
                @click="removeShift(shift)"
              />
            </div>

            <v-btn v-if="canManage" size="small" variant="tonal" prepend-icon="mdi-plus" @click="addShift(weekday)">
              {{ $t('restaurant.schedule.addShift') }}
            </v-btn>
          </div>
        </v-card-text>
      </v-card>

      <v-card class="mb-4">
        <v-card-title>{{ $t('restaurant.schedule.settings') }}</v-card-title>
        <v-card-text class="d-flex flex-wrap ga-4">
          <v-select
            v-model="slotMinutes"
            :items="slotOptions"
            :label="$t('restaurant.schedule.slotMinutes')"
            :suffix="$t('restaurant.schedule.minutes')"
            style="max-width: 220px"
            :disabled="!canManage"
          />
          <v-text-field
            v-model.number="cleanupMinutes"
            type="number"
            min="0"
            max="120"
            :label="$t('restaurant.schedule.cleanupMinutes')"
            :suffix="$t('restaurant.schedule.minutes')"
            style="max-width: 200px"
            :disabled="!canManage"
          />
          <v-select
            v-model="timezone"
            :items="timezones"
            :label="$t('restaurant.schedule.timezone')"
            style="max-width: 280px"
            :disabled="!canManage"
          />
        </v-card-text>

        <v-card-title class="pt-0">{{ $t('restaurant.schedule.durations') }}</v-card-title>
        <v-card-subtitle>{{ $t('restaurant.schedule.durationsIntro') }}</v-card-subtitle>
        <v-card-text>
          <div v-for="(duration, index) in durations" :key="index" class="d-flex align-center ga-2 mb-2 flex-wrap">
            <span v-if="duration.upTo === null" class="text-body-2">{{ $t('restaurant.schedule.upToMax') }}</span>
            <template v-else>
              <span class="text-body-2">{{ $t('restaurant.schedule.upTo') }}</span>
              <v-text-field
                v-model.number="duration.upTo"
                type="number"
                min="1"
                style="max-width: 110px"
                :disabled="!canManage"
              />
              <span class="text-body-2">{{ $t('restaurant.schedule.people') }}</span>
            </template>
            <v-text-field
              v-model.number="duration.minutes"
              type="number"
              min="1"
              max="1440"
              :suffix="$t('restaurant.schedule.durationMinutes')"
              style="max-width: 160px"
              :disabled="!canManage"
            />
            <v-btn
              v-if="canManage && duration.upTo !== null"
              size="small"
              variant="text"
              icon="mdi-close"
              :title="$t('restaurant.schedule.removeDuration')"
              @click="removeDuration(index)"
            />
          </div>
          <v-btn v-if="canManage" size="small" variant="tonal" prepend-icon="mdi-plus" @click="addDuration">
            {{ $t('restaurant.schedule.addDuration') }}
          </v-btn>
        </v-card-text>
      </v-card>

      <v-card class="mb-4">
        <v-card-title>{{ $t('restaurant.schedule.exceptions') }}</v-card-title>
        <v-card-subtitle>{{ $t('restaurant.schedule.exceptionsIntro') }}</v-card-subtitle>
        <v-card-text>
          <div v-if="!exceptions.length" class="text-body-2 text-medium-emphasis mb-3">
            {{ $t('restaurant.schedule.noExceptions') }}
          </div>
          <div v-for="exception in exceptions" :key="exception.id" class="d-flex align-center ga-3 mb-2">
            <span class="font-weight-medium">{{ exception.onDate }}</span>
            <v-chip size="x-small" variant="flat" :color="exception.kind === 'closed' ? 'lighterror' : 'lightinfo'">
              {{ exceptionLabel(exception) }}
            </v-chip>
            <span v-if="exception.reason" class="text-body-2 text-medium-emphasis">{{ exception.reason }}</span>
            <v-spacer />
            <v-btn
              v-if="canManage"
              size="small"
              variant="text"
              icon="mdi-trash-can-outline"
              :title="$t('restaurant.schedule.removeException')"
              @click="removeException(exception)"
            />
          </div>
          <v-btn v-if="canManage" size="small" variant="tonal" prepend-icon="mdi-calendar-plus" @click="openException">
            {{ $t('restaurant.schedule.addException') }}
          </v-btn>
        </v-card-text>
      </v-card>

      <v-card>
        <v-card-title>{{ $t('restaurant.schedule.preview') }}</v-card-title>
        <v-card-subtitle>{{ $t('restaurant.schedule.previewIntro') }}</v-card-subtitle>
        <v-card-text>
          <div class="d-flex align-center ga-2 mb-4 flex-wrap">
            <v-text-field
              v-model="previewDate"
              type="date"
              :label="$t('restaurant.schedule.previewDate')"
              style="max-width: 220px"
            />
            <v-btn variant="tonal" prepend-icon="mdi-eye-outline" @click="runPreview">
              {{ $t('restaurant.schedule.preview') }}
            </v-btn>
          </div>

          <div v-if="restaurant.preview">
            <v-alert v-if="!restaurant.preview.slots.length" type="info">
              {{ $t('restaurant.schedule.previewEmpty') }}
            </v-alert>
            <template v-else>
              <div class="text-body-2 text-medium-emphasis mb-2">
                {{ $t('restaurant.schedule.previewCount', { count: restaurant.preview.slots.length }) }}
              </div>
              <div class="d-flex flex-wrap ga-2">
                <v-chip
                  v-for="slot in restaurant.preview.slots"
                  :key="slot.startsAt"
                  variant="flat"
                  color="lightprimary"
                >
                  {{ slotTime(slot.startsAt) }}
                  <span v-if="slot.shiftLabel" class="ml-2 text-medium-emphasis">{{ slot.shiftLabel }}</span>
                </v-chip>
              </div>
            </template>
          </div>
        </v-card-text>
      </v-card>
    </template>

    <v-dialog v-model="exceptionDialog" max-width="520" persistent>
      <v-card>
        <v-card-title>{{ $t('restaurant.schedule.addException') }}</v-card-title>
        <v-card-text class="d-flex flex-column ga-3">
          <div v-if="exceptionError"><v-alert type="error">{{ exceptionError }}</v-alert></div>
          <v-text-field v-model="exceptionForm.onDate" type="date" :label="$t('restaurant.schedule.exceptionDate')" />
          <v-select
            v-model="exceptionForm.kind"
            :items="[
              { title: $t('restaurant.schedule.kindClosed'), value: 'closed' },
              { title: $t('restaurant.schedule.kindSpecial'), value: 'special_hours' },
            ]"
            :label="$t('restaurant.schedule.exceptionKind')"
          />
          <div v-if="exceptionForm.kind === 'special_hours'" class="d-flex ga-3">
            <v-text-field v-model="exceptionForm.opensAt" type="time" :label="$t('restaurant.schedule.opensAt')" />
            <v-text-field v-model="exceptionForm.closesAt" type="time" :label="$t('restaurant.schedule.closesAt')" />
          </div>
          <v-text-field
            v-model="exceptionForm.reason"
            :label="$t('restaurant.schedule.reason')"
            :placeholder="$t('restaurant.schedule.reasonPlaceholder')"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="exceptionDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="flat" :loading="restaurant.saving" @click="submitException">
            {{ $t('common.save') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar :model-value="snackbar !== null" color="success" @update:model-value="snackbar = null">{{ snackbar }}</v-snackbar>
  </v-container>
</template>
