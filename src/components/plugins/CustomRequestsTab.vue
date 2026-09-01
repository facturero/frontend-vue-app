<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePluginsStore } from '@/stores/plugins';
import { useAuthStore } from '@/stores/auth';

const { t } = useI18n();
const store = usePluginsStore();
const auth = useAuthStore();

const canActivate = computed(() => auth.can('plugins:manage'));

const requestDialog = ref(false);
const description = ref('');
const basedOnCodes = ref<string[]>([]);
const descriptionRules = [
  (v: string) => (!!v && v.trim().length >= 10) || t('plugins.descriptionRule'),
];

const publicCatalog = computed(() => store.catalog.filter((p) => !p.is_exclusive));

const statusMeta = computed(() => ({
  requested: { label: t('plugins.requestStatus.requested'), color: 'info' },
  quoted: { label: t('plugins.requestStatus.quoted'), color: 'warning' },
  created: { label: t('plugins.requestStatus.created'), color: 'success' },
  rejected: { label: t('plugins.requestStatus.rejected'), color: 'error' },
}));

const selectablePlugins = computed(() =>
  publicCatalog.value.map((p) => ({ title: `${p.name} (${p.code})`, value: p.code })),
);

function openRequestDialog(): void {
  description.value = '';
  basedOnCodes.value = [];
  requestDialog.value = true;
}

async function submitRequest(): Promise<void> {
  const ok = await store.requestCustom(description.value, basedOnCodes.value);
  if (ok) requestDialog.value = false;
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
    </v-alert>

    <div class="d-flex justify-end mb-3" v-if="canActivate">
      <v-btn color="primary" variant="tonal" prepend-icon="mdi-plus" @click="openRequestDialog">
        {{ $t('plugins.requestCustom') }}
      </v-btn>
    </div>

    <v-card>
      <v-list>
        <v-list-item v-for="r in store.requests" :key="r.id">
          <template #prepend>
            <v-icon icon="mdi-file-document-edit-outline" />
          </template>
          <v-list-item-title class="text-body-2">{{ r.description }}</v-list-item-title>
          <v-list-item-subtitle class="text-caption">
            {{ $t('plugins.requestLabel', { id: r.id.slice(0, 8) }) }}
            <template v-if="r.rejectionReason"> · {{ $t('plugins.requestReason') }}: {{ r.rejectionReason }}</template>
            <template v-if="r.quotedPriceCents != null">
              · {{ $t('plugins.requestQuoted') }}: {{ (r.quotedPriceCents / 100).toFixed(2) }} USD
            </template>
          </v-list-item-subtitle>
          <template #append>
            <v-chip size="small" :color="statusMeta[r.status].color">
              {{ statusMeta[r.status].label }}
            </v-chip>
          </template>
        </v-list-item>
      </v-list>
      <div v-if="!store.loading && !store.requests.length" class="text-center text-medium-emphasis pa-6">
        {{ $t('plugins.requestsEmpty') }}
      </div>
    </v-card>

    <v-dialog v-model="requestDialog" max-width="560">
      <v-card>
        <v-card-title>{{ $t('plugins.requestCustom') }}</v-card-title>
        <v-card-text>
          <v-textarea
            v-model="description"
            :label="$t('plugins.whatDoYouNeed')"
            :placeholder="$t('plugins.needPlaceholder')"
            rows="4"
            :rules="descriptionRules"
          />
          <v-select
            v-model="basedOnCodes"
            :items="selectablePlugins"
            :label="$t('plugins.basedOn')"
            multiple
            chips
            closable-chips
            :hint="$t('plugins.basedOnHint')"
            persistent-hint
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="requestDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn
            color="primary"
            variant="tonal"
            :disabled="!description || description.trim().length < 10"
            :loading="store.saving"
            @click="submitRequest"
          >
            {{ $t('plugins.sendRequest') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
