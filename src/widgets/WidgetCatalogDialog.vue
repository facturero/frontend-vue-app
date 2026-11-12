<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { useDashboardStore } from '@/stores/dashboard';
import { WIDGET_GROUPS, type WidgetDef, type WidgetGroup } from './registry';

/**
 * «Agregar widget»: el catálogo de lo que esta persona puede poner en su tablero (plugin activo + permiso), agrupado por área
 * (`WIDGET_GROUPS`). Los que ya están se marcan y no se repiten, salvo los de restaurante, que pueden ir una vez por establecimiento.
 * En el teléfono va a pantalla completa, con la ✕ arriba (al final de una lista larga, «Cerrar» quedaba fuera de vista).
 */
const open = defineModel<boolean>({ required: true });
const { t } = useI18n();
const { xs } = useDisplay();
const dashboard = useDashboardStore();
const query = ref('');
watch(open, (v) => v && (query.value = ''));

const placed = computed(() => new Set(dashboard.items.map((i) => i.widget)));
const canAdd = (def: WidgetDef) => def.needs === 'establishment' || !placed.value.has(def.code);

const groups = computed(() => {
  const q = query.value.trim().toLowerCase();
  const map = new Map<WidgetGroup, WidgetDef[]>();
  for (const def of dashboard.catalog) {
    if (q && !t(def.titleKey).toLowerCase().includes(q)) continue;
    map.set(def.group, [...(map.get(def.group) ?? []), def]);
  }
  return WIDGET_GROUPS.filter((g) => map.has(g)).map((g) => ({ group: g, defs: map.get(g)! }));
});

function add(def: WidgetDef): void {
  dashboard.add(def.code);
}
</script>

<template>
  <v-dialog v-model="open" max-width="720" scrollable :fullscreen="xs">
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <span class="flex-grow-1">{{ t('dashboard.addTitle') }}</span>
        <v-btn v-if="xs" icon="mdi-close" variant="text" size="small" :aria-label="t('common.close')" @click="open = false" />
      </v-card-title>
      <v-card-text class="d-flex flex-column ga-4">
        <div class="text-body-medium text-medium-emphasis">{{ t('dashboard.addHint') }}</div>
        <v-text-field v-model="query" prepend-inner-icon="mdi-magnify" :label="t('dashboard.search')" clearable />
        <div v-if="!groups.length" class="text-body-medium text-medium-emphasis">{{ t('dashboard.noWidgets') }}</div>
        <div v-for="g in groups" :key="g.group" class="flex-shrink-0">
          <div class="text-body-small text-medium-emphasis mb-2">{{ t(`dashboard.groups.${g.group}`) }}</div>
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
      <v-card-actions v-if="!xs">
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
