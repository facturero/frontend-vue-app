<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePluginsStore } from '@/stores/plugins';
import { useAuthStore } from '@/stores/auth';
import type { OrganizationPlugin } from '@/types/plugins';

const { locale } = useI18n();
const store = usePluginsStore();
const auth = useAuthStore();

const canActivate = computed(() => auth.can('plugins:manage'));

const deactivateDialog = ref<OrganizationPlugin | null>(null);
const showDeactivateDialog = computed(() => deactivateDialog.value !== null);
const deactivating = ref(false);

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

    <v-row>
      <v-col v-for="p in store.myPlugins" :key="p.pluginId" cols="12" sm="6" lg="4">
        <v-card class="d-flex flex-column fill-height">
          <v-card-title class="d-flex align-center justify-space-between">
            <span class="text-subtitle-1 font-weight-medium">{{ p.pluginName }}</span>
            <v-chip
              size="x-small"
              :color="p.status === 'active' ? 'lightsuccess' : 'grey'"
              :variant="p.status === 'active' ? 'flat' : 'tonal'"
            >
              {{ p.status === 'active' ? $t('common.active') : $t('plugins.status.desactivado') }}
            </v-chip>
          </v-card-title>
          <v-card-subtitle class="text-caption">{{ p.pluginCode }}</v-card-subtitle>
          <v-card-text class="text-caption text-medium-emphasis flex-grow-1">
            <div>
              {{ $t('plugins.headerActivatedAt') }}: {{ formatDate(p.activatedAt) }}
            </div>
            <v-chip
              size="x-small"
              class="mt-2"
              :color="p.activationSource === 'direct' ? 'lightprimary' : 'lightinfo'"
              variant="flat"
            >
              {{ p.activationSource === 'direct' ? $t('plugins.sourceDirect') : $t('plugins.sourceDependency') }}
            </v-chip>
          </v-card-text>
          <v-card-actions
            v-if="canActivate && p.activationSource === 'direct' && p.status === 'active'"
            class="pt-0"
          >
            <v-spacer />
            <v-btn
              icon="mdi-puzzle-remove"
              color="warning"
              variant="text"
              size="small"
              :title="$t('plugins.deactivate')"
              @click="deactivateDialog = p"
            />
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <div v-if="!store.loading && !store.myPlugins.length" class="text-center text-medium-emphasis pa-6">
      {{ $t('plugins.mineEmpty') }}
    </div>

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
