<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRoleStore } from '@/stores/roles';
import PermissionSelector from '@/components/PermissionSelector.vue';

const store = useRoleStore();
const router = useRouter();

const name = ref('');
const description = ref('');
const selectedPermissions = ref<string[]>([]);
const loading = ref(false);

onMounted(() => {
  store.fetchPermissions();
});

async function submit(): Promise<void> {
  if (!name.value) return;
  loading.value = true;
  store.error = null;
  try {
    const roleId = await store.create(name.value, description.value || undefined, selectedPermissions.value);
    await store.fetch();
    router.push({ name: 'roles-edit', params: { id: roleId } });
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
        @click="router.push({ name: 'roles' })"
      />
      <h2 class="text-h5 font-weight-medium">Nuevo rol</h2>
    </div>

    <v-alert
      v-if="store.error"
      type="error"
      density="compact"
      variant="tonal"
      closable
      class="mb-4"
      @click:close="store.error = null"
    >
      {{ store.error }}
    </v-alert>

    <v-row>
      <v-col cols="12" md="5">
        <v-card elevation="2" rounded="lg">
          <v-card-text>
            <v-form @submit.prevent="submit">
              <v-text-field
                v-model="name"
                label="Nombre del rol"
                variant="outlined"
                density="compact"
                class="mb-4"
                hide-details="auto"
              />
              <v-textarea
                v-model="description"
                label="Descripción"
                variant="outlined"
                density="compact"
                class="mb-6"
                rows="2"
                hide-details="auto"
              />
              <v-btn
                block
                color="primary"
                type="submit"
                :loading="loading"
                :disabled="!name"
              >
                Crear rol
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="7">
        <v-card elevation="2" rounded="lg">
          <v-card-title>Permisos</v-card-title>
          <v-card-text v-if="store.permissions.length > 0">
            <PermissionSelector
              :permissions="store.permissions"
              v-model="selectedPermissions"
            />
          </v-card-text>
          <v-card-text v-else class="d-flex justify-center py-4">
            <v-progress-circular indeterminate color="primary" size="24" />
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
