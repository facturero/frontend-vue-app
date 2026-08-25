<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useEmployeeStore } from '@/stores/employees';
import { useOrganizationStore } from '@/stores/organization';
import { extractError } from '@/utils/error';
import RoleSelect from '@/components/RoleSelect.vue';

defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const emp = useEmployeeStore();
const org = useOrganizationStore();
const email = ref('');
const roleIds = ref<string[]>([]);
const establishmentIds = ref<string[]>([]);
const error = ref<string | null>(null);
const inviting = ref(false);
const success = ref(false);

const establishmentOptions = computed(() =>
  org.establishments.map((e) => ({ title: `${e.code} — ${e.name}`, value: e.id })),
);

onMounted(async () => {
  if (org.establishments.length === 0) {
    await org.fetchEstablishments();
  }
});

function close(): void {
  email.value = '';
  roleIds.value = [];
  establishmentIds.value = [];
  error.value = null;
  inviting.value = false;
  success.value = false;
  emit('update:modelValue', false);
}

async function submit(): Promise<void> {
  if (!email.value || roleIds.value.length === 0) return;
  inviting.value = true;
  error.value = null;
  try {
    await emp.invite(email.value, roleIds.value, establishmentIds.value);
    await emp.fetch();
    success.value = true;
    setTimeout(() => {
      success.value = false;
      close();
    }, 1500);
  } catch (e) {
    error.value = extractError(e);
  } finally {
    inviting.value = false;
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="500"
    @update:model-value="(v) => { if (!v) close(); }"
  >
    <v-card elevation="2" rounded="lg">
      <v-card-title>Invitar empleado</v-card-title>
      <v-card-text>
        <v-alert
          v-if="error"
          type="error"
          density="compact"
          variant="tonal"
          closable
          class="mb-4"
          @click:close="error = null"
        >
          {{ error }}
        </v-alert>

        <v-alert
          v-if="success"
          type="success"
          density="compact"
          variant="tonal"
          class="mb-4"
        >
          Empleado invitado exitosamente
        </v-alert>

        <v-text-field
          v-model="email"
          label="Correo electrónico"
          type="email"
          variant="outlined"
          density="compact"
          class="mb-4"
          hide-details="auto"
        />

        <RoleSelect
          v-model="roleIds"
          label="Roles"
          multiple
          hide-admin
        />

        <v-select
          v-model="establishmentIds"
          :items="establishmentOptions"
          label="Establecimientos"
          variant="outlined"
          density="compact"
          multiple
          class="mt-2"
          hide-details="auto"
          data-testid="invite-employee-establishments"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancelar</v-btn>
        <v-btn
          color="primary"
          variant="tonal"
          :loading="inviting"
          :disabled="!email || roleIds.length === 0"
          @click="submit"
        >
          Enviar invitación
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
