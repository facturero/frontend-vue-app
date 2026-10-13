<script setup lang="ts">
/**
 * «¿Cuántas mesas tienes?»: crea N mesas de una vez continuando la numeración
 * existente. Es la primera pantalla para quien llega sin nada montado, así que
 * pide lo mínimo (cuántas y de cuántos comensales) y deja renombrar después.
 *
 * Presentacional: la vista ejecuta `bulkCreateTables` y le pasa `saving`/`error`.
 */
import { ref, watch } from 'vue';

const props = defineProps<{
  modelValue: boolean;
  saving?: boolean;
  error?: string | null;
  /** Rótulo de numeración existente, para el texto de ayuda. */
  prefix?: string;
}>();
const emit = defineEmits<{
  'update:modelValue': [boolean];
  submit: [{ count: number; capacityMin: number; capacityMax: number; prefix: string }];
}>();

const form = ref({ count: 10, capacityMin: 2, capacityMax: 4, prefix: 'Mesa' });

watch(
  () => props.modelValue,
  (open) => {
    if (open) form.value = { count: 10, capacityMin: 2, capacityMax: 4, prefix: props.prefix ?? 'Mesa' };
  },
);

function submit(): void {
  emit('submit', {
    count: Math.max(1, Math.min(100, Math.round(form.value.count))),
    capacityMin: Math.max(1, Math.round(form.value.capacityMin)),
    capacityMax: Math.max(1, Math.round(form.value.capacityMax)),
    prefix: form.value.prefix.trim() || 'Mesa',
  });
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
      <v-card-title>{{ $t('restaurant.bulk.title') }}</v-card-title>
      <v-card-text class="d-flex flex-column ga-3">
        <p class="text-body-2 text-medium-emphasis">{{ $t('restaurant.bulk.intro') }}</p>

        <div v-if="error"><v-alert type="error">{{ error }}</v-alert></div>

        <v-text-field
          v-model.number="form.count"
          type="number"
          min="1"
          max="100"
          :label="$t('restaurant.bulk.count')"
          data-testid="bulk-count"
        />

        <div class="d-flex ga-3">
          <v-text-field
            v-model.number="form.capacityMin"
            type="number"
            min="1"
            :label="$t('restaurant.bulk.capacityMin')"
          />
          <v-text-field
            v-model.number="form.capacityMax"
            type="number"
            min="1"
            :label="$t('restaurant.bulk.capacityMax')"
          />
        </div>

        <v-text-field
          v-model="form.prefix"
          :label="$t('restaurant.bulk.prefix')"
          :hint="$t('restaurant.bulk.prefixHint')"
          persistent-hint
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">{{ $t('common.cancel') }}</v-btn>
        <v-btn color="primary" variant="flat" :loading="saving" data-testid="bulk-save" @click="submit">
          {{ $t('restaurant.bulk.confirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
