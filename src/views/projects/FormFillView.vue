<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import DateField from '@/components/ui/DateField.vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import PageHeader from '@/components/ui/PageHeader.vue';
import { projectsApi } from '@/api/projects';
import { extractError } from '@/utils/error';
import type { PublicForm } from '@/types/projects';

/**
 * Llenar un formulario de solicitud (entregable 7). Lo abre cualquiera de la organización con el enlace, aunque no sea miembro del
 * proyecto: la solicitud se convierte en una tarea que quien la envió sigue desde «Mis tareas».
 */
const { t } = useI18n();
const route = useRoute();
const form = ref<PublicForm | null>(null);
const title = ref('');
const answers = ref<Record<string, string>>({});
const failure = ref<string | null>(null);
const sending = ref(false);
const sentTaskId = ref<string | null>(null);

onMounted(async () => {
  try {
    form.value = await projectsApi.publicForm(String(route.params.id));
  } catch (err) {
    failure.value = extractError(err);
  }
});

const valid = computed(() => !!title.value.trim() && !!form.value?.questions.every((q) => !q.required || !!answers.value[q.id]?.trim()));

async function send(): Promise<void> {
  if (!form.value || !valid.value) return;
  sending.value = true;
  failure.value = null;
  try {
    sentTaskId.value = (await projectsApi.submitForm(form.value.id, title.value.trim(), answers.value)).taskId;
  } catch (err) {
    failure.value = extractError(err);
  } finally {
    sending.value = false;
  }
}

function again(): void {
  sentTaskId.value = null;
  title.value = '';
  answers.value = {};
}
</script>

<template>
  <v-container>
    <PageHeader :title="form?.title ?? t('projects.forms.fillTitle')" :subtitle="form ? t('projects.forms.forProject', { project: form.projectName }) : undefined" />
    <v-alert v-if="failure" type="error" class="mb-4">{{ failure }}</v-alert>

    <v-card v-if="sentTaskId" class="pa-6 text-center">
      <v-icon icon="mdi-check-circle" color="success" size="48" class="mb-2" />
      <div class="text-title-large mb-2">{{ t('projects.forms.sent') }}</div>
      <div class="text-body-medium text-medium-emphasis mb-4">{{ t('projects.forms.sentHint') }}</div>
      <div class="d-flex justify-center flex-wrap ga-2">
        <v-btn color="primary" :to="{ path: '/my-tasks', query: { task: sentTaskId } }">{{ t('projects.forms.seeRequest') }}</v-btn>
        <v-btn variant="text" @click="again">{{ t('projects.forms.another') }}</v-btn>
      </div>
    </v-card>

    <v-card v-else-if="form" class="pa-6 d-flex flex-column ga-4">
      <div v-if="form.description" class="text-body-large">{{ form.description }}</div>
      <v-text-field v-model="title" :label="t('projects.forms.whatNeed')" :counter="500" autofocus />
      <template v-for="q in form.questions" :key="q.id">
        <v-textarea v-if="q.type === 'long_text'" v-model="answers[q.id]" :label="q.label + (q.required ? ' *' : '')" rows="3" auto-grow />
        <DateField
          v-else-if="q.type === 'date'"
          :model-value="answers[q.id]"
          :label="q.label + (q.required ? ' *' : '')"
          @update:model-value="(v) => (answers[q.id] = v ?? '')"
        />
        <v-select v-else-if="q.type === 'select'" v-model="answers[q.id]" :items="q.options" :label="q.label + (q.required ? ' *' : '')" clearable />
        <v-text-field v-else v-model="answers[q.id]" :label="q.label + (q.required ? ' *' : '')" />
      </template>
      <div class="d-flex">
        <v-spacer />
        <v-btn color="primary" :disabled="!valid" :loading="sending" prepend-icon="mdi-send" @click="send">{{ t('projects.forms.send') }}</v-btn>
      </div>
    </v-card>
  </v-container>
</template>
