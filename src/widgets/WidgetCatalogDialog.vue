<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { useDashboardStore } from '@/stores/dashboard';
import { usePluginsStore } from '@/stores/plugins';
import type { WidgetDef } from './registry';

/**
 * «Agregar widget»: el catálogo de lo que esta persona puede poner en su tablero (plugin activo + permiso), agrupado por módulo. Los
 * que ya están se marcan y no se repiten, salvo los de restaurante, que pueden ir una vez por establecimiento.
 */
const open = defineModel<boolean>({ required: true });
const { t } = useI18n();
const { xs } = useDisplay();
const dashboard = useDashboardStore();
const plugins = usePluginsStore();
const query = ref('');
watch(open, (v) => v && (query.value = ''));

const placed = computed(() => new Set(dashboard.items.map((i) => i.widget)));
const canAdd = (def: WidgetDef) => def.needs === 'establishment' || !placed.value.has(def.code);

/** Nombre del módulo tal como lo muestra la tienda de plugins (si no se tiene a mano, el código). */
function moduleName(code: string): string {
  return plugins.myPlugins.find((p) => p.pluginCode === code)?.pluginName ?? code;
}

const groups = computed(() => {
  const q = query.value.trim().toLowerCase();
  const map = new Map<string, WidgetDef[]>();
  for (const def of dashboard.catalog) {
    if (q && !t(def.titleKey).toLowerCase().includes(q)) continue;
    map.set(def.plugin, [...(map.get(def.plugin) ?? []), def]);
  }
  return [...map.entries()].map(([plugin, defs]) => ({ plugin, name: moduleName(plugin), defs })).sort((a, b) => a.name.localeCompare(b.name));
});

function add(def: WidgetDef): void {
  dashboard.add(def.code);
}
</script>

<template>
  <v-dialog v-model="open" max-width="720" scrollable :fullscreen="xs">
    <v-card>
      <v-card-title>{{ t('dashboard.addTitle') }}</v-card-title>
      <v-card-text class="d-flex flex-column ga-4">
        <div class="text-body-medium text-medium-emphasis">{{ t('dashboard.addHint') }}</div>
        <v-text-field v-model="query" prepend-inner-icon="mdi-magnify" :label="t('dashboard.search')" clearable />
        <div v-if="!groups.length" class="text-body-medium text-medium-emphasis">{{ t('dashboard.noWidgets') }}</div>
        <div v-for="g in groups" :key="g.plugin" class="flex-shrink-0">
          <div class="text-body-small text-medium-emphasis mb-2">{{ g.name }}</div>
          <v-list density="compact" class="pa-0">
            <v-list-item v-for="def in g.defs" :key="def.code" class="px-0">
              <template #prepend>
                <v-sheet :color="`light${def.color}`" class="d-flex align-center justify-center rounded-lg mr-4 catalog-icon">
                  <v-icon :icon="def.icon" :color="def.color" size="18" />
                </v-sheet>
              </template>
              <v-list-item-title class="text-body-medium">{{ t(def.titleKey) }}</v-list-item-title>
              <template #append>
                <v-btn v-if="canAdd(def)" size="small" variant="tonal" color="primary" prepend-icon="mdi-plus" @click="add(def)">{{ t('dashboard.add') }}</v-btn>
                <v-chip v-else size="small" prepend-icon="mdi-check">{{ t('dashboard.added') }}</v-chip>
              </template>
            </v-list-item>
          </v-list>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">{{ t('common.close') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.catalog-icon {
  width: 32px;
  height: 32px;
}
</style>
