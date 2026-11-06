<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { assistantApi } from '@/api/assistant';
import { useNotify } from '@/composable/useNotify';
import { useProjectsStore } from '@/stores/projects';
import { formatMinutes } from '@/utils/duration';
import { extractError } from '@/utils/error';

/**
 * Subtareas que propone la IA para la tarea abierta. Nada se crea hasta pulsar «Crear»: la persona marca las que quiere y puede
 * corregir el título. Se crean con la API normal de Proyectos (una a una, en el orden propuesto), así que el historial de la tarea
 * y la bitácora las registran como cualquier subtarea escrita a mano.
 */
const props = defineProps<{ modelValue: boolean; taskId: string }>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();
const { t } = useI18n();
const store = useProjectsStore();
const notify = useNotify();

interface Row {
  title: string;
  estimatedMinutes: number | null;
  picked: boolean;
}

const rows = ref<Row[]>([]);
const loading = ref(false);
const failure = ref<string | null>(null);
const saving = ref(false);

const picked = computed(() => rows.value.filter((r) => r.picked && r.title.trim()));

async function load(): Promise<void> {
  loading.value = true;
  failure.value = null;
  rows.value = [];
  try {
    const list = await assistantApi.suggestSubtasks(props.taskId);
    rows.value = list.map((s) => ({ ...s, picked: true }));
  } catch (err) {
    failure.value = t('projects.ai.failed', { message: extractError(err) });
  } finally {
    loading.value = false;
  }
}

// Se pide al abrir, no al montar: cada apertura es una consulta nueva (y cuesta tokens), nunca una en segundo plano.
watch(
  () => props.modelValue,
  (open) => {
    if (open) void load();
  },
  { immediate: true },
);

async function create(): Promise<void> {
  saving.value = true;
  const created = new Set<Row>();
  try {
    for (const row of picked.value) {
      await store.createTask({ title: row.title.trim(), parentTaskId: props.taskId, estimatedMinutes: row.estimatedMinutes });
      created.add(row);
    }
    notify.success(t('projects.ai.created', { n: created.size }));
    emit('update:modelValue', false);
  } catch {
    // El aviso lo deja el store. Las que ya se crearon se quitan de la lista para que reintentar no las duplique.
    rows.value = rows.value.filter((r) => !created.has(r));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="640" @update:model-value="emit('update:modelValue', $event)">
    <v-card>
      <v-card-title>{{ t('projects.ai.suggestTitle') }}</v-card-title>
      <v-card-text class="d-flex flex-column ga-4">
        <template v-if="loading">
          <div class="text-body-medium text-medium-emphasis">{{ t('projects.ai.suggestLoading') }}</div>
          <v-progress-linear indeterminate color="primary" />
        </template>
        <v-alert v-else-if="failure" type="error">{{ failure }}</v-alert>
        <div v-else-if="!rows.length" class="text-body-medium text-medium-emphasis">{{ t('projects.ai.suggestEmpty') }}</div>
        <template v-else>
          <div class="text-body-medium text-medium-emphasis">{{ t('projects.ai.suggestHint') }}</div>
          <div v-for="(row, i) in rows" :key="i" class="d-flex align-center ga-2">
            <!-- `flex-grow-0`: `v-checkbox-btn` crece por defecto y dejaba el título en media fila. -->
            <v-checkbox-btn v-model="row.picked" class="flex-grow-0" :aria-label="row.title" />
            <v-text-field v-model="row.title" :disabled="!row.picked" class="flex-grow-1" />
            <v-chip v-if="row.estimatedMinutes" size="small" prepend-icon="mdi-timer-outline">{{ formatMinutes(row.estimatedMinutes) }}</v-chip>
          </div>
          <div class="text-body-small text-medium-emphasis">{{ t('projects.ai.note') }}</div>
        </template>
      </v-card-text>
      <v-card-actions class="flex-wrap ga-2">
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</v-btn>
        <v-btn variant="flat" color="primary" :loading="saving" :disabled="loading || !picked.length" @click="create">
          {{ t('projects.ai.createSubtasks', { n: picked.length }) }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
