<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useNotificationPrefsStore } from '@/stores/notificationPrefs';
import { usePluginsStore } from '@/stores/plugins';
import PageHeader from '@/components/ui/PageHeader.vue';
import type { NotificationProvider } from '@/types/notifications';

// Preferencias de notificaciones por usuario, a lo Moodle: matriz de providers
// (eventos que emite cada plugin del plan de la org) con un interruptor por
// canal (`app` = campana realtime, `smtp` = correo). El catálogo de providers
// lo declara notification-service; aquí solo se listan los de plugins activos y
// se guardan como EXCEPCIONES del usuario (lo no tocado sigue el default).
const props = defineProps<{ embedded?: boolean }>();

const store = useNotificationPrefsStore();
const plugins = usePluginsStore();

const draft = ref<Record<string, { app: boolean; smtp: boolean }>>({});
const suggestedDefaults = ref<Record<string, { app: boolean; smtp: boolean }>>({});
const saved = ref(false);

/** Nombre traducido del plugin (plugin-catalog lo traduce vía Accept-Language). */
const pluginNameMap = computed(() => {
  const map: Record<string, string> = {};
  for (const p of plugins.myPlugins) {
    map[p.pluginCode ?? p.pluginId] = p.pluginName ?? p.pluginCode ?? p.pluginId;
  }
  return map;
});

/** Providers agrupados porque su plugin está ACTIVO en la org. */
const groups = computed(() => {
  const byPlugin = new Map<string, NotificationProvider[]>();
  for (const p of store.providers) {
    if (!plugins.isActive(p.pluginCode)) continue;
    const list = byPlugin.get(p.pluginCode) ?? [];
    list.push(p);
    byPlugin.set(p.pluginCode, list);
  }
  return [...byPlugin.entries()].map(([pluginCode, providers]) => ({
    pluginCode,
    pluginName: pluginNameMap.value[pluginCode] ?? pluginCode,
    providers: providers.sort((a, b) => a.code.localeCompare(b.code)),
  }));
});

function initDraft(): void {
  const d: Record<string, { app: boolean; smtp: boolean }> = {};
  const defaults: Record<string, { app: boolean; smtp: boolean }> = {};
  for (const p of store.providers) {
    const eff = store.preferences[p.code] ?? p.defaults;
    d[p.code] = { app: eff.app, smtp: eff.smtp };
    defaults[p.code] = { ...p.defaults };
  }
  draft.value = d;
  suggestedDefaults.value = defaults;
}

onMounted(async () => {
  saved.value = false;
  await plugins.ensureMyLoaded();
  await store.loadAll();
  initDraft();
});

/** Restablece a los defaults declarados por cada provider. */
function resetAll(): void {
  for (const p of store.providers) {
    draft.value[p.code] = { ...suggestedDefaults.value[p.code] };
  }
  saved.value = false;
}

async function saveAll(): Promise<void> {
  const updates = store.providers
    .filter((p) => plugins.isActive(p.pluginCode))
    .map((p) => {
      const d = draft.value[p.code];
      const u: { providerCode: string; app?: boolean; smtp?: boolean } = { providerCode: p.code };
      if (p.channels.includes('app')) u.app = d?.app ?? p.defaults.app;
      if (p.channels.includes('smtp')) u.smtp = d?.smtp ?? p.defaults.smtp;
      return u;
    });
  const ok = await store.save(updates);
  saved.value = ok;
}
</script>

<template>
  <component :is="props.embedded ? 'div' : 'v-container'">
    <PageHeader v-if="!props.embedded" :title="$t('notificationPrefs.title')" />

    <v-sheet color="transparent" class="mb-2">
      <p class="text-body-2 text-medium-emphasis">{{ $t('notificationPrefs.legend') }}</p>
    </v-sheet>

    <v-alert v-if="store.error" type="error" class="mb-4">
      {{ store.error }}
    </v-alert>
    <v-alert v-if="saved" type="success" class="mb-4">
      {{ $t('notificationPrefs.saved') }}
    </v-alert>

    <div v-if="store.loading" class="d-flex justify-center pa-6">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <v-card v-else-if="groups.length === 0" class="mb-4">
      <v-card-text class="pa-6 d-flex align-center ga-2">
        <v-icon icon="mdi-bell-off-outline" color="lightinfo" />
        <span class="text-body-2 text-medium-emphasis">{{ $t('notificationPrefs.noProviders') }}</span>
      </v-card-text>
    </v-card>

    <div v-else class="d-flex ga-4 mb-4">
      <v-btn color="primary" :loading="store.saving" prepend-icon="mdi-content-save" @click="saveAll">
        {{ $t('common.save') }}
      </v-btn>
      <v-btn variant="text" color="primary" :disabled="store.saving" prepend-icon="mdi-restore" @click="resetAll">
        {{ $t('notificationPrefs.reset') }}
      </v-btn>
    </div>

    <!-- Matriz por plugin: una tarjeta por grupo (Moodle). -->
    <v-card v-for="group in groups" :key="group.pluginCode" class="mb-4">
      <v-card-title class="text-h6 py-2 px-4 d-flex align-center ga-2">
        <v-icon :icon="'mdi-puzzle'" color="lightprimary" size="x-small" />
        <span>{{ group.pluginName }}</span>
      </v-card-title>
      <v-divider />
      <v-list>
        <v-list-item v-for="p in group.providers" :key="p.code">
          <v-list-item-title class="text-body-1">{{ $t(p.nameKey) }}</v-list-item-title>
          <v-list-item-subtitle>{{ $t(p.descriptionKey) }}</v-list-item-subtitle>

          <template #append>
            <div class="d-flex align-center ga-4">
              <v-switch
                v-if="p.channels.includes('app')"
                v-model="draft[p.code]!.app"
                :label="$t('notificationPrefs.app')"
                hide-details
              />
              <v-switch
                v-if="p.channels.includes('smtp')"
                v-model="draft[p.code]!.smtp"
                :label="$t('notificationPrefs.smtp')"
                hide-details
              />
            </div>
          </template>
        </v-list-item>
      </v-list>
    </v-card>
  </component>
</template>