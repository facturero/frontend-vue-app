<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePluginsStore } from '@/stores/plugins';
import { useAuthStore } from '@/stores/auth';
import type { OrganizationPlugin } from '@/types/plugins';
import { resolveBlockingPlugins, type BlockingPlugin } from '@/utils/plugin-blockers';

const emit = defineEmits<{ reactivate: [code: string] }>();

const { locale, t } = useI18n();
const store = usePluginsStore();
const auth = useAuthStore();

const canActivate = computed(() => auth.can('plugins:manage'));

const deactivateDialog = ref<OrganizationPlugin | null>(null);
const showDeactivateDialog = computed(() => deactivateDialog.value !== null);
const deactivating = ref(false);

// Si desactivar falla porque otros módulos activos dependen de este, el servidor manda sus códigos. Se muestran con su
// nombre y como enlace: al pulsarlo se abre directamente la desactivación de ese módulo.
const blockers = computed<BlockingPlugin[]>(() =>
  store.errorCode === 'BLOCKING_DEPENDENTS' ? resolveBlockingPlugins(store.errorDetails, store.myPlugins) : [],
);

function openBlocker(blocker: BlockingPlugin): void {
  if (!blocker.plugin || blocker.scheduledAt) return;
  store.clearError();
  deactivateDialog.value = blocker.plugin;
}

// Un módulo desactivado sigue en la lista (es el historial de la organización), pero ya no se cobra: por defecto solo
// se ven los activos y los demás quedan a un clic, para que no parezca que se siguen usando.
const showDisabled = ref(false);
const disabledCount = computed(() => store.myPlugins.filter((p) => p.status !== 'active').length);
const visiblePlugins = computed(() =>
  store.myPlugins.filter((p) => p.status === 'active' || showDisabled.value),
);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(locale.value, { dateStyle: 'medium' });
}

// Desactivar es «suave»: lo ya pagado se respeta. El texto dice hasta cuándo seguirá funcionando el módulo.
const deactivateNotice = computed(() => {
  const target = deactivateDialog.value;
  if (!target) return '';
  if (!target.periodEndsAt) return t('plugins.deactivateNoticeFree');
  const trial = store.subscription?.trial;
  const endsWithTrial = trial?.active && new Date(trial.ends_at).getTime() === new Date(target.periodEndsAt).getTime();
  return t(endsWithTrial ? 'plugins.deactivateNoticeTrial' : 'plugins.deactivateNoticePaid', {
    date: formatDate(target.periodEndsAt),
  });
});

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
      <template v-if="blockers.length">
        <ul class="ml-4 text-body-2">
          <li v-for="b in blockers" :key="b.code">
            <a
              v-if="b.plugin && !b.scheduledAt"
              href="#"
              class="text-primary font-weight-medium"
              @click.prevent="openBlocker(b)"
            >{{ b.name }}</a>
            <span v-else>{{ b.name }}</span>
            <span v-if="b.scheduledAt" class="text-medium-emphasis">
              — {{ $t('plugins.scheduledChip', { date: formatDate(b.scheduledAt) }) }}
            </span>
          </li>
        </ul>
      </template>
      <template v-else-if="store.errorDetails.length">
        <ul class="ml-4 text-caption">
          <li v-for="d in store.errorDetails" :key="d">{{ d }}</li>
        </ul>
      </template>
    </v-alert>

    <div v-if="disabledCount" class="d-flex justify-end mb-2">
      <v-btn size="small" color="primary" @click="showDisabled = !showDisabled">
        {{ $t(showDisabled ? 'plugins.hideDisabled' : 'plugins.showDisabled', { count: disabledCount }) }}
      </v-btn>
    </div>

    <v-row>
      <v-col v-for="p in visiblePlugins" :key="p.pluginId" cols="12" sm="6" lg="4">
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
            <div v-if="p.status === 'active' || !p.deactivatedAt">
              {{ $t('plugins.headerActivatedAt') }}: {{ formatDate(p.activatedAt) }}
            </div>
            <template v-else>
              <div>{{ $t('plugins.headerDeactivatedAt') }}: {{ formatDate(p.deactivatedAt) }}</div>
              <div class="mt-2">{{ $t('plugins.disabledHint') }}</div>
            </template>
            <div v-if="p.status === 'active' && p.deactivateAt" class="mt-2">
              <v-chip size="x-small" color="lightwarning" variant="flat">
                {{ $t('plugins.scheduledChip', { date: formatDate(p.deactivateAt) }) }}
              </v-chip>
              <div class="mt-1">{{ $t('plugins.scheduledHint') }}</div>
            </div>
            <v-chip
              v-if="p.status === 'active'"
              size="x-small"
              class="mt-2"
              :color="p.activationSource === 'direct' ? 'lightprimary' : 'lightinfo'"
              variant="flat"
            >
              {{ p.activationSource === 'direct' ? $t('plugins.sourceDirect') : $t('plugins.sourceDependency') }}
            </v-chip>
          </v-card-text>
          <v-card-actions v-if="canActivate && p.status !== 'active' && p.pluginCode" class="pt-0">
            <v-spacer />
            <v-btn color="primary" variant="tonal" size="small" @click="emit('reactivate', p.pluginCode)">
              {{ $t('plugins.reactivate') }}
            </v-btn>
          </v-card-actions>
          <v-card-actions v-else-if="canActivate && p.status === 'active' && p.deactivateAt" class="pt-0">
            <v-spacer />
            <v-btn
              color="primary"
              variant="tonal"
              size="small"
              :loading="store.saving"
              @click="p.pluginCode && store.cancelDeactivation(p.pluginCode)"
            >
              {{ $t('plugins.cancelDeactivation') }}
            </v-btn>
          </v-card-actions>
          <v-card-actions
            v-else-if="canActivate && p.activationSource === 'direct' && p.status === 'active'"
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

    <div v-if="!store.loading && !visiblePlugins.length" class="text-center text-medium-emphasis pa-6">
      {{ $t('plugins.mineEmpty') }}
    </div>

    <v-dialog v-model="showDeactivateDialog" max-width="440">
      <v-card v-if="deactivateDialog">
        <v-card-title>{{ $t('plugins.deactivateTitle') }}</v-card-title>
        <v-card-text>
          <i18n-t keypath="plugins.deactivateConfirm" tag="span">
            <template #name><strong>{{ deactivateDialog.pluginName }}</strong></template>
          </i18n-t>
          <v-alert type="info" class="mt-4">{{ deactivateNotice }}</v-alert>
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
