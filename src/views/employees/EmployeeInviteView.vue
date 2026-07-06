<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useEmployeeStore } from '@/stores/employees';
import { useRoleStore } from '@/stores/roles';

const emp = useEmployeeStore();
const rolesStore = useRoleStore();
const router = useRouter();

const email = ref('');
const roleId = ref('');
const loading = ref(false);
const success = ref(false);

onMounted(() => {
  rolesStore.fetch();
});

async function submit(): Promise<void> {
  if (!email.value || !roleId.value) return;
  loading.value = true;
  emp.error = null;
  try {
    await emp.invite(email.value, roleId.value);
    success.value = true;
    email.value = '';
    roleId.value = '';
  } catch {
    /* manejado por el store */
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <v-container>
    <div class="d-flex align-center mt-6 mb-4">
      <v-btn
        icon="mdi-arrow-left"
        variant="text"
        class="mr-2"
        @click="router.push({ name: 'employees' })"
      />
      <h2 class="text-h5 font-weight-medium">Invitar empleado</h2>
    </div>

    <v-alert
      v-if="emp.error"
      type="error"
      density="compact"
      variant="tonal"
      closable
      class="mb-4"
      @click:close="emp.error = null"
    >
      {{ emp.error }}
    </v-alert>

    <v-alert
      v-if="success"
      type="success"
      density="compact"
      variant="tonal"
      closable
      class="mb-4"
      @click:close="success = false"
    >
      Empleado invitado exitosamente
    </v-alert>

    <v-card max-width="500" elevation="2" rounded="lg">
      <v-card-text>
        <v-form @submit.prevent="submit">
          <v-text-field
            v-model="email"
            label="Correo electrónico"
            type="email"
            variant="outlined"
            density="compact"
            class="mb-4"
            hide-details="auto"
          />

          <v-select
            v-model="roleId"
            label="Rol"
            :items="rolesStore.list.filter(r => !r.isSystem)"
            item-title="name"
            item-value="id"
            variant="outlined"
            density="compact"
            class="mb-6"
            hide-details="auto"
            no-data-text="No hay roles disponibles"
          />

          <v-btn
            block
            color="primary"
            type="submit"
            :loading="loading"
            :disabled="!email || !roleId"
          >
            Enviar invitación
          </v-btn>
        </v-form>
      </v-card-text>
    </v-card>
  </v-container>
</template>
