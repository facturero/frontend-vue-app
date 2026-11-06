<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { projectsApi } from '@/api/projects';
import { useProjectsStore } from '@/stores/projects';
import { extractError } from '@/utils/error';
import { displayName } from '@/utils/projects';
import type { FormInput, FormQuestion, ProjectForm, QuestionType } from '@/types/projects';

/**
 * Formularios de solicitud del proyecto (entregable 7), como los de Asana: un enlace que cualquiera de la organización llena (aunque
 * no sea miembro) y que crea una tarea en la sección elegida, con su responsable. Quien la pide queda como seguidor de SU tarea.
 */
const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();
const { t } = useI18n();
const store = useProjectsStore();

const TYPES: QuestionType[] = ['text', 'long_text', 'date', 'select'];
const forms = ref<ProjectForm[]>([]);
const failure = ref<string | null>(null);
const copied = ref<string | null>(null);
const editing = ref<(FormInput & { id: string | null; optionsText: string[] }) | null>(null);
const saving = ref(false);

async function load(): Promise<void> {
  if (!store.current) return;
  try {
    forms.value = await projectsApi.forms(store.current.id);
  } catch (err) {
    failure.value = extractError(err);
  }
}
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    editing.value = null;
    void load();
  },
);

const sectionItems = computed(() => store.sections.map((s) => ({ value: s.id, title: s.name })));
const people = computed(() => store.directory.map((u) => ({ value: u.id, title: displayName(u) })));
const link = (f: ProjectForm) => `${window.location.origin}/project-forms/${f.id}`;

async function copy(f: ProjectForm): Promise<void> {
  try {
    await navigator.clipboard.writeText(link(f));
    copied.value = f.id;
  } catch {
    copied.value = null;
  }
}

function startNew(): void {
  editing.value = {
    id: null,
    title: '',
    description: null,
    questions: [],
    optionsText: [],
    sectionId: store.sections[0]?.id ?? null,
    assigneeUserId: null,
    enabled: true,
  };
}

function startEdit(f: ProjectForm): void {
  editing.value = { ...f, questions: f.questions.map((q) => ({ ...q })), optionsText: f.questions.map((q) => q.options.join(', ')) };
}

function addQuestion(): void {
  if (!editing.value) return;
  editing.value.questions.push({ label: '', type: 'text', required: false, options: [], mapsToDue: false });
  editing.value.optionsText.push('');
}

function removeQuestion(i: number): void {
  editing.value?.questions.splice(i, 1);
  editing.value?.optionsText.splice(i, 1);
}

const valid = computed(() => !!editing.value?.title.trim() && editing.value.questions.every((q, i) => q.label.trim() && (q.type !== 'select' || editing.value!.optionsText[i]!.trim())));

async function save(): Promise<void> {
  const e = editing.value;
  if (!e || !store.current || !valid.value) return;
  saving.value = true;
  failure.value = null;
  const questions: FormQuestion[] = e.questions.map((q, i) => ({
    ...q,
    label: q.label.trim(),
    options: q.type === 'select' ? e.optionsText[i]!.split(',').map((o) => o.trim()).filter(Boolean) : [],
    mapsToDue: q.type === 'date' && q.mapsToDue,
  }));
  const body: FormInput = { title: e.title.trim(), description: e.description?.trim() || null, questions, sectionId: e.sectionId, assigneeUserId: e.assigneeUserId, enabled: e.enabled };
  try {
    if (e.id) await projectsApi.updateForm(e.id, body);
    else await projectsApi.createForm(store.current.id, body);
    editing.value = null;
    await load();
  } catch (err) {
    failure.value = extractError(err);
  } finally {
    saving.value = false;
  }
}

async function remove(f: ProjectForm): Promise<void> {
  try {
    await projectsApi.deleteForm(f.id);
    await load();
  } catch (err) {
    failure.value = extractError(err);
  }
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="720" scrollable @update:model-value="emit('update:modelValue', $event)">
    <v-card>
      <v-card-title>{{ t('projects.forms.title') }}</v-card-title>
      <v-card-text class="d-flex flex-column ga-4">
        <div class="text-body-medium text-medium-emphasis">{{ t('projects.forms.hint') }}</div>
        <v-alert v-if="failure" type="error" closable @click:close="failure = null">{{ failure }}</v-alert>

        <template v-if="!editing">
          <v-card v-for="f in forms" :key="f.id" variant="outlined" class="pa-4">
            <div class="d-flex align-center flex-wrap ga-2">
              <v-icon icon="mdi-form-select" color="primary" />
              <span class="text-body-large font-weight-medium flex-grow-1">{{ f.title }}</span>
              <v-chip v-if="!f.enabled" size="x-small">{{ t('projects.forms.closed') }}</v-chip>
              <v-chip size="x-small">{{ t('projects.forms.submissions', f.submissionCount) }}</v-chip>
              <v-btn size="small" variant="text" :prepend-icon="copied === f.id ? 'mdi-check' : 'mdi-link-variant'" @click="copy(f)">
                {{ copied === f.id ? t('projects.forms.copied') : t('projects.forms.copyLink') }}
              </v-btn>
              <v-btn size="small" variant="text" :to="`/project-forms/${f.id}`" prepend-icon="mdi-open-in-new">{{ t('projects.forms.open') }}</v-btn>
              <v-btn icon="mdi-pencil-outline" size="small" variant="text" :aria-label="t('common.edit')" @click="startEdit(f)" />
              <v-btn icon="mdi-trash-can-outline" size="small" variant="text" :aria-label="t('common.delete')" @click="remove(f)" />
            </div>
          </v-card>
          <div v-if="!forms.length" class="text-body-medium text-medium-emphasis">{{ t('projects.forms.empty') }}</div>
          <v-btn color="primary" prepend-icon="mdi-plus" class="align-self-start" @click="startNew">{{ t('projects.forms.new') }}</v-btn>
        </template>

        <v-card v-else variant="tonal" class="pa-4 d-flex flex-column ga-2">
          <v-text-field v-model="editing.title" :label="t('projects.forms.formTitle')" :counter="120" autofocus />
          <v-textarea v-model="editing.description" :label="t('projects.forms.description')" rows="2" auto-grow :counter="1000" />
          <div class="d-flex flex-column flex-sm-row ga-2">
            <v-select v-model="editing.sectionId" :items="sectionItems" :label="t('projects.forms.section')" />
            <v-autocomplete v-model="editing.assigneeUserId" :items="people" :label="t('projects.forms.assignee')" clearable />
          </div>
          <v-switch v-model="editing.enabled" :label="t('projects.forms.open_')" />
          <div class="text-body-medium font-weight-medium">{{ t('projects.forms.questions') }}</div>
          <div class="text-body-small text-medium-emphasis">{{ t('projects.forms.titleAlways') }}</div>
          <v-card v-for="(q, i) in editing.questions" :key="i" variant="outlined" class="pa-2 d-flex flex-column ga-2">
            <div class="d-flex flex-column flex-sm-row ga-2">
              <v-text-field v-model="q.label" :label="t('projects.forms.question')" :counter="200" />
              <v-select v-model="q.type" :items="TYPES.map((v) => ({ value: v, title: t(`projects.forms.type.${v}`) }))" :label="t('projects.fields.typeLabel')" />
              <v-btn icon="mdi-close" size="small" variant="text" :aria-label="t('common.delete')" @click="removeQuestion(i)" />
            </div>
            <v-text-field v-if="q.type === 'select'" v-model="editing.optionsText[i]" :label="t('projects.forms.options')" :hint="t('projects.forms.optionsHint')" persistent-hint />
            <div class="d-flex flex-wrap ga-4">
              <v-checkbox v-model="q.required" :label="t('projects.forms.required')" density="compact" hide-details />
              <v-checkbox v-if="q.type === 'date'" v-model="q.mapsToDue" :label="t('projects.forms.mapsToDue')" density="compact" hide-details />
            </div>
          </v-card>
          <v-btn v-if="editing.questions.length < 20" variant="text" size="small" prepend-icon="mdi-plus" class="align-self-start" @click="addQuestion">{{ t('projects.forms.addQuestion') }}</v-btn>
          <div class="d-flex ga-2">
            <v-spacer />
            <v-btn variant="text" @click="editing = null">{{ t('common.cancel') }}</v-btn>
            <v-btn color="primary" :disabled="!valid" :loading="saving" @click="save">{{ t('common.save') }}</v-btn>
          </div>
        </v-card>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">{{ t('common.close') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
