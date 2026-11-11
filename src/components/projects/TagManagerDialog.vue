<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConfirm } from '@/composable/useConfirm';
import { useProjectsStore } from '@/stores/projects';
import type { ProjectColor, Tag } from '@/types/projects';
import TagColorSwatches from './TagColorSwatches.vue';

/**
 * «Administrar etiquetas»: renombrar, cambiar el color y eliminar las etiquetas de la organización, con en cuántas tareas está cada
 * una. Solo para quien tiene `project_tag:manage` (el servidor lo vuelve a exigir): una etiqueta es de todos, y cambiarla o borrarla
 * afecta a tareas de cualquier proyecto.
 */
const open = defineModel<boolean>({ required: true });
const { t } = useI18n();
const store = useProjectsStore();
const confirm = useConfirm();

const query = ref('');
/** Nombre en edición por etiqueta: se guarda al salir del campo o con Enter. */
const names = reactive<Record<string, string>>({});

watch(open, (v) => {
  if (!v) return;
  query.value = '';
  void store.ensureTags(true).then(() => {
    for (const tag of store.tags) names[tag.id] = tag.name;
  });
});

const visible = computed(() => {
  const q = query.value.trim().toLowerCase();
  return q ? store.tags.filter((tag) => tag.name.toLowerCase().includes(q)) : store.tags;
});

async function rename(tag: Tag): Promise<void> {
  const name = (names[tag.id] ?? '').trim();
  if (!name || name === tag.name) {
    names[tag.id] = tag.name;
    return;
  }
  try {
    await store.updateTag(tag.id, { name });
  } catch {
    names[tag.id] = tag.name;
  }
}

async function recolor(tag: Tag, color: ProjectColor): Promise<void> {
  if (color === tag.color) return;
  try {
    await store.updateTag(tag.id, { color });
  } catch {
    // El aviso lo deja el store.
  }
}

async function remove(tag: Tag): Promise<void> {
  const ok = await confirm({
    title: t('projects.tags.deleteTitle', { name: tag.name }),
    text: tag.taskCount ? t('projects.tags.deleteText', { count: tag.taskCount }, tag.taskCount) : t('projects.tags.deleteUnused'),
    confirmText: t('common.delete'),
    destructive: true,
  });
  if (!ok) return;
  try {
    await store.deleteTag(tag.id);
  } catch {
    // El aviso lo deja el store.
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="640" scrollable>
    <v-card>
      <v-card-title>{{ t('projects.tags.manageTitle') }}</v-card-title>
      <v-card-text class="d-flex flex-column ga-4">
        <div class="text-body-medium text-medium-emphasis">{{ t('projects.tags.manageHint') }}</div>
        <v-text-field v-if="store.tags.length > 8" v-model="query" prepend-inner-icon="mdi-magnify" :label="t('projects.tags.searchLabel')" clearable />
        <div v-if="!store.tags.length" class="text-body-medium text-medium-emphasis">{{ t('projects.tags.empty') }}</div>
        <!-- `flex-shrink-0`: en un diálogo con scroll, la columna encogía las tarjetas para caber y cortaba el nombre y los colores. -->
        <v-card v-for="tag in visible" :key="tag.id" variant="outlined" class="pa-4 flex-shrink-0">
          <div class="d-flex align-center flex-wrap ga-2">
            <v-icon icon="mdi-tag" :color="tag.color" />
            <v-text-field
              v-model="names[tag.id]"
              :label="t('projects.tags.name')"
              :counter="60"
              maxlength="60"
              class="flex-grow-1"
              @blur="rename(tag)"
              @keyup.enter="rename(tag)"
            />
            <span class="text-body-small text-medium-emphasis text-no-wrap">{{ t('projects.tags.usage', { count: tag.taskCount ?? 0 }, tag.taskCount ?? 0) }}</span>
            <v-btn icon="mdi-trash-can-outline" variant="text" size="small" :aria-label="t('projects.tags.delete', { name: tag.name })" @click="remove(tag)" />
          </div>
          <div class="d-flex align-center ga-2 mt-2">
            <span class="text-body-small text-medium-emphasis">{{ t('projects.tags.color') }}</span>
            <TagColorSwatches :model-value="tag.color" @update:model-value="(c: ProjectColor) => recolor(tag, c)" />
          </div>
        </v-card>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">{{ t('common.close') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
