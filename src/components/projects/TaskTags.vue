<script setup lang="ts">
import { computed, ref, watch, mergeProps } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectsStore } from '@/stores/projects';
import { PROJECT_COLORS } from '@/utils/projects';
import type { Tag } from '@/types/projects';

/**
 * Etiquetas de la tarea. Son de toda la organización (como en Asana): escribir un nombre nuevo y pulsar Enter la crea; si ya existe
 * una que se llama igual, sin importar mayúsculas, el servidor devuelve esa y no se duplica.
 */
const props = defineProps<{ canEdit: boolean }>();
const { t } = useI18n();
const store = useProjectsStore();

const menu = ref(false);
const text = ref<string | Tag | null>(null);

watch(menu, (open) => {
  if (open) void store.ensureTags();
});

const current = computed(() => store.detail?.tags ?? []);
const candidates = computed(() => store.tags.filter((tag) => !current.value.some((c) => c.id === tag.id)));

async function choose(value: string | Tag | null): Promise<void> {
  const task = store.detail;
  if (!task || !value) return;
  try {
    let tag: Tag | undefined;
    if (typeof value === 'string') {
      const name = value.trim();
      if (!name) return;
      tag = store.tags.find((x) => x.name.toLowerCase() === name.toLowerCase());
      // Color rotando por cuántas hay: así dos etiquetas nuevas seguidas no salen iguales.
      tag ??= await store.createTag(name, PROJECT_COLORS[store.tags.length % PROJECT_COLORS.length]);
    } else tag = value;
    await store.setTaskTag(task.id, tag.id, true);
  } catch {
    // El aviso lo deja el store.
  } finally {
    text.value = null;
    menu.value = false;
  }
}

async function remove(tagId: string): Promise<void> {
  if (!store.detail) return;
  try {
    await store.setTaskTag(store.detail.id, tagId, false);
  } catch {
    // El aviso lo deja el store.
  }
}
</script>

<template>
  <div class="d-flex align-center flex-wrap ga-2 py-2">
    <v-chip v-for="tag in current" :key="tag.id" size="small" :color="tag.color" :closable="props.canEdit" @click:close="remove(tag.id)">
      {{ tag.name }}
    </v-chip>
    <v-menu v-if="props.canEdit" v-model="menu" :close-on-content-click="false">
      <template #activator="{ props: activator }">
        <v-tooltip location="top" :text="t('projects.tags.add')"><template #activator="{ props: tip }"><v-btn v-bind="mergeProps(activator, tip)" icon="mdi-tag-plus-outline" variant="text" size="x-small" :aria-label="t('projects.tags.add')" /></template></v-tooltip>
      </template>
      <v-card min-width="280" class="pa-2">
        <v-combobox
          v-model="text"
          :items="candidates"
          item-title="name"
          :label="t('projects.tags.add')"
          :hint="t('projects.tags.hint')"
          persistent-hint
          autofocus
          @update:model-value="choose"
        >
          <template #item="{ props: item, item: option }">
            <v-list-item v-bind="item">
              <template #prepend><v-icon :color="option.color" icon="mdi-tag" /></template>
            </v-list-item>
          </template>
        </v-combobox>
      </v-card>
    </v-menu>
    <span v-if="!current.length && !props.canEdit" class="text-body-medium text-medium-emphasis">—</span>
  </div>
</template>
