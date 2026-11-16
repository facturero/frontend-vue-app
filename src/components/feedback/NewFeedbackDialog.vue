<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { useAuthStore } from '@/stores/auth';
import { feedbackApi } from '@/api/feedback';
import { extractError } from '@/utils/error';
import type { FeedbackKind } from '@/types/feedback';

/**
 * Mandar una mejora, un comentario o un problema. Lo lee el equipo de la plataforma y responde aquí mismo; si una mejora se acepta, la
 * empresa gana puntos de fidelidad. El nombre de la empresa viaja solo para mostrarlo (la empresa la identifica el token).
 */
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ created: [] }>();
const { t } = useI18n();
const { xs } = useDisplay();
const auth = useAuthStore();

const kind = ref<FeedbackKind>('improvement');
const title = ref('');
const body = ref('');
const busy = ref(false);
const failure = ref<string | null>(null);

watch(open, (v) => {
  if (!v) return;
  kind.value = 'improvement';
  title.value = '';
  body.value = '';
  failure.value = null;
});

async function send(): Promise<void> {
  if (!title.value.trim() || !body.value.trim()) return;
  busy.value = true;
  failure.value = null;
  try {
    const user = auth.user as { orgName?: string } | null;
    await feedbackApi.submit({ kind: kind.value, title: title.value.trim(), body: body.value.trim(), organizationName: user?.orgName ?? null, urlPath: window.location.pathname });
    open.value = false;
    emit('created');
  } catch (e) {
    failure.value = extractError(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="600" :fullscreen="xs">
    <v-card>
      <v-card-title>{{ t('feedbackBox.newTitle') }}</v-card-title>
      <v-card-text class="d-flex flex-column ga-4">
        <v-alert v-if="failure" type="error" :text="failure" />
        <v-btn-toggle v-model="kind" mandatory color="primary" divided density="comfortable" class="align-self-start" data-kind-toggle>
          <v-btn value="improvement" prepend-icon="mdi-lightbulb-on-outline">{{ t('feedbackBox.kind.improvement') }}</v-btn>
          <v-btn value="comment" prepend-icon="mdi-comment-text-outline">{{ t('feedbackBox.kind.comment') }}</v-btn>
          <v-btn value="problem" prepend-icon="mdi-bug-outline">{{ t('feedbackBox.kind.problem') }}</v-btn>
        </v-btn-toggle>
        <div class="text-body-small text-medium-emphasis">{{ t(`feedbackBox.kindHint.${kind}`) }}</div>
        <v-text-field v-model="title" :label="t('feedbackBox.titleLabel')" maxlength="160" counter autofocus />
        <v-textarea v-model="body" :label="t('feedbackBox.bodyLabel')" :placeholder="t(`feedbackBox.bodyHint.${kind}`)" rows="5" auto-grow maxlength="4000" counter />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">{{ t('common.cancel') }}</v-btn>
        <v-btn color="primary" variant="flat" :disabled="!title.trim() || !body.trim()" :loading="busy" @click="send">{{ t('feedbackBox.send') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
