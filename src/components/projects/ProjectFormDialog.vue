<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectsStore } from '@/stores/projects';
import type { ProjectColor, ProjectDetail, ProjectView, Visibility } from '@/types/projects';

/** Crear un proyecto o cambiar sus datos. Al crear, las columnas iniciales salen en el idioma de quien lo crea. */
const props = defineProps<{ modelValue: boolean; project?: ProjectDetail | null }>();
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [string] }>();

const { t } = useI18n();
const store = useProjectsStore();

const COLORS: ProjectColor[] = ['primary', 'secondary', 'success', 'warning', 'error', 'info'];
const name = ref('');
const description = ref('');
const visibility = ref<Visibility>('organization');
const color = ref<ProjectColor>('primary');
const defaultView = ref<ProjectView>('list');
const saving = ref(false);
const failure = ref<string | null>(null);

const editing = computed(() => !!props.project);
const valid = computed(() => name.value.trim().length > 0 && name.value.trim().length <= 120);

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    failure.value = null;
    name.value = props.project?.name ?? '';
    description.value = props.project?.description ?? '';
    visibility.value = props.project?.visibility ?? 'organization';
    color.value = props.project?.color ?? 'primary';
    defaultView.value = props.project?.defaultView ?? 'list';
  },
);

async function save(): Promise<void> {
  if (!valid.value) return;
  saving.value = true;
  failure.value = null;
  try {
    const fields = { name: name.value.trim(), description: description.value.trim() || null, visibility: visibility.value, color: color.value, defaultView: defaultView.value };
    if (props.project) {
      await store.updateProject(fields);
      emit('saved', props.project.id);
    } else {
      const created = await store.createProject({
        ...fields,
        sectionNames: [t('projects.defaultSections.todo'), t('projects.defaultSections.doing'), t('projects.defaultSections.done')],
      });
      emit('saved', created.id);
    }
    emit('update:modelValue', false);
  } catch {
    failure.value = store.notice;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="640" @update:model-value="emit('update:modelValue', $event)">
    <v-card>
      <v-card-title>{{ editing ? t('projects.form.editTitle') : t('projects.form.newTitle') }}</v-card-title>
      <v-card-text class="d-flex flex-column ga-4">
        <v-alert v-if="failure" type="error">{{ failure }}</v-alert>
        <v-text-field v-model="name" :label="t('projects.form.name')" :counter="120" autofocus @keyup.enter="save" />
        <!-- `mb-2` en los dos primeros bloques: 24 px entre secciones (campos, visibilidad, color y vista) frente a los 16 px de dentro. -->
        <v-textarea v-model="description" :label="t('projects.form.description')" rows="2" auto-grow class="mb-2" />

        <div class="mb-2">
          <div class="text-body-medium mb-2">{{ t('projects.form.visibility') }}</div>
          <v-radio-group v-model="visibility">
            <v-radio value="organization" class="mb-2">
              <template #label>
                <div>
                  <div>{{ t('projects.visibility.organization') }}</div>
                  <div class="text-body-small text-medium-emphasis">{{ t('projects.visibility.organizationHint') }}</div>
                </div>
              </template>
            </v-radio>
            <v-radio value="members">
              <template #label>
                <div>
                  <div>{{ t('projects.visibility.members') }}</div>
                  <div class="text-body-small text-medium-emphasis">{{ t('projects.visibility.membersHint') }}</div>
                </div>
              </template>
            </v-radio>
          </v-radio-group>
        </div>

        <div class="d-flex flex-column flex-sm-row ga-4">
          <div>
            <div class="text-body-medium mb-2">{{ t('projects.form.color') }}</div>
            <div class="d-flex ga-2">
              <v-btn
                v-for="c in COLORS"
                :key="c"
                :color="c"
                icon
                size="x-small"
                :aria-label="c"
                :aria-pressed="color === c"
                @click="color = c"
              >
                <v-icon v-if="color === c" icon="mdi-check" size="small" />
              </v-btn>
            </div>
          </div>
          <div>
            <div class="text-body-medium mb-2">{{ t('projects.form.defaultView') }}</div>
            <v-btn-toggle v-model="defaultView" mandatory density="compact" color="primary" variant="outlined" divided>
              <v-btn value="list" prepend-icon="mdi-format-list-checkbox">{{ t('projects.views.list') }}</v-btn>
              <v-btn value="board" prepend-icon="mdi-view-column-outline">{{ t('projects.views.board') }}</v-btn>
            </v-btn-toggle>
          </div>
        </div>
      </v-card-text>
      <v-card-actions class="flex-wrap ga-2">
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</v-btn>
        <v-btn variant="flat" color="primary" :loading="saving" :disabled="!valid" @click="save">
          {{ editing ? t('common.save') : t('projects.form.create') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
