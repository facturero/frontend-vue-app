<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePluginsStore } from '@/stores/plugins';
import { useAuthStore } from '@/stores/auth';
import type { OrganizationPlugin } from '@/types/plugins';

const { t, locale } = useI18n();
const store = usePluginsStore();
const auth = useAuthStore();

const canActivate = computed(() => auth.can('plugins:manage'));

const deactivateDialog = ref<OrganizationPlugin | null>(null);
const showDeactivateDialog = computed(() => deactivateDialog.value !== null);
const deactivating = ref(false);

const headers = computed(() => [
  { title: t('plugins.headerPlugin'), key: 'pluginName', sortable: true, align: 'start' as const },
  { title: t('plugins.headerCode'), key: 'pluginCode', sortable: true, align: 'start' as const },
  { title: t('plugins.headerSource'), key: 'activationSource', sortable: false, align: 'start' as const },
  { title: t('common.status'), key: 'status', sortable: false, align: 'start' as const },
  { title: t('plugins.headerActivatedAt'), key: 'activatedAt', sortable: true, align: 'start' as const },
  { title: t('common.actions'), key: 'actions', sortable: false, align: 'end' as const },
]);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(locale.value, { dateStyle: 'medium' });
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

    <v-card>
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
          >
            {{ item.activationSource === 'direct' ? $t('plugins.sourceDirect') : $t('plugins.sourceDependency') }}
          </v-chip>
        </template>

        <template #item.status="{ item }">
          <v-chip
            size="small"
            :color="item.status === 'active' ? 'success' : 'grey'"
          >
            {{ item.status === 'active' ? $t('common.active') : $t('plugins.status.desactivado') }}
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

        <template #no-data>{{ $t('plugins.mineEmpty') }}</template>
      </v-data-table>
    </v-card>

    <v-dialog v-model="showDeactivateDialog" max-width="440">
      <v-card v-if="deactivateDialog">
        <v-card-title>{{ $t('plugins.deactivateTitle') }}</v-card-title>
        <v-card-text>
          <i18n-t keypath="plugins.deactivateConfirm" tag="span">
            <template #name><strong>{{ deactivateDialog.pluginName }}</strong></template>
          </i18n-t>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deactivateDialog = null">{{ $t('common.cancel') }}</v-btn>
          <v-btn
            color="warning"
            variant="tonal"
            :loading="deactivating || store.saving"
            @click="confirmDeactivate"
          >
            {{ $t('plugins.deactivate') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
