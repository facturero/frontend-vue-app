<script setup lang="ts">
/**
 * Anotar una reserva (por teléfono o en persona).
 *
 * Elige fecha y cantidad de personas y el servidor dice qué horas hay (las mismas reglas con que reserva el cliente, pero sin
 * tope de días ni antelación mínima). Las mesas las elige el sistema —la más ajustada, o varias para un grupo grande—; quien
 * recibe la llamada solo las elige a mano si quiere sentar al grupo en un sitio concreto.
 */
import { computed, ref, watch } from 'vue';
import DateField from '@/components/ui/DateField.vue';
import { useI18n } from 'vue-i18n';
import { useReservationsStore } from '@/stores/reservations';
import type { DiningTable } from '@/types/restaurant';

const props = defineProps<{
  modelValue: boolean;
  establishmentId: string;
  initialDate: string;
  tables: DiningTable[];
}>();
const emit = defineEmits<{ 'update:modelValue': [boolean]; created: [] }>();

const { t } = useI18n();
const store = useReservationsStore();

const date = ref(props.initialDate);
const partySize = ref(2);
const time = ref<string | null>(null);
const guestName = ref('');
const guestPhone = ref('');
const guestEmail = ref('');
const notes = ref('');
const manual = ref(false);
const tableIds = ref<string[]>([]);
const error = ref<string | null>(null);

const availability = computed(() => store.availability);
const slots = computed(() => availability.value?.slots ?? []);
const dayStatus = computed(() => availability.value?.status ?? null);

/** Con mesas elegidas a mano, «no hay mesa libre» deja de ser un obstáculo: el servidor comprueba las elegidas. */
function selectable(slot: { available: boolean; reason?: string }): boolean {
  return slot.available || (manual.value && slot.reason === 'full');
}

const activeTables = computed(() =>
  props.tables
    .filter((tb) => tb.status === 'active')
    .map((tb) => ({ title: `${tb.name} (${tb.capacityMin}–${tb.capacityMax})`, value: tb.id })),
);

const canSubmit = computed(
  () =>
    time.value !== null &&
    partySize.value >= 1 &&
    guestName.value.trim().length >= 2 &&
    guestPhone.value.trim().length >= 7 &&
    (!manual.value || tableIds.value.length > 0),
);

let timer: ReturnType<typeof setTimeout> | undefined;
async function refreshAvailability(): Promise<void> {
  if (!date.value || !(partySize.value >= 1)) return;
  try {
    await store.fetchAvailability(props.establishmentId, date.value, partySize.value);
  } catch {
    error.value = store.error;
  }
  const current = slots.value.find((s) => s.time === time.value);
  if (!current || !selectable(current)) time.value = null;
}

watch([date, partySize], () => {
  clearTimeout(timer);
  timer = setTimeout(refreshAvailability, 250);
});
watch(manual, refreshAvailability);

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    date.value = props.initialDate;
    partySize.value = 2;
    time.value = null;
    guestName.value = '';
    guestPhone.value = '';
    guestEmail.value = '';
    notes.value = '';
    manual.value = false;
    tableIds.value = [];
    error.value = null;
    void refreshAvailability();
  },
);

async function submit(): Promise<void> {
  if (!canSubmit.value || !time.value) return;
  error.value = null;
  try {
    await store.create(props.establishmentId, {
      date: date.value,
      time: time.value,
      partySize: partySize.value,
      guestName: guestName.value.trim(),
      guestPhone: guestPhone.value.trim(),
      guestEmail: guestEmail.value.trim() || null,
      notes: notes.value.trim() || null,
      tableIds: manual.value ? tableIds.value : undefined,
    });
    emit('created');
    emit('update:modelValue', false);
  } catch {
    error.value = store.error;
    // Si justo se ocupó la hora, la lista de horas ya no es la que se mostraba.
    void refreshAvailability();
  }
}

function slotHint(slot: { reason?: string }): string {
  return slot.reason === 'notice' ? t('restaurant.reservations.dialog.slotPast') : t('restaurant.reservations.dialog.slotFull');
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="640" persistent @update:model-value="emit('update:modelValue', $event)">
    <v-card>
      <v-card-title>{{ $t('restaurant.reservations.dialog.title') }}</v-card-title>
      <v-card-text class="d-flex flex-column ga-4">
        <div v-if="error"><v-alert type="error">{{ error }}</v-alert></div>

        <div class="d-flex flex-wrap ga-4">
          <DateField v-model="date" :label="$t('restaurant.reservations.dialog.date')" style="max-width: 200px" data-testid="resv-date" />
          <v-text-field
            v-model.number="partySize"
            type="number"
            min="1"
            :label="$t('restaurant.reservations.dialog.partySize')"
            style="max-width: 160px"
            data-testid="resv-party"
          />
        </div>

        <div>
          <div class="text-body-medium text-medium-emphasis mb-2">{{ $t('restaurant.reservations.dialog.time') }}</div>
          <v-progress-linear v-if="store.loading" indeterminate />
          <v-alert v-else-if="dayStatus === 'closed'" type="info">{{ $t('restaurant.reservations.dialog.closed') }}</v-alert>
          <v-alert v-else-if="dayStatus === 'past'" type="info">{{ $t('restaurant.reservations.dialog.past') }}</v-alert>
          <div v-else class="d-flex flex-wrap ga-2" data-testid="resv-slots">
            <v-chip
              v-for="slot in slots"
              :key="slot.time"
              :variant="time === slot.time ? 'flat' : 'tonal'"
              :color="time === slot.time ? 'primary' : undefined"
              :disabled="!selectable(slot)"
              :title="selectable(slot) ? undefined : slotHint(slot)"
              @click="time = slot.time"
            >
              {{ slot.time }}
              <span v-if="slot.shiftLabel" class="ml-2 text-medium-emphasis">{{ slot.shiftLabel }}</span>
            </v-chip>
          </div>
          <div v-if="dayStatus === 'open' && slots.length && !slots.some((s) => selectable(s))" class="text-body-medium text-medium-emphasis mt-2">
            {{ $t('restaurant.reservations.dialog.noSlots') }}
          </div>
        </div>

        <div class="d-flex flex-wrap ga-4">
          <v-text-field v-model="guestName" :label="$t('restaurant.reservations.dialog.guestName')" style="min-width: 240px; flex: 1" data-testid="resv-name" />
          <v-text-field v-model="guestPhone" type="tel" :label="$t('restaurant.reservations.dialog.guestPhone')" style="min-width: 200px; flex: 1" data-testid="resv-phone" />
        </div>
        <v-text-field
          v-model="guestEmail"
          type="email"
          :label="$t('restaurant.reservations.dialog.guestEmail')"
          :hint="$t('restaurant.reservations.dialog.guestEmailHint')"
          persistent-hint
        />
        <v-textarea v-model="notes" rows="2" auto-grow :label="$t('restaurant.reservations.dialog.notes')" />

        <div>
          <v-switch v-model="manual" :label="$t('restaurant.reservations.dialog.manualTables')" :hint="$t('restaurant.reservations.dialog.manualTablesHint')" persistent-hint />
          <v-select
            v-if="manual"
            v-model="tableIds"
            :items="activeTables"
            multiple
            chips
            closable-chips
            :label="$t('restaurant.reservations.dialog.tables')"
            class="mt-2"
          />
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">{{ $t('common.cancel') }}</v-btn>
        <v-btn color="primary" variant="flat" :disabled="!canSubmit" :loading="store.saving" data-testid="resv-submit" @click="submit">
          {{ $t('restaurant.reservations.dialog.save') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
