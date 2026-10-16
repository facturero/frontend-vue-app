<script setup lang="ts">
/**
 * Alta de la contabilidad: se muestra en lugar del contenido mientras la organización no la haya configurado. Quien no tiene
 * `account:manage` solo ve el aviso de que debe pedirlo a un administrador.
 */
import { computed, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useAccountingStore } from '@/stores/accounting';

const emit = defineEmits<{ done: [] }>();

const auth = useAuthStore();
const store = useAccountingStore();

const canManage = computed(() => auth.can('account:manage'));
const template = ref<'ec-supercias' | 'empty'>('ec-supercias');
const fiscalYear = ref(new Date().getFullYear());
const error = ref<string | null>(null);

async function submit(): Promise<void> {
  error.value = null;
  try {
    await store.setup({ chartTemplate: template.value, fiscalYear: fiscalYear.value });
    emit('done');
  } catch {
    error.value = store.error;
  }
}
</script>

<template>
  <v-card>
    <v-card-title>{{ $t('accounting.setup.title') }}</v-card-title>
    <v-card-text class="d-flex flex-column ga-4">
      <p class="text-body-2 text-medium-emphasis">{{ $t('accounting.setup.intro') }}</p>
      <v-alert v-if="!canManage" type="info">{{ $t('accounting.setup.needAdmin') }}</v-alert>
      <template v-else>
        <v-alert v-if="error" type="error" closable @click:close="error = null">{{ error }}</v-alert>
        <v-radio-group v-model="template" :label="$t('accounting.setup.chart')" hide-details>
          <v-radio value="ec-supercias" :label="$t('accounting.setup.chartEc')" />
          <v-radio value="empty" :label="$t('accounting.setup.chartEmpty')" />
        </v-radio-group>
        <v-text-field v-model.number="fiscalYear" type="number" :label="$t('accounting.setup.fiscalYear')" :hint="$t('accounting.setup.fiscalYearHint')" persistent-hint />
      </template>
    </v-card-text>
    <v-card-actions v-if="canManage">
      <v-spacer />
      <v-btn color="primary" :loading="store.saving" @click="submit">{{ $t('accounting.setup.start') }}</v-btn>
    </v-card-actions>
  </v-card>
</template>
