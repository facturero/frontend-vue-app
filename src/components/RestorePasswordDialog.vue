<script setup lang="ts">
import { ref, watch } from 'vue';
import { useEmployeeStore } from '@/stores/employees';
import { extractError } from '@/utils/error';
import type { EmployeeSummary } from '@/types/employees';

const props = defineProps<{ modelValue: boolean; employee: EmployeeSummary | null }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [] }>();

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
      <v-card-title>Restaurar contraseña</v-card-title>
      <v-card-text>
        <p v-if="employee" class="text-body-2 text-medium-emphasis mb-3">
          Se enviará un correo a
          <strong>{{ employee.email }}</strong>
          con un enlace de un solo uso para que
          <strong>{{ employee.fullName || employee.username || 'el empleado' }}</strong>
          restablezca su contraseña.
        </p>

        <v-alert
          v-if="sent"
          type="success"
          density="compact"
          variant="tonal"
          class="mb-3"
          text="Correo enviado. El enlace caduca en 2 horas."
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
        <v-btn variant="text" @click="close">{{ sent ? 'Cerrar' : 'Cancelar' }}</v-btn>
        <v-btn
          v-if="!sent"
          color="primary"
          variant="tonal"
          :loading="sending"
          :disabled="!employee"
          prepend-icon="mdi-email-fast-outline"
          @click="submit"
        >
          Enviar correo
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
