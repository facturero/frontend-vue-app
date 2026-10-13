<script setup lang="ts">
/**
 * Alta y edición de una mesa desde la pantalla de mesas (nombre, capacidad y
 * zona). La forma, el tamaño y el giro se editan en el plano: aquí solo los
 * datos que tienen sentido sin dibujar el local.
 *
 * Es presentacional: el dueño es la vista, que llama al store y le pasa
 * `saving`/`error`. Así el diálogo no decide nada del ciclo de red.
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { DiningTable, Zone } from '@/types/restaurant';

const props = defineProps<{
  modelValue: boolean;
  table: DiningTable | null;
  zones: Zone[];
  saving?: boolean;
  error?: string | null;
}>();
const emit = defineEmits<{
  'update:modelValue': [boolean];
  submit: [{ name: string; capacityMin: number; capacityMax: number; zoneId: string | null; active: boolean }];
}>();

const { t } = useI18n();

const form = ref({ name: '', capacityMin: 2, capacityMax: 4, zoneId: null as string | null, active: true });
const localError = ref<string | null>(null);

const zoneItems = computed(() => [
  { title: t('restaurant.tables.noZone'), value: null },
  ...props.zones.map((z) => ({ title: z.name, value: z.id })),
]);

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    localError.value = null;
    const table = props.table;
    form.value = table
      ? {
          name: table.name,
          capacityMin: table.capacityMin,
          capacityMax: table.capacityMax,
          zoneId: table.zoneId,
          active: table.status === 'active',
        }
      : { name: '', capacityMin: 2, capacityMax: 4, zoneId: null, active: true };
  },
);

function submit(): void {
  localError.value = null;
  const name = form.value.name.trim();
  if (!name) {
    localError.value = t('restaurant.tableForm.nameRequired');
    return;
  }
  if (form.value.capacityMax < form.value.capacityMin) {
    localError.value = t('restaurant.tableForm.capacityInvalid');
    return;
  }
  emit('submit', {
    name,
    capacityMin: Math.max(1, Math.round(form.value.capacityMin)),
    capacityMax: Math.max(1, Math.round(form.value.capacityMax)),
    zoneId: form.value.zoneId,
    active: form.value.active,
  });
}

function close(): void {
  emit('update:modelValue', false);
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="480"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title>{{ table ? $t('restaurant.tables.editTitle') : $t('restaurant.tables.newTitle') }}</v-card-title>
      <v-card-text class="d-flex flex-column ga-3">
        <div v-if="localError || error">
          <v-alert type="error">{{ localError || error }}</v-alert>
        </div>

        <v-text-field
          v-model="form.name"
          :label="$t('restaurant.tables.name')"
          data-testid="table-name"
        />

        <div class="d-flex ga-3">
          <v-text-field
            v-model.number="form.capacityMin"
            type="number"
            min="1"
            :label="$t('restaurant.tables.capacityMin')"
          />
          <v-text-field
            v-model.number="form.capacityMax"
            type="number"
            min="1"
            :label="$t('restaurant.tables.capacityMax')"
            :hint="$t('restaurant.tableForm.capacityHint')"
            persistent-hint
          />
        </div>

        <v-select v-model="form.zoneId" :items="zoneItems" :label="$t('restaurant.tables.zone')" />

        <v-switch v-if="table" v-model="form.active" :label="$t('restaurant.tables.active')" color="primary" />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">{{ $t('common.cancel') }}</v-btn>
        <v-btn color="primary" variant="flat" :loading="saving" data-testid="table-save" @click="submit">
          {{ $t('common.save') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
