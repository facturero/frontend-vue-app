<script setup lang="ts">
import { ref, watch } from 'vue';
import { useConfirm } from '@/composable/useConfirm';
import { useI18n } from 'vue-i18n';
import { useProjectsStore } from '@/stores/projects';
import { FIELD_ICON, PROJECT_COLORS } from '@/utils/projects';
import type { CustomField, FieldOptionInput, FieldType, ProjectColor } from '@/types/projects';

/**
 * Campos personalizados del proyecto («Prioridad», «Presupuesto», «Etapa»…), como en Asana. Cada uno sale como columna en la lista
 * y como fila en el detalle; los de tipo lista, además, como chip en la tarjeta del tablero.
 *
 * Las opciones de una lista se editan conservando su id: renombrar «Alta» a «Urgente» no vacía las tareas que la tenían; quitar una
 * opción sí (el servidor deja esas tareas sin valor).
 */
const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();
const { t } = useI18n();
const confirm = useConfirm();
const store = useProjectsStore();

const TYPES: FieldType[] = ['select', 'text', 'number', 'date', 'person'];

interface Draft {
  name: string;
  options: Array<{ id: string | null; label: string; color: ProjectColor }>;
}
const drafts = ref<Record<string, Draft>>({});
const newName = ref('');
const newType = ref<FieldType>('select');
const newOptions = ref<Array<{ id: null; label: string; color: ProjectColor }>>([]);
const busy = ref(false);

function reset(): void {
  drafts.value = Object.fromEntries(
    store.fields.map((f) => [f.id, { name: f.name, options: f.options.map((o) => ({ id: o.id, label: o.label, color: o.color })) }]),
  );
}
watch(() => props.modelValue, (open) => open && reset());
watch(() => store.fields, () => props.modelValue && reset());

function nextColor(count: number): ProjectColor {
  return PROJECT_COLORS[count % PROJECT_COLORS.length]!;
}

async function run(work: () => Promise<void>): Promise<void> {
  busy.value = true;
  try {
    await work();
  } catch {
    // El aviso lo deja el store.
  } finally {
    busy.value = false;
  }
}

function options(list: Draft['options']): FieldOptionInput[] {
  return list.filter((o) => o.label.trim()).map((o) => ({ id: o.id, label: o.label.trim(), color: o.color }));
}

function saveField(field: CustomField): Promise<void> {
  const draft = drafts.value[field.id];
  if (!draft) return Promise.resolve();
  const patch: { name?: string; options?: FieldOptionInput[] } = {};
  if (draft.name.trim() && draft.name.trim() !== field.name) patch.name = draft.name.trim();
  if (field.type === 'select') {
    const next = options(draft.options);
    const same = JSON.stringify(next) === JSON.stringify(field.options.map((o) => ({ id: o.id, label: o.label, color: o.color })));
    if (!same) patch.options = next;
  }
  if (!patch.name && !patch.options) return Promise.resolve();
  return run(() => store.updateField(field.id, patch));
}

function create(): Promise<void> {
  const name = newName.value.trim();
  if (!name) return Promise.resolve();
  return run(async () => {
    await store.createField(name, newType.value, newType.value === 'select' ? options(newOptions.value) : undefined);
    newName.value = '';
    newOptions.value = [];
  });
}

async function remove(field: CustomField): Promise<void> {
  const ok = await confirm({
    title: t('projects.fields.deleteTitle', { name: field.name }),
    text: t('projects.fields.deleteText'),
    confirmText: t('common.delete'),
    destructive: true,
  });
  if (ok) await run(() => store.deleteField(field.id));
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="640" scrollable @update:model-value="emit('update:modelValue', $event)">
    <v-card>
      <v-card-title>{{ t('projects.fields.title') }}</v-card-title>
      <v-card-text class="d-flex flex-column ga-4">
        <div class="text-body-medium text-medium-emphasis">{{ t('projects.fields.hint') }}</div>

        <v-card v-for="f in store.fields" :key="f.id" variant="outlined" class="pa-4">
          <div v-if="drafts[f.id]" class="d-flex flex-column ga-2">
            <div class="d-flex align-center ga-2">
              <v-icon :icon="FIELD_ICON[f.type]" />
              <v-text-field v-model="drafts[f.id]!.name" :label="t('projects.fields.name')" :disabled="!store.canEdit" @blur="saveField(f)" @keyup.enter="saveField(f)" />
              <v-chip size="small">{{ t(`projects.fields.type.${f.type}`) }}</v-chip>
              <v-btn v-if="store.canEdit" icon="mdi-trash-can-outline" variant="text" size="small" :aria-label="t('common.delete')" @click="remove(f)" />
            </div>
            <template v-if="f.type === 'select'">
              <div v-for="(o, i) in drafts[f.id]!.options" :key="o.id ?? i" class="d-flex align-center ga-2">
                <v-menu>
                  <template #activator="{ props: menu }">
                    <v-btn v-bind="menu" :color="o.color" icon size="x-small" :aria-label="t('projects.form.color')" :disabled="!store.canEdit" />
                  </template>
                  <div class="d-flex ga-2 pa-2 bg-surface">
                    <v-btn v-for="c in PROJECT_COLORS" :key="c" :color="c" icon size="x-small" :aria-label="c" @click="o.color = c; saveField(f)" />
                  </div>
                </v-menu>
                <v-text-field v-model="o.label" :disabled="!store.canEdit" @blur="saveField(f)" @keyup.enter="saveField(f)" />
                <v-btn
                  v-if="store.canEdit"
                  icon="mdi-close"
                  variant="text"
                  size="x-small"
                  :aria-label="t('common.delete')"
                  @click="drafts[f.id]!.options.splice(i, 1); saveField(f)"
                />
              </div>
              <v-btn
                v-if="store.canEdit"
                variant="text"
                size="small"
                prepend-icon="mdi-plus"
                class="align-self-start"
                @click="drafts[f.id]!.options.push({ id: null, label: '', color: nextColor(drafts[f.id]!.options.length) })"
              >
                {{ t('projects.fields.addOption') }}
              </v-btn>
            </template>
          </div>
        </v-card>

        <v-card v-if="store.canEdit" variant="tonal" class="pa-4 d-flex flex-column ga-2">
          <div class="text-title-large">{{ t('projects.fields.new') }}</div>
          <div class="d-flex flex-column flex-sm-row ga-2">
            <v-text-field v-model="newName" :label="t('projects.fields.name')" :counter="60" />
            <v-select
              v-model="newType"
              :items="TYPES.map((v) => ({ value: v, title: t(`projects.fields.type.${v}`), props: { prependIcon: FIELD_ICON[v] } }))"
              :label="t('projects.fields.typeLabel')"
            />
          </div>
          <template v-if="newType === 'select'">
            <div v-for="(o, i) in newOptions" :key="i" class="d-flex align-center ga-2">
              <v-icon :color="o.color" icon="mdi-circle" />
              <v-text-field v-model="o.label" :label="t('projects.fields.option')" />
              <v-btn icon="mdi-close" variant="text" size="x-small" :aria-label="t('common.delete')" @click="newOptions.splice(i, 1)" />
            </div>
            <v-btn variant="text" size="small" prepend-icon="mdi-plus" class="align-self-start" @click="newOptions.push({ id: null, label: '', color: nextColor(newOptions.length) })">
              {{ t('projects.fields.addOption') }}
            </v-btn>
          </template>
          <v-btn color="primary" class="align-self-end" :disabled="!newName.trim()" :loading="busy" @click="create">{{ t('projects.fields.create') }}</v-btn>
        </v-card>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">{{ t('common.close') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
