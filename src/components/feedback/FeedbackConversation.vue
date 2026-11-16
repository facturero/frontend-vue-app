<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatDateTime } from '@/utils/format';
import { FEEDBACK_STATUSES, type FeedbackDetail, type FeedbackStatus, type RespondInput } from '@/types/feedback';
import FeedbackStatusChip from './FeedbackStatusChip.vue';

/**
 * Un comentario o mejora con su conversación. La misma pieza para los dos lados:
 *   - `author` (la persona): lee las respuestas y contesta;
 *   - `platform` (el dueño): ve quién y de qué empresa, y responde en una sola acción con texto, estado y puntos para la empresa.
 *     Al elegir «aceptada» o «implementada» se proponen los puntos sugeridos; él confirma, cambia el monto o no da nada.
 */
const props = defineProps<{ detail: FeedbackDetail; mode: 'author' | 'platform'; busy?: boolean; suggestions?: Partial<Record<FeedbackStatus, number>> }>();
const emit = defineEmits<{ reply: [string]; respond: [RespondInput] }>();
const { t } = useI18n();

const KIND_ICON = { improvement: 'mdi-lightbulb-on-outline', comment: 'mdi-comment-text-outline', problem: 'mdi-bug-outline' } as const;
const item = computed(() => props.detail.item);
/** Fondo de las respuestas de la plataforma con el token, sin `bg-lightprimary`: esa utilidad tiñe también el texto de azul. */
const PLATFORM_BG = { backgroundColor: 'rgb(var(--v-theme-lightprimary))' };
const earned = computed(() => props.detail.points.reduce((n, p) => n + p.amount, 0));

const text = ref('');
const status = ref<FeedbackStatus>(props.detail.item.status);
const givePoints = ref(false);
const amount = ref<number | null>(null);
const reason = ref('');

// Otro envío abierto, o el mismo recién respondido: el formulario arranca limpio con el estado actual.
watch(
  () => [props.detail.item.id, props.detail.item.status, props.detail.replies.length, props.detail.points.length] as const,
  () => {
    text.value = '';
    status.value = props.detail.item.status;
    givePoints.value = false;
    amount.value = null;
    reason.value = '';
  },
);
// Al pasar a «aceptada» o «implementada», se proponen los puntos sugeridos (se pueden cambiar o quitar).
watch(status, (s) => {
  const suggested = props.suggestions?.[s];
  if (props.mode === 'platform' && suggested && s !== props.detail.item.status) {
    givePoints.value = true;
    amount.value = suggested;
  }
});

const statusItems = computed(() => FEEDBACK_STATUSES.map((s) => ({ value: s, title: t(`feedbackBox.status.${s}`) })));
const canSend = computed(() => {
  if (props.mode === 'author') return !!text.value.trim();
  const pointsOk = !givePoints.value || (!!amount.value && amount.value > 0);
  return pointsOk && (!!text.value.trim() || status.value !== item.value.status || givePoints.value);
});

function send(): void {
  if (!canSend.value) return;
  if (props.mode === 'author') return emit('reply', text.value.trim());
  emit('respond', {
    body: text.value.trim() || null,
    status: status.value !== item.value.status ? status.value : undefined,
    // La clave evita que un doble clic (o un reintento tras un corte) dé los puntos dos veces.
    points: givePoints.value && amount.value ? { amount: amount.value, reason: reason.value.trim() || null, idempotencyKey: crypto.randomUUID() } : null,
  });
}
</script>

<template>
  <div class="d-flex flex-column ga-4">
    <!-- Encabezado -->
    <div>
      <div class="d-flex align-center ga-2 mb-1">
        <v-icon :icon="KIND_ICON[item.kind]" size="small" class="text-medium-emphasis" />
        <span class="text-body-small text-medium-emphasis">{{ t(`feedbackBox.kind.${item.kind}`) }} · {{ formatDateTime(item.createdAt) }}</span>
        <v-spacer />
        <FeedbackStatusChip :status="item.status" />
      </div>
      <div class="text-title-large">{{ item.title }}</div>
      <div v-if="mode === 'platform'" class="text-body-medium text-medium-emphasis" data-author>
        {{ item.authorName || t('feedbackBox.unknownPerson') }}<template v-if="item.authorEmail"> · {{ item.authorEmail }}</template>
        · {{ item.organizationName || item.organizationId }}
      </div>
    </div>

    <v-sheet class="border rounded pa-4">
      <div class="text-body-medium text-pre-wrap">{{ item.body }}</div>
      <div v-if="item.traceId || item.urlPath" class="text-body-small text-medium-emphasis mt-2">
        <template v-if="item.urlPath">{{ t('feedbackBox.screen') }}: {{ item.urlPath }}</template>
        <template v-if="item.traceId"> · {{ t('feedbackBox.traceCode') }}: <code>{{ item.traceId }}</code></template>
      </div>
    </v-sheet>

    <v-alert v-if="earned" type="success" data-earned>
      {{ t('feedbackBox.earned', { n: earned }) }}
    </v-alert>

    <!-- Conversación -->
    <div v-if="detail.replies.length" class="d-flex flex-column ga-2">
      <div
        v-for="r in detail.replies"
        :key="r.id"
        class="rounded pa-3"
        :class="r.fromPlatform ? undefined : 'border'"
        :style="r.fromPlatform ? PLATFORM_BG : undefined"
        :data-reply="r.fromPlatform ? 'platform' : 'author'"
      >
        <div class="text-body-small text-medium-emphasis mb-1">
          {{ r.fromPlatform ? t('feedbackBox.platformTeam') : mode === 'author' ? t('feedbackBox.you') : item.authorName || t('feedbackBox.unknownPerson') }}
          · {{ formatDateTime(r.createdAt) }}
        </div>
        <div class="text-body-medium text-pre-wrap">{{ r.body }}</div>
      </div>
    </div>

    <!-- Contestar (persona) o responder (dueño) -->
    <div class="d-flex flex-column ga-2">
      <v-textarea
        v-model="text"
        :label="mode === 'author' ? t('feedbackBox.replyLabel') : t('feedbackBox.respondLabel')"
        rows="3"
        auto-grow
        maxlength="4000"
       
      />
      <template v-if="mode === 'platform'">
        <div class="d-flex flex-wrap ga-4 align-center">
          <v-select v-model="status" :items="statusItems" :label="t('feedbackBox.statusLabel')" hide-details :max-width="240" />
          <v-switch v-model="givePoints" color="primary" :label="t('feedbackBox.givePoints')" hide-details />
        </div>
        <div v-if="givePoints" class="d-flex flex-wrap ga-4">
          <v-text-field v-model.number="amount" type="number" min="1" :label="t('feedbackBox.points')" :max-width="160" />
          <v-text-field v-model="reason" :label="t('feedbackBox.reason')" :placeholder="t('feedbackBox.reasonHint')" maxlength="200" class="flex-grow-1" />
        </div>
      </template>
      <div class="d-flex justify-end">
        <v-btn color="primary" variant="flat" :disabled="!canSend" :loading="busy" prepend-icon="mdi-send" @click="send">
          {{ mode === 'author' ? t('feedbackBox.sendReply') : t('feedbackBox.sendRespond') }}
        </v-btn>
      </div>
    </div>
  </div>
</template>
