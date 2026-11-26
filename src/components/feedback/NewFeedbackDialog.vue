<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { useAuthStore } from '@/stores/auth';
import { feedbackApi } from '@/api/feedback';
import { extractError } from '@/utils/error';
import { docHasContent, FEEDBACK_IMAGE_TYPES, FeedbackImageError, uploadFeedbackImage } from '@/composable/useFeedbackImages';
import type { FeedbackKind } from '@/types/feedback';
import type { RichDoc } from '@/types/projects';
import RichTextEditor from '@/components/projects/RichTextEditor.vue';

/**
 * Mandar una mejora, un comentario o un problema. Lo lee el equipo de la plataforma y responde aquí mismo; si una mejora se acepta, la
 * empresa gana puntos de fidelidad. El nombre de la empresa viaja solo para mostrarlo (la empresa la identifica el token).
 *
 * El texto se escribe con el mismo editor que la conversación (el de Proyectos): se puede pegar una captura con Ctrl+V, soltarla o
 * usar el clip, que es lo que más ayuda a entender un problema. Las capturas propias se ven desde document-service (son de la misma
 * empresa); el dueño, de otra, las ve por feedback-service.
 */
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ created: [] }>();
const { t } = useI18n();
const { xs } = useDisplay();
const auth = useAuthStore();

const kind = ref<FeedbackKind>('improvement');
const title = ref('');
const body = ref<RichDoc | null>(null);
const busy = ref(false);
const failure = ref<string | null>(null);
// Mientras una captura se sube, «Enviar» espera: si no, el envío saldría sin ella.
const uploading = ref(0);

watch(open, (v) => {
  if (!v) return;
  kind.value = 'improvement';
  title.value = '';
  body.value = null;
  failure.value = null;
});

const canSend = computed(() => !!title.value.trim() && docHasContent(body.value) && !uploading.value);

async function upload(file: File): Promise<string | null> {
  uploading.value += 1;
  failure.value = null;
  try {
    // Aún no hay envío al que colgarla: queda a nombre de la persona (feedback-service solo exige que la haya subido ella).
    return await uploadFeedbackImage(file, auth.user?.id ?? 'new');
  } catch (e) {
    failure.value = e instanceof FeedbackImageError ? t(e.reason === 'type' ? 'feedbackBox.imageType' : 'feedbackBox.imageSize') : extractError(e);
    return null;
  } finally {
    uploading.value -= 1;
  }
}

async function send(): Promise<void> {
  if (!canSend.value) return;
  busy.value = true;
  failure.value = null;
  try {
    const user = auth.user as { orgName?: string } | null;
    await feedbackApi.submit({ kind: kind.value, title: title.value.trim(), bodyDoc: body.value, organizationName: user?.orgName ?? null, urlPath: window.location.pathname });
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
        <div class="d-flex flex-column ga-2" data-new-body>
          <div class="text-body-medium text-medium-emphasis">{{ t('feedbackBox.bodyLabel') }}</div>
          <RichTextEditor
            v-model="body"
            :placeholder="t(`feedbackBox.bodyHint.${kind}`)"
            :upload-file="upload"
            :mentions="false"
            :accept="FEEDBACK_IMAGE_TYPES.join(',')"
            @submit="send"
          />
          <div class="text-body-small text-medium-emphasis">{{ t('feedbackBox.imageHint') }}</div>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">{{ t('common.cancel') }}</v-btn>
        <v-btn color="primary" variant="flat" :disabled="!canSend" :loading="busy" @click="send">{{ t('feedbackBox.send') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
