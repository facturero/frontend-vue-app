<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useRoleStore } from '@/stores/roles';
import RoleBadge from '@/components/RoleBadge.vue';

const auth = useAuthStore();
const store = useRoleStore();
const router = useRouter();

const canManage = auth.can('user:assign_role');

onMounted(() => {
  store.fetch();
});
</script>

<template>
  <v-container>
    <div class="d-flex align-center justify-space-between mt-6 mb-4">
      <h2 class="text-h5 font-weight-medium">Roles</h2>
      <v-btn
        v-if="canManage"
        color="primary"
        variant="tonal"
        prepend-icon="mdi-plus"
        @click="router.push({ name: 'roles-create' })"
      >
        Nuevo rol
      </v-btn>
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

    <template v-if="!store.loading">
      <v-row>
        <v-col v-for="r in store.list" :key="r.id" cols="12" md="6" lg="4">
          <v-card
            elevation="2"
            rounded="lg"
            :disabled="r.isSystem && !canManage"
            @click="canManage && router.push({ name: 'roles-edit', params: { id: r.id } })"
            :class="{ 'cursor-pointer': canManage }"
          >
            <v-card-item>
              <v-card-title class="d-flex align-center">
                {{ r.name }}
                <v-chip v-if="r.isSystem" size="x-small" color="secondary" variant="tonal" class="ml-2">
                  sistema
                </v-chip>
              </v-card-title>
              <v-card-subtitle v-if="r.description" class="mt-1">
                {{ r.description }}
              </v-card-subtitle>
            </v-card-item>

            <v-card-text>
              <div class="text-caption text-medium-emphasis mb-2">
                Permisos ({{ r.permissions.length }})
              </div>
              <div class="d-flex flex-wrap ga-1">
                <v-chip
                  v-for="p in r.permissions.slice(0, 6)"
                  :key="p"
                  size="x-small"
                  variant="outlined"
                  color="primary"
                >
                  {{ p }}
                </v-chip>
                <v-chip v-if="r.permissions.length > 6" size="x-small" variant="text" color="primary">
                  +{{ r.permissions.length - 6 }}
                </v-chip>
              </div>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col v-if="store.list.length === 0" cols="12">
          <v-card elevation="2" rounded="lg">
            <v-card-text class="text-center text-medium-emphasis py-6">
              No hay roles configurados
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>

    <div v-else class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary" />
    </div>
  </v-container>
</template>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
</style>
