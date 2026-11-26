<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { useConfirm } from '@/composable/useConfirm';
import { useProjectsStore } from '@/stores/projects';
import { TAG_COLORS } from '@/utils/projects';
import type { Tag, TagColor } from '@/types/projects';
import TagColorSwatches from './TagColorSwatches.vue';

/**
 * «Administrar etiquetas»: crear, renombrar, cambiar el color y eliminar las etiquetas de la organización, con en cuántas tareas está
 * cada una. Solo para quien tiene `project_tag:manage` (el servidor lo vuelve a exigir): una etiqueta es de todos, y cambiarla o
 * borrarla afecta a tareas de cualquier proyecto.
 *
 * Crear también desde aquí (lo pidió el dueño, 2026-11-26): antes solo se podía desde una tarea. El color de cada etiqueta es un
 * círculo que abre la paleta: con 16 colores, una tira por fila no cabía.
 */
const open = defineModel<boolean>({ required: true });
const { t } = useI18n();
const store = useProjectsStore();
const confirm = useConfirm();
/** En el teléfono, a pantalla completa: dentro de una ventana flotante de 360 px las filas no tenían sitio. */
const { xs } = useDisplay();

const query = ref('');
/** Nombre en edición por etiqueta: se guarda al salir del campo o con Enter. */
const names = reactive<Record<string, string>>({});
/** De qué etiqueta está abierta la paleta (una a la vez). */
const colorMenuFor = ref<string | null>(null);

// ── Nueva etiqueta ──
const newName = ref('');
const pickedColor = ref<TagColor | null>(null);
/** Si no se elige, el siguiente color de la paleta: así etiquetas creadas seguidas no salen todas del mismo color. */
const newColor = computed<TagColor>({
  get: () => pickedColor.value ?? TAG_COLORS[store.tags.length % TAG_COLORS.length]!,
  set: (c) => (pickedColor.value = c),
});
const newColorMenu = ref(false);
const creating = ref(false);
/** Ya existe una con ese nombre (el servidor no distingue mayúsculas): se avisa en vez de «crear» la misma. */
const duplicate = computed(() => {
  const n = newName.value.trim().toLowerCase();
  return !!n && store.tags.some((tag) => tag.name.toLowerCase() === n);
});

// `immediate`: entrando por el menú «Etiquetas» (`/projects?tags=1`) el diálogo nace ya abierto, el cambio no llegaba nunca y la
// lista salía vacía («Aún no hay etiquetas») aunque la organización tuviera.
watch(
  open,
  (v) => {
    if (!v) return;
    query.value = '';
    newName.value = '';
    pickedColor.value = null;
    void store.ensureTags(true).then(() => {
      for (const tag of store.tags) names[tag.id] = tag.name;
    });
  },
  { immediate: true },
);

const visible = computed(() => {
  const q = query.value.trim().toLowerCase();
  return q ? store.tags.filter((tag) => tag.name.toLowerCase().includes(q)) : store.tags;
});

async function create(): Promise<void> {
  const name = newName.value.trim();
  if (!name || duplicate.value || creating.value) return;
  creating.value = true;
  try {
    const tag = await store.createTag(name, newColor.value);
    names[tag.id] = tag.name;
    newName.value = '';
    pickedColor.value = null;
  } catch {
    // El aviso lo deja el store.
  } finally {
    creating.value = false;
  }
}

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

async function recolor(tag: Tag, color: TagColor): Promise<void> {
  colorMenuFor.value = null;
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
  <v-dialog v-model="open" max-width="760" scrollable :fullscreen="xs">
    <v-card>
      <v-card-title>{{ t('projects.tags.manageTitle') }}</v-card-title>
      <v-card-text class="d-flex flex-column ga-4">
        <div class="text-body-medium text-medium-emphasis">{{ t('projects.tags.manageHint') }}</div>

        <!-- Nueva etiqueta: nombre, color (círculo que abre la paleta) y «Crear». Enter también crea. -->
        <div class="d-flex align-center ga-2 flex-shrink-0" data-new-tag>
          <v-menu v-model="newColorMenu" :close-on-content-click="false" location="bottom start">
            <template #activator="{ props: menu }">
              <v-btn
                v-bind="menu"
                icon
                :color="newColor"
                rounded="circle"
                size="small"
                :aria-label="t('projects.tags.colorOption', { color: t(`projects.colors.${newColor}`) })"
                data-new-tag-color
              >
                <v-icon icon="mdi-tag" size="small" />
              </v-btn>
            </template>
            <v-card class="pa-4">
              <TagColorSwatches :model-value="newColor" @update:model-value="(c: TagColor) => ((newColor = c), (newColorMenu = false))" />
            </v-card>
          </v-menu>
          <v-text-field
            v-model="newName"
            :label="t('projects.tags.newLabel')"
            maxlength="60"
            :error-messages="duplicate ? t('projects.tags.exists') : undefined"
            @keyup.enter="create"
          />
          <v-btn color="primary" prepend-icon="mdi-plus" :disabled="!newName.trim() || duplicate" :loading="creating" @click="create">
            {{ t('projects.tags.createButton') }}
          </v-btn>
        </div>

        <v-text-field v-if="store.tags.length > 8" v-model="query" prepend-inner-icon="mdi-magnify" :label="t('projects.tags.searchLabel')" clearable />
        <div v-if="!store.tags.length" class="text-body-medium text-medium-emphasis">{{ t('projects.tags.empty') }}</div>
        <!--
          Una fila por etiqueta, separadas por una línea suave. Antes cada una era una tarjeta `outlined`, cuyo borde usa el color del
          texto: con varias etiquetas el diálogo quedaba lleno de recuadros negros. `flex-shrink-0`: en un diálogo con scroll, la columna
          encogía las filas para caber y cortaba el nombre.
        -->
        <div v-if="visible.length">
          <template v-for="(tag, i) in visible" :key="tag.id">
            <v-divider v-if="i > 0" />
            <div class="d-flex align-center ga-2 py-2 flex-shrink-0" :data-tag-row="tag.name">
              <!-- El color: un círculo con el de la etiqueta; al pulsarlo, la paleta (cambia en todas las tareas que la llevan). -->
              <v-menu
                :model-value="colorMenuFor === tag.id"
                :close-on-content-click="false"
                location="bottom start"
                @update:model-value="(o: boolean) => (colorMenuFor = o ? tag.id : null)"
              >
                <template #activator="{ props: menu }">
                  <v-btn
                    v-bind="menu"
                    icon
                    :color="tag.color"
                    rounded="circle"
                    size="small"
                    :aria-label="t('projects.tags.colorOption', { color: t(`projects.colors.${tag.color}`) })"
                  >
                    <v-icon icon="mdi-tag" size="small" />
                  </v-btn>
                </template>
                <v-card class="pa-4">
                  <div class="text-body-small text-medium-emphasis mb-2">{{ t('projects.tags.colorEverywhere') }}</div>
                  <TagColorSwatches :model-value="tag.color" @update:model-value="(c: TagColor) => recolor(tag, c)" />
                </v-card>
              </v-menu>
              <!-- Sin borde, como el título de las tareas (`plain`): con un campo recuadrado por fila la lista pesaba. El lápiz avisa que se edita. -->
              <v-text-field
                v-model="names[tag.id]"
                class="tag-name flex-grow-1"
                :aria-label="t('projects.tags.name')"
                variant="plain"
                append-inner-icon="mdi-pencil-outline"
                maxlength="60"
                @blur="rename(tag)"
                @keyup.enter="rename(tag)"
              />
              <span class="text-body-small text-medium-emphasis text-no-wrap usage">{{ t('projects.tags.usage', { count: tag.taskCount ?? 0 }, tag.taskCount ?? 0) }}</span>
              <v-btn icon="mdi-trash-can-outline" variant="text" size="small" :aria-label="t('projects.tags.delete', { name: tag.name })" @click="remove(tag)" />
            </div>
          </template>
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
/* El campo `plain` trae relleno arriba (para la etiqueta flotante, que aquí no hay): sin él el nombre queda a la altura del icono. */
.tag-name :deep(.v-field__input) {
  padding-top: 0;
  padding-bottom: 0;
}
/* El lápiz, tenue: indica que el nombre se edita sin competir con él. */
.tag-name :deep(.v-field__append-inner .v-icon) {
  opacity: 0.4;
  font-size: 18px;
}
/* El uso alineado entre filas, para que los botones de borrar queden en columna. */
.usage {
  min-width: 72px;
  text-align: right;
}
</style>
