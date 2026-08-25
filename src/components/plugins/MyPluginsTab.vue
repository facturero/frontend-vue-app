<script setup lang="ts">
import { computed, ref } from 'vue';
import { usePluginsStore } from '@/stores/plugins';
import { useAuthStore } from '@/stores/auth';
import type { OrganizationPlugin } from '@/types/plugins';

const store = usePluginsStore();
const auth = useAuthStore();

const canActivate = computed(() => auth.can('plugins:manage'));

const deactivateDialog = ref<OrganizationPlugin | null>(null);
const showDeactivateDialog = computed(() => deactivateDialog.value !== null);
const deactivating = ref(false);

const headers = [
  { title: 'Plugin', key: 'pluginName', sortable: true, align: 'start' as const },
  { title: 'Código', key: 'pluginCode', sortable: true, align: 'start' as const },
  { title: 'Origen', key: 'activationSource', sortable: false, align: 'start' as const },
  { title: 'Estado', key: 'status', sortable: false, align: 'start' as const },
  { title: 'Activado', key: 'activatedAt', sortable: true, align: 'start' as const },
  { title: 'Acciones', key: 'actions', sortable: false, align: 'end' as const },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-EC', { dateStyle: 'medium' });
}

async function confirmDeactivate(): Promise<void> {
  const target = deactivateDialog.value;
  if (!target?.pluginCode) return;
  deactivating.value = true;
  await store.deactivate(target.pluginCode);
  deactivating.value = false;
  deactivateDialog.value = null;
}
</script>

<template>
  <div>
    <v-alert
      v-if="store.error"
      type="error"
      density="compact"
      variant="tonal"
      closable
      class="mb-4"
      @click:close="store.clearError()"
    >
      {{ store.error }}
      <template v-if="store.errorDetails.length">
        <ul class="ml-4 text-caption">
          <li v-for="d in store.errorDetails" :key="d">{{ d }}</li>
        </ul>
      </template>
    </v-alert>

    <v-card elevation="2" rounded="lg">
      <v-data-table
        :headers="headers"
        :items="store.myPlugins"
        :loading="store.loading"
        item-value="pluginId"
        :items-per-page="10"
      >
        <template #item.activationSource="{ item }">
          <v-chip
            size="x-small"
            :color="item.activationSource === 'direct' ? 'primary' : 'grey'"
            variant="tonal"
          >
            {{ item.activationSource === 'direct' ? 'Contratado' : 'Requerido por otro' }}
          </v-chip>
        </template>

        <template #item.status="{ item }">
          <v-chip
            size="small"
            :color="item.status === 'active' ? 'success' : 'grey'"
            variant="tonal"
          >
            {{ item.status === 'active' ? 'Activo' : 'Desactivado' }}
          </v-chip>
        </template>

        <template #item.activatedAt="{ item }">
          {{ formatDate(item.activatedAt) }}
        </template>

        <template #item.actions="{ item }">
          <div class="d-flex justify-end ga-1">
            <v-btn
              v-if="canActivate && item.activationSource === 'direct' && item.status === 'active'"
              icon="mdi-puzzle-remove"
              color="warning"
              variant="text"
              size="small"
              @click="deactivateDialog = item"
            />
          </div>
        </template>

        <template #no-data>No tienes plugins activos todavía.</template>
      </v-data-table>
    </v-card>

    <v-dialog v-model="showDeactivateDialog" max-width="440">
      <v-card v-if="deactivateDialog">
        <v-card-title>Desactivar plugin</v-card-title>
        <v-card-text>
          ¿Desactivar <strong>{{ deactivateDialog.pluginName }}</strong>?
          Si otros plugins contratados dependen de él, también se desactivarán en cascada.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deactivateDialog = null">Cancelar</v-btn>
          <v-btn
            color="warning"
            variant="tonal"
            :loading="deactivating || store.saving"
            @click="confirmDeactivate"
          >
            Desactivar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
