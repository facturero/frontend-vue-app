<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import DateField from '@/components/ui/DateField.vue';
import { useProjectsStore } from '@/stores/projects';
import { displayName } from '@/utils/projects';
import type { CustomField, FieldValue } from '@/types/projects';

/**
 * Un campo personalizado en el detalle de la tarea: la entrada cambia según su tipo. Se guarda al soltar (blur o Enter) o al elegir;
 * el servidor valida y normaliza (un número con coma decimal vuelve como número).
 */
const props = defineProps<{ taskId: string; field: CustomField; value: FieldValue | null; readonly: boolean }>();
const { t } = useI18n();
const store = useProjectsStore();

const draft = ref<string>('');
watch(
  () => props.value,
  (v) => (draft.value = v === null || v === undefined ? '' : String(v)),
  { immediate: true },
);

const options = computed(() => props.field.options.map((o) => ({ value: o.id, title: o.label, color: o.color })));
const people = computed(() => store.directory.map((u) => ({ value: u.id, title: displayName(u), subtitle: u.email })));

async function save(raw: string | number | null): Promise<void> {
  const value = raw === '' || raw === undefined ? null : raw;
  if ((value ?? '') === (props.value ?? '') || String(value ?? '') === String(props.value ?? '')) return;
  try {
    await store.setFieldValue(props.taskId, props.field.id, value);
  } catch {
    draft.value = props.value === null ? '' : String(props.value);
  }
}
</script>

<template>
  <v-select
    v-if="field.type === 'select'"
    :model-value="value"
    :items="options"
    :readonly="readonly"
    :placeholder="t('projects.fields.empty')"
    clearable
    variant="plain"
    @update:model-value="(v: FieldValue | null) => save(v)"
  >
    <template #selection="{ internalItem: item }">
      <v-chip size="small" :color="item.raw.color">{{ item.title }}</v-chip>
    </template>
    <template #item="{ props: itemProps, item }">
      <v-list-item v-bind="itemProps">
        <template #prepend><v-icon :color="item.color" icon="mdi-circle" size="small" /></template>
      </v-list-item>
    </template>
  </v-select>
  <v-autocomplete
    v-else-if="field.type === 'person'"
    :model-value="value"
    :items="people"
    :readonly="readonly"
    :placeholder="t('projects.fields.empty')"
    clearable
    variant="plain"
    @update:model-value="(v: FieldValue | null) => save(v)"
  />
  <DateField
    v-else-if="field.type === 'date'"
    :model-value="draft || null"
    :readonly="readonly"
    variant="plain"
    @update:model-value="(v) => save(v ?? '')"
  />
  <v-text-field
    v-else
    v-model="draft"
    :inputmode="field.type === 'number' ? 'decimal' : undefined"
    :readonly="readonly"
    :placeholder="t('projects.fields.empty')"
    variant="plain"
    @blur="save(draft.trim())"
    @keyup.enter="($event.target as HTMLInputElement).blur()"
  />
</template>
