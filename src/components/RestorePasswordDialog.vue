<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useEmployeeStore } from '@/stores/employees';
import { extractError } from '@/utils/error';
import type { EmployeeSummary } from '@/types/employees';

const props = defineProps<{ modelValue: boolean; employee: EmployeeSummary | null }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [] }>();

const { t } = useI18n();
const emp = useEmployeeStore();
const sending = ref(false);
const error = ref<string | null>(null);
const sent = ref(false);

watch(() => props.modelValue, (open) => {
  if (open) {
    error.value = null;
    sent.value = false;
  }
});

function close(): void {
  emit('update:modelValue', false);
}

async function submit(): Promise<void> {
  if (!props.employee) return;
  sending.value = true;
  error.value = null;
  try {
    await emp.requestPasswordReset(props.employee.id);
    sent.value = true;
    emit('saved');
  } catch (e) {
    error.value = extractError(e);
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="440"
    @update:model-value="(v) => { if (!v) close(); }"
  >
    <v-card elevation="2" rounded="lg">
      <v-card-title>{{ $t('employees.restorePassword') }}</v-card-title>
      <v-card-text>
        <i18n-t v-if="employee" keypath="employees.restoreIntro" tag="p"
          class="text-body-2 text-medium-emphasis mb-3">
          <template #email><strong>{{ employee.email }}</strong></template>
          <template #name>
            <strong>{{ employee.fullName || employee.username || $t('employees.theEmployee') }}</strong>
          </template>
        </i18n-t>

        <v-alert
          v-if="sent"
          type="success"
          density="compact"
          variant="tonal"
          class="mb-3"
          :text="$t('employees.restoreSent')"
        />

        <v-alert
          v-if="error"
          type="error"
          density="compact"
          variant="tonal"
          closable
          class="mb-3"
          @click:close="error = null"
        >
          {{ error }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">{{ sent ? $t('common.close') : $t('common.cancel') }}</v-btn>
        <v-btn
          v-if="!sent"
          color="primary"
          variant="tonal"
          :loading="sending"
          :disabled="!employee"
          prepend-icon="mdi-email-fast-outline"
          @click="submit"
        >
          {{ $t('employees.sendEmail') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
