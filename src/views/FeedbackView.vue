<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import { feedbackApi } from '@/api/feedback';
import { useFeedbackStore } from '@/stores/feedback';
import { useNotify } from '@/composable/useNotify';
import { extractError } from '@/utils/error';
import { formatDate, formatRelative } from '@/utils/format';
import type { FeedbackDetail, FeedbackItem, PointsEntry } from '@/types/feedback';
import PageHeader from '@/components/ui/PageHeader.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import FeedbackStatusChip from '@/components/feedback/FeedbackStatusChip.vue';
import FeedbackConversation from '@/components/feedback/FeedbackConversation.vue';
import NewFeedbackDialog from '@/components/feedback/NewFeedbackDialog.vue';

/**
 * «Comentarios y mejoras» (feedback-service): cualquiera manda mejoras, comentarios o problemas y conversa con el equipo de la
 * plataforma. Arriba, los puntos de fidelidad de la empresa (se ganan cuando una mejora se acepta o se implementa); abajo, lo que
 * mandé, con lo nuevo marcado. En la computadora la conversación va al lado; en el teléfono, a pantalla completa.
 */
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const { smAndDown } = useDisplay();
const store = useFeedbackStore();
const notify = useNotify();

const items = ref<FeedbackItem[]>([]);
const nextCursor = ref<string | null>(null);
const loading = ref(true);
const failure = ref<string | null>(null);
const points = ref<{ balance: number; entries: PointsEntry[] }>({ balance: 0, entries: [] });
const showMovements = ref(false);
const creating = ref(false);
const detail = ref<FeedbackDetail | null>(null);
const busy = ref(false);
const selectedId = computed(() => (typeof route.query.id === 'string' ? route.query.id : null));

const KIND_ICON = { improvement: 'mdi-lightbulb-on-outline', comment: 'mdi-comment-text-outline', problem: 'mdi-bug-outline' } as const;

async function load(more = false): Promise<void> {
  // Solo la primera carga muestra la ruedita: al recargar (tras contestar o mandar) la lista y la conversación abierta se quedan.
  if (!more && !items.value.length) loading.value = true;
  failure.value = null;
  try {
    const [page, pts] = await Promise.all([feedbackApi.mine({ cursor: more ? nextCursor.value ?? undefined : undefined }), more ? Promise.resolve(points.value) : feedbackApi.points()]);
    items.value = more ? [...items.value, ...page.items] : page.items;
    nextCursor.value = page.nextCursor;
    points.value = pts;
  } catch (e) {
    failure.value = extractError(e);
  } finally {
    loading.value = false;
  }
}

async function openItem(id: string | null): Promise<void> {
  if (!id) {
    detail.value = null;
    return;
  }
  try {
    detail.value = await feedbackApi.get(id);
    // Abrirlo lo marca leído: se refleja en la lista y en el menú.
    const row = items.value.find((i) => i.id === id);
    if (row) row.unread = false;
    void store.refresh();
  } catch (e) {
    notify.error(extractError(e));
    void router.replace({ query: {} });
  }
}

function select(id: string): void {
  void router.replace({ query: { id } });
}

async function reply(body: string): Promise<void> {
  if (!detail.value) return;
  busy.value = true;
  try {
    await feedbackApi.reply(detail.value.item.id, body);
    detail.value = await feedbackApi.get(detail.value.item.id);
    await load();
  } catch (e) {
    notify.error(extractError(e));
  } finally {
    busy.value = false;
  }
}

function created(): void {
  notify.success(t('feedbackBox.sent'));
  void load();
}

watch(selectedId, (id) => void openItem(id));
onMounted(async () => {
  await load();
  if (selectedId.value) void openItem(selectedId.value);
});
</script>

<template>
  <div>
    <PageHeader :title="t('feedbackBox.title')" :subtitle="t('feedbackBox.subtitle')">
      <template #actions>
        <v-btn color="primary" variant="flat" prepend-icon="mdi-plus" data-new-feedback @click="creating = true">{{ t('feedbackBox.new') }}</v-btn>
      </template>
    </PageHeader>

    <!-- Puntos de la empresa -->
    <v-card class="mb-4" data-points>
      <v-card-text class="d-flex align-center ga-4">
        <v-avatar color="lightwarning" size="48"><v-icon icon="mdi-star-circle-outline" color="warning" /></v-avatar>
        <div class="flex-grow-1">
          <div class="text-body-medium text-medium-emphasis">{{ t('feedbackBox.companyPoints') }}</div>
          <div class="text-title-large" data-balance>{{ points.balance }}</div>
          <div class="text-body-small text-medium-emphasis">{{ t('feedbackBox.pointsHint') }}</div>
        </div>
        <v-btn v-if="points.entries.length" variant="text" @click="showMovements = !showMovements">
          {{ t(showMovements ? 'feedbackBox.hideMovements' : 'feedbackBox.showMovements') }}
        </v-btn>
      </v-card-text>
      <v-expand-transition>
        <v-list v-if="showMovements" density="compact" class="pt-0">
          <v-list-item v-for="e in points.entries" :key="e.id" :title="e.reason" :subtitle="formatDate(e.createdAt)">
            <template #append>
              <span class="font-weight-medium" :class="e.amount > 0 ? 'text-success' : 'text-error'">{{ e.amount > 0 ? '+' : '' }}{{ e.amount }}</span>
            </template>
          </v-list-item>
        </v-list>
      </v-expand-transition>
    </v-card>

    <v-alert v-if="failure" type="error" class="mb-4" :text="failure" />
    <div v-else-if="loading" class="d-flex justify-center pa-6"><v-progress-circular indeterminate color="primary" /></div>
    <v-card v-else-if="!items.length">
      <EmptyState icon="mdi-lightbulb-on-outline" :title="t('feedbackBox.emptyTitle')" :text="t('feedbackBox.emptyText')" :action-text="t('feedbackBox.new')" action-icon="mdi-plus" @action="creating = true" />
    </v-card>
    <v-row v-else>
      <v-col cols="12" :md="detail && !smAndDown ? 5 : 12">
        <v-card>
          <v-list lines="two">
            <v-list-item v-for="i in items" :key="i.id" :active="i.id === selectedId" :data-feedback="i.id" @click="select(i.id)">
              <template #prepend>
                <v-badge :model-value="i.unread" dot color="error" location="top end">
                  <v-avatar color="lightprimary" size="36"><v-icon :icon="KIND_ICON[i.kind]" color="primary" size="20" /></v-avatar>
                </v-badge>
              </template>
              <v-list-item-title :class="{ 'font-weight-bold': i.unread }">{{ i.title }}</v-list-item-title>
              <v-list-item-subtitle>{{ t(`feedbackBox.kind.${i.kind}`) }} · {{ formatRelative(i.lastActivityAt) }}<template v-if="i.replyCount"> · {{ t('feedbackBox.replies', { n: i.replyCount }, i.replyCount) }}</template></v-list-item-subtitle>
              <template #append><FeedbackStatusChip :status="i.status" /></template>
            </v-list-item>
          </v-list>
          <div v-if="nextCursor" class="d-flex justify-center pb-4"><v-btn variant="text" @click="load(true)">{{ t('feedbackBox.more') }}</v-btn></div>
        </v-card>
      </v-col>
      <v-col v-if="detail && !smAndDown" cols="12" md="7">
        <v-card class="pa-6">
          <FeedbackConversation :key="`${detail.item.id}-${detail.item.status}-${detail.replies.length}-${detail.points.length}`" :detail="detail" mode="author" :busy="busy" @reply="reply" />
        </v-card>
      </v-col>
    </v-row>

    <!-- En el teléfono, la conversación a pantalla completa. -->
    <v-dialog :model-value="!!detail && smAndDown" fullscreen @update:model-value="(v) => !v && router.replace({ query: {} })">
      <v-card v-if="detail">
        <v-card-title class="d-flex align-center">
          <span class="flex-grow-1 text-truncate">{{ t('feedbackBox.title') }}</span>
          <v-btn icon="mdi-close" variant="text" size="small" :aria-label="t('common.close')" @click="router.replace({ query: {} })" />
        </v-card-title>
        <v-card-text><FeedbackConversation :key="`${detail.item.id}-${detail.item.status}-${detail.replies.length}-${detail.points.length}`" :detail="detail" mode="author" :busy="busy" @reply="reply" /></v-card-text>
      </v-card>
    </v-dialog>

    <NewFeedbackDialog v-model="creating" @created="created" />
  </div>
</template>
