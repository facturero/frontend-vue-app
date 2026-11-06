<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import DateField from '@/components/ui/DateField.vue';
import { useI18n } from 'vue-i18n';
import { projectsApi } from '@/api/projects';
import { useProjectsStore } from '@/stores/projects';
import { localIsoDate } from '@/utils/projects';
import type { ProjectTemplate, Visibility } from '@/types/projects';

/**
 * «Nuevo proyecto» al estilo Asana: en blanco o desde una plantilla de fábrica (incorporación de cliente, cierre contable, obra…).
 * Una plantilla trae secciones, tareas con fechas relativas al día de inicio, hitos y dependencias: elegir el inicio basta para que
 * el cronograma salga armado.
 */
const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [boolean]; blank: []; saved: [string] }>();
const { t, locale } = useI18n();
const store = useProjectsStore();

const templates = ref<ProjectTemplate[]>([]);
const chosen = ref<ProjectTemplate | null>(null);
const name = ref('');
const visibility = ref<Visibility>('organization');
const startOn = ref<string | null>(localIsoDate(new Date()));
const saving = ref(false);
const failure = ref<string | null>(null);

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return;
    chosen.value = null;
    failure.value = null;
    try {
      templates.value = await projectsApi.templates(locale.value);
    } catch {
      templates.value = [];
    }
  },
);

function choose(template: ProjectTemplate): void {
  chosen.value = template;
  name.value = template.name;
  startOn.value = localIsoDate(new Date());
}

const valid = computed(() => !!chosen.value && name.value.trim().length > 0 && name.value.trim().length <= 120 && !!startOn.value);

async function create(): Promise<void> {
  if (!valid.value || !chosen.value || !startOn.value) return;
  saving.value = true;
  failure.value = null;
  try {
    const project = await store.createFromTemplate({
      templateCode: chosen.value.code,
      name: name.value.trim(),
      visibility: visibility.value,
      startOn: startOn.value,
      locale: locale.value,
    });
    emit('update:modelValue', false);
    emit('saved', project.id);
  } catch {
    failure.value = store.notice;
  } finally {
    saving.value = false;
  }
}

function blank(): void {
  emit('update:modelValue', false);
  emit('blank');
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="880" scrollable @update:model-value="emit('update:modelValue', $event)">
    <v-card>
      <v-card-title>{{ chosen ? chosen.name : t('projects.templates.title') }}</v-card-title>
      <v-card-text>
        <template v-if="!chosen">
          <v-row>
            <v-col cols="12" sm="6" md="4">
              <v-card variant="outlined" class="h-100" @click="blank">
                <v-card-item>
                  <template #prepend>
                    <v-avatar color="lightprimary" rounded="lg"><v-icon icon="mdi-plus" color="primary" /></v-avatar>
                  </template>
                  <v-card-title>{{ t('projects.templates.blank') }}</v-card-title>
                  <v-card-subtitle>{{ t('projects.templates.blankHint') }}</v-card-subtitle>
                </v-card-item>
              </v-card>
            </v-col>
            <v-col v-for="tpl in templates" :key="tpl.code" cols="12" sm="6" md="4">
              <v-card variant="outlined" class="h-100" @click="choose(tpl)">
                <v-card-item>
                  <template #prepend>
                    <v-avatar :color="tpl.color" rounded="lg"><v-icon :icon="tpl.icon" /></v-avatar>
                  </template>
                  <v-card-title>{{ tpl.name }}</v-card-title>
                  <v-card-subtitle>{{ t('projects.templates.tasks', tpl.taskCount) }}</v-card-subtitle>
                </v-card-item>
                <v-card-text class="text-body-medium text-medium-emphasis">{{ tpl.description }}</v-card-text>
              </v-card>
            </v-col>
          </v-row>
        </template>

        <div v-else class="d-flex flex-column ga-4">
          <v-alert v-if="failure" type="error">{{ failure }}</v-alert>
          <div class="text-body-medium text-medium-emphasis">{{ chosen.description }}</div>
          <div class="d-flex flex-wrap ga-2">
            <v-chip v-for="s in chosen.sections" :key="s" size="small" prepend-icon="mdi-view-column-outline">{{ s }}</v-chip>
          </div>
          <v-text-field v-model="name" :label="t('projects.form.name')" :counter="120" autofocus />
          <DateField v-model="startOn" :label="t('projects.templates.startOn')" :hint="t('projects.templates.startHint')" persistent-hint />
          <v-radio-group v-model="visibility" :label="t('projects.form.visibility')">
            <v-radio value="organization" :label="t('projects.visibility.organization')" />
            <v-radio value="members" :label="t('projects.visibility.members')" />
          </v-radio-group>
        </div>
      </v-card-text>
      <v-card-actions class="flex-wrap ga-2">
        <v-btn v-if="chosen" variant="text" prepend-icon="mdi-arrow-left" @click="chosen = null">{{ t('projects.templates.back') }}</v-btn>
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</v-btn>
        <v-btn variant="flat" v-if="chosen" color="primary" :loading="saving" :disabled="!valid" @click="create">{{ t('projects.form.create') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
