<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectsStore } from '@/stores/projects';
import { displayName } from '@/utils/projects';
import type { BulkAction } from '@/types/projects';

/**
 * Barra de edición en lote (como la de Asana al marcar varias filas): completar, asignar, poner fecha, mover de sección, etiquetar o
 * borrar todas a la vez. El servidor aplica cada tarea por separado: si alguna no se pudo (otra persona la cambió, falta rol), las
 * demás quedan hechas y aquí se dice cuántas fallaron.
 */
const props = defineProps<{ taskIds: string[] }>();
const emit = defineEmits<{ done: [] }>();
const { t } = useI18n();
const store = useProjectsStore();

const busy = ref(false);
const confirmDelete = ref(false);
const result = ref<string | null>(null);
const dueOn = ref('');

const people = computed(() => store.directory.map((u) => ({ value: u.id, title: displayName(u), subtitle: u.email })));

async function apply(action: BulkAction): Promise<void> {
  if (!props.taskIds.length || busy.value) return;
  busy.value = true;
  confirmDelete.value = false;
  try {
    const results = await store.bulk(props.taskIds, action);
    const failed = results.filter((r) => !r.ok).length;
    result.value = failed ? t('projects.bulk.partial', { failed, total: results.length }) : null;
    emit('done');
  } catch {
    // El aviso lo deja el store.
  } finally {
    busy.value = false;
  }
}

async function tag(value: unknown): Promise<void> {
  if (!value) return;
  const name = typeof value === 'string' ? value.trim() : (value as { name: string }).name;
  if (!name) return;
  try {
    const found = store.tags.find((x) => x.name.toLowerCase() === name.toLowerCase()) ?? (await store.createTag(name));
    await apply({ type: 'tag', tagId: found.id });
  } catch {
    // El aviso lo deja el store.
  }
}
</script>

<template>
  <div>
    <v-alert v-if="result" type="warning" closable class="mb-2" @click:close="result = null">{{ result }}</v-alert>
    <v-toolbar v-if="props.taskIds.length" color="lightprimary" density="compact" rounded class="px-2">
      <span class="text-body-2 font-weight-medium mr-2">{{ t('projects.bulk.selected', props.taskIds.length) }}</span>
      <div class="d-flex flex-wrap ga-2">
        <v-btn size="small" variant="text" prepend-icon="mdi-check" :loading="busy" @click="apply({ type: 'complete' })">{{ t('projects.bulk.complete') }}</v-btn>

        <v-menu :close-on-content-click="false">
          <template #activator="{ props: menu }">
            <v-btn v-bind="menu" size="small" variant="text" prepend-icon="mdi-account-outline" :disabled="busy">{{ t('projects.task.assignee') }}</v-btn>
          </template>
          <v-card min-width="280" class="pa-2">
            <v-autocomplete
              :items="people"
              :label="t('projects.task.assignee')"
              @update:model-value="(v: string | null) => v && apply({ type: 'assign', assigneeUserId: v })"
            />
            <v-btn size="small" variant="text" @click="apply({ type: 'assign', assigneeUserId: null })">{{ t('projects.bulk.unassign') }}</v-btn>
          </v-card>
        </v-menu>

        <v-menu :close-on-content-click="false">
          <template #activator="{ props: menu }">
            <v-btn v-bind="menu" size="small" variant="text" prepend-icon="mdi-calendar-outline" :disabled="busy">{{ t('projects.task.dueOn') }}</v-btn>
          </template>
          <v-card min-width="240" class="pa-2 d-flex flex-column ga-2">
            <v-text-field v-model="dueOn" type="date" :label="t('projects.task.dueOn')" />
            <div class="d-flex ga-2">
              <v-btn size="small" color="primary" :disabled="!dueOn" @click="apply({ type: 'due', dueOn })">{{ t('common.save') }}</v-btn>
              <v-btn size="small" variant="text" @click="apply({ type: 'due', dueOn: null })">{{ t('projects.bulk.clearDue') }}</v-btn>
            </div>
          </v-card>
        </v-menu>

        <v-menu v-if="store.current">
          <template #activator="{ props: menu }">
            <v-btn v-bind="menu" size="small" variant="text" prepend-icon="mdi-swap-vertical" :disabled="busy">{{ t('projects.bulk.move') }}</v-btn>
          </template>
          <v-list density="compact">
            <v-list-item
              v-for="s in store.sections"
              :key="s.id"
              :title="s.name"
              @click="apply({ type: 'move', projectId: store.current!.id, sectionId: s.id })"
            />
          </v-list>
        </v-menu>

        <v-menu :close-on-content-click="false" @update:model-value="(open: boolean) => open && store.ensureTags()">
          <template #activator="{ props: menu }">
            <v-btn v-bind="menu" size="small" variant="text" prepend-icon="mdi-tag-outline" :disabled="busy">{{ t('projects.tags.title') }}</v-btn>
          </template>
          <v-card min-width="260" class="pa-2">
            <v-combobox :items="store.tags" item-title="name" :label="t('projects.tags.add')" @update:model-value="tag" />
          </v-card>
        </v-menu>

        <v-btn size="small" variant="text" color="error" prepend-icon="mdi-trash-can-outline" :disabled="busy" @click="confirmDelete = true">
          {{ t('common.delete') }}
        </v-btn>
      </div>
      <v-spacer />
      <v-btn icon="mdi-close" size="small" variant="text" :aria-label="t('projects.bulk.clear')" @click="emit('done')" />
    </v-toolbar>

    <v-dialog v-model="confirmDelete">
      <v-card>
        <v-card-title>{{ t('projects.bulk.deleteTitle', props.taskIds.length) }}</v-card-title>
        <v-card-text>{{ t('projects.task.deleteText') }}</v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="confirmDelete = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="error" @click="apply({ type: 'delete' })">{{ t('common.delete') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
