<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useOrganizationStore } from '@/stores/organization';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  created: [establishmentId: string];
}>();

const { t } = useI18n();
const orgStore = useOrganizationStore();

const quickEstablishmentName = ref('');
const establishmentDialogError = ref('');
const establishmentDialogSaving = ref(false);

function close(): void {
  emit('update:modelValue', false);
}

async function submit(): Promise<void> {
  if (!quickEstablishmentName.value) return;
  establishmentDialogError.value = '';
  establishmentDialogSaving.value = true;
  try {
    const est = await orgStore.createEstablishment({ name: quickEstablishmentName.value });
    await orgStore.createEmissionPoint(est.id, { name: 'Principal' });
    close();
    emit('created', est.id);
  } catch (e: any) {
    establishmentDialogError.value = e?.response?.data?.message || e.message || t('common.createError');
  } finally {
    establishmentDialogSaving.value = false;
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="420"
    @update:model-value="(v) => { if (!v) close(); }"
  >
    <v-card>
      <v-card-title>{{ $t('invoices.createEstablishment') }}</v-card-title>
      <v-card-text>
        <v-alert v-if="establishmentDialogError" type="error" class="mb-4">
          {{ establishmentDialogError }}
        </v-alert>
        <p class="text-caption text-medium-emphasis mb-3">
          {{ $t('invoices.createEstablishmentHint') }}
        </p>
        <v-text-field
          v-model="quickEstablishmentName"
          :label="$t('invoices.establishmentName')"
          :placeholder="$t('invoices.establishmentPlaceholder')"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">{{ $t('common.cancel') }}</v-btn>
        <v-btn color="primary" :loading="establishmentDialogSaving" :disabled="!quickEstablishmentName" @click="submit">
          {{ $t('common.create') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>