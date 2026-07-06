<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRoleStore } from '@/stores/roles';
import PermissionSelector from '@/components/PermissionSelector.vue';

const props = defineProps<{ id: string }>();
const store = useRoleStore();
const router = useRouter();

const selectedPermissions = ref<string[]>([]);
const saving = ref(false);
const saved = ref(false);

const role = computed(() => store.list.find((r) => r.id === props.id));

onMounted(async () => {
  if (store.list.length === 0) {
    await store.fetch();
  }
  await store.fetchPermissions();
  if (role.value) {
    selectedPermissions.value = [...role.value.permissions];
  }
});

async function save(): Promise<void> {
  saving.value = true;
  store.error = null;
  saved.value = false;
  try {
    await store.updatePermissions(props.id, selectedPermissions.value);
    await store.fetch();
    saved.value = true;
  } catch {
    /* manejado por el store */
  } finally {
    saving.value = false;
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
      <h2 class="text-h5 font-weight-medium">
        Editar rol: {{ role?.name || props.id }}
      </h2>
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

    <v-alert
      v-if="saved"
      type="success"
      density="compact"
      variant="tonal"
      closable
      class="mb-4"
      @click:close="saved = false"
    >
      Permisos actualizados
    </v-alert>

    <template v-if="role">
      <v-row>
        <v-col cols="12" md="5">
          <v-card elevation="2" rounded="lg">
            <v-card-text>
              <v-list lines="two" density="comfortable">
                <v-list-item title="Nombre" :subtitle="role.name" prepend-icon="mdi-shield-account" />
                <v-list-item title="Descripción" :subtitle="role.description || '—'" prepend-icon="mdi-text" />
                <v-list-item title="Sistema" prepend-icon="mdi-cog">
                  <template #subtitle>
                    <v-chip size="x-small" :color="role.isSystem ? 'secondary' : 'success'" variant="tonal">
                      {{ role.isSystem ? 'Sí' : 'No' }}
                    </v-chip>
                  </template>
                </v-list-item>
              </v-list>

              <v-btn
                block
                color="primary"
                variant="tonal"
                class="mt-4"
                :loading="saving"
                @click="save"
              >
                Guardar cambios
              </v-btn>
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
    </template>

    <div v-else-if="!store.loading" class="text-center text-medium-emphasis py-8">
      Rol no encontrado
    </div>

    <div v-else class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary" />
    </div>
  </v-container>
</template>
