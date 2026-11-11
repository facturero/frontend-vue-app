<script setup lang="ts">
import { computed, ref, watch, mergeProps } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useProjectsStore } from '@/stores/projects';
import { TAG_COLORS } from '@/utils/projects';
import type { ProjectColor, Tag } from '@/types/projects';
import TagColorPicker from './TagColorPicker.vue';
import TagColorSwatches from './TagColorSwatches.vue';
import TagManagerDialog from './TagManagerDialog.vue';

/**
 * Etiquetas de la tarea. Son de toda la organización (como en Asana): se elige una de la lista o, si no existe, se crea con Enter o
 * con «Crear "…"». Si ya hay una que se llama igual, sin importar mayúsculas, se usa esa y no se duplica.
 *
 * Crear, cambiar el color (clic en una etiqueta) y «Administrar etiquetas» solo salen con el permiso `project_tag:manage`: son de toda
 * la organización. Sin él se eligen las que ya existen. El servidor lo vuelve a exigir.
 *
 * Es un `v-autocomplete` y no un `v-combobox` a propósito: el combobox confirma lo escrito al salir del campo, y un clic en otro
 * botón (o en otra parte del panel) creaba la etiqueta a medio escribir. Aquí lo escrito solo es búsqueda hasta que se pide crearla.
 */
const props = defineProps<{ canEdit: boolean }>();
const { t } = useI18n();
const store = useProjectsStore();
const auth = useAuthStore();
const canManage = computed(() => auth.can('project_tag:manage'));
const managing = ref(false);
/** Etiqueta con su menú de color abierto. Con estado propio para cerrarlo al pasar a «Administrar etiquetas»: si no, el menú quedaba abierto detrás del diálogo. */
const colorMenuFor = ref<string | null>(null);

const menu = ref(false);
const search = ref('');
const busy = ref(false);
/** Color elegido para la etiqueta nueva; sin elegir, rota según cuántas hay (dos nuevas seguidas no salen iguales). */
const pickedColor = ref<ProjectColor | null>(null);
const newColor = computed<ProjectColor>({
  get: () => pickedColor.value ?? TAG_COLORS[store.tags.length % TAG_COLORS.length]!,
  set: (c) => (pickedColor.value = c),
});

watch(menu, (open) => {
  if (open) void store.ensureTags();
  else {
    search.value = '';
    pickedColor.value = null;
  }
});

const current = computed(() => store.detail?.tags ?? []);
const candidates = computed(() => store.tags.filter((tag) => !current.value.some((c) => c.id === tag.id)));
const typed = computed(() => search.value.trim());
/** Una etiqueta con ese nombre exacto (sin importar mayúsculas), en la organización. */
const sameName = computed(() => store.tags.find((x) => x.name.toLowerCase() === typed.value.toLowerCase()));
/** «Crear "…"» solo si lo escrito no es ya una etiqueta y se pueden administrar las etiquetas. */
const canCreate = computed(() => canManage.value && !!typed.value && !sameName.value);
const visible = computed(() => {
  const q = typed.value.toLowerCase();
  return q ? candidates.value.filter((tag) => tag.name.toLowerCase().includes(q)) : candidates.value;
});

async function add(tag: Tag): Promise<void> {
  const task = store.detail;
  if (!task) return;
  busy.value = true;
  try {
    if (!current.value.some((c) => c.id === tag.id)) await store.setTaskTag(task.id, tag.id, true);
    menu.value = false;
  } catch {
    // El aviso lo deja el store.
  } finally {
    busy.value = false;
  }
}

async function create(): Promise<void> {
  if (!typed.value || busy.value) return;
  if (!sameName.value && !canManage.value) return;
  if (sameName.value) return add(sameName.value);
  busy.value = true;
  try {
    const tag = await store.createTag(typed.value, newColor.value);
    busy.value = false;
    await add(tag);
  } catch {
    busy.value = false;
  }
}

/**
 * Enter con coincidencias lo resuelve el propio `v-autocomplete` (`auto-select-first`: la primera de la lista). Sin ninguna, crea la
 * etiqueta (o usa la que se llama igual y ya estaba en la tarea).
 */
function onEnter(): void {
  if (!visible.value.length) void create();
}

async function recolor(tag: Tag, color: ProjectColor): Promise<void> {
  if (color === tag.color) return;
  try {
    await store.updateTag(tag.id, { color });
  } catch {
    // El aviso lo deja el store.
  }
}

function openManager(): void {
  menu.value = false;
  colorMenuFor.value = null;
  managing.value = true;
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
    <!-- Con «Administrar etiquetas», un clic en la etiqueta abre su color (cambia en todas las tareas que la llevan). -->
    <template v-for="tag in current" :key="tag.id">
      <v-menu v-if="canManage" :model-value="colorMenuFor === tag.id" :close-on-content-click="false"
        @update:model-value="(open: boolean) => (colorMenuFor = open ? tag.id : null)">
        <template #activator="{ props: chipMenu }">
          <v-chip v-bind="chipMenu" size="small" :color="tag.color" :closable="props.canEdit" link @click:close="remove(tag.id)">
            {{ tag.name }}
          </v-chip>
        </template>
        <v-card class="pa-4">
          <div class="text-body-small text-medium-emphasis mb-2">{{ t('projects.tags.colorEverywhere') }}</div>
          <TagColorSwatches :model-value="tag.color" @update:model-value="(c: ProjectColor) => recolor(tag, c)" />
          <v-btn variant="text" size="small" prepend-icon="mdi-tag-multiple-outline" class="mt-2" @click="openManager">
            {{ t('projects.tags.manage') }}
          </v-btn>
        </v-card>
      </v-menu>
      <v-chip v-else size="small" :color="tag.color" :closable="props.canEdit" @click:close="remove(tag.id)">
        {{ tag.name }}
      </v-chip>
    </template>
    <v-menu v-if="props.canEdit" v-model="menu" :close-on-content-click="false">
      <template #activator="{ props: activator }">
        <v-tooltip location="top" :text="t('projects.tags.add')">
          <template #activator="{ props: tip }">
            <v-btn v-bind="mergeProps(activator, tip)" icon="mdi-tag-plus-outline" variant="text" size="x-small" :aria-label="t('projects.tags.add')" />
          </template>
        </v-tooltip>
      </template>
      <v-card min-width="280" class="pa-2">
        <v-autocomplete
          v-model:search="search"
          :model-value="null"
          :items="visible"
          item-title="name"
          return-object
          no-filter
          auto-select-first
          :label="t('projects.tags.add')"
          :hint="canManage ? t('projects.tags.hint') : t('projects.tags.hintPickOnly')"
          persistent-hint
          :loading="busy"
          autofocus
          @update:model-value="(tag: Tag | null) => tag && add(tag)"
          @keydown.enter="onEnter"
        >
          <template #item="{ props: item, item: option }">
            <v-list-item v-bind="item">
              <template #prepend><v-icon :color="option.color" icon="mdi-tag" /></template>
            </v-list-item>
          </template>
          <template #prepend-item>
            <TagColorPicker v-if="canCreate && visible.length" v-model="newColor" :name="typed" @create="create" />
          </template>
          <template #no-data>
            <TagColorPicker v-if="canCreate" v-model="newColor" :name="typed" @create="create" />
            <v-list-item v-else-if="typed && !sameName" :title="t('projects.tags.noPermission', { name: typed })" disabled />
            <v-list-item v-else :title="t('projects.tags.none')" disabled />
          </template>
        </v-autocomplete>
        <v-btn v-if="canManage" variant="text" size="small" prepend-icon="mdi-tag-multiple-outline" class="mt-2" @click="openManager">
          {{ t('projects.tags.manage') }}
        </v-btn>
      </v-card>
    </v-menu>
    <span v-if="!current.length && !props.canEdit" class="text-body-medium text-medium-emphasis">—</span>
    <TagManagerDialog v-if="canManage" v-model="managing" />
  </div>
</template>
