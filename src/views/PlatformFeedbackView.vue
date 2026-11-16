<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import { feedbackApi } from '@/api/feedback';
import { useFeedbackStore } from '@/stores/feedback';
import { useNotify } from '@/composable/useNotify';
import { extractError } from '@/utils/error';
import { formatRelative } from '@/utils/format';
import { FEEDBACK_KINDS, FEEDBACK_STATUSES, type FeedbackDetail, type FeedbackItem, type FeedbackKind, type FeedbackStatus, type OrganizationBalance, type RespondInput } from '@/types/feedback';
import PageHeader from '@/components/ui/PageHeader.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import FeedbackStatusChip from '@/components/feedback/FeedbackStatusChip.vue';
import FeedbackConversation from '@/components/feedback/FeedbackConversation.vue';

/**
 * Bandeja del dueño de la plataforma (`feedback:manage`, solo `is_platform_admin`): los comentarios, mejoras y problemas de TODAS las
 * empresas. Responder es una sola acción (texto, estado y puntos para la empresa). En la pestaña de puntos, los saldos por empresa y el
 * ajuste manual (canjes o correcciones, con motivo).
 */
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const { smAndDown } = useDisplay();
const store = useFeedbackStore();
const notify = useNotify();

const tab = ref<'items' | 'points'>('items');
const status = ref<FeedbackStatus | null>(null);
const kind = ref<FeedbackKind | null>(null);
const onlyUnread = ref(false);
const q = ref('');
const items = ref<FeedbackItem[]>([]);
const nextCursor = ref<string | null>(null);
const loading = ref(true);
/** Recarga por un filtro o una búsqueda: la lista y la conversación abierta se quedan (antes se cambiaban por la ruedita y se desmontaba la conversación). */
const refreshing = ref(false);
const failure = ref<string | null>(null);
const detail = ref<FeedbackDetail | null>(null);
const busy = ref(false);
const suggestions = ref<Partial<Record<FeedbackStatus, number>>>({});
const balances = ref<OrganizationBalance[]>([]);
const adjusting = ref(false);
const adjust = ref<{ organizationId: string | null; amount: number | null; reason: string }>({ organizationId: null, amount: null, reason: '' });
const selectedId = computed(() => (typeof route.query.id === 'string' ? route.query.id : null));

// La conversación lleva una `key` con estado, respuestas y puntos: tras responder se rearma limpia (si no, el interruptor de puntos
// quedaba encendido con el monto anterior y otra respuesta los volvía a dar).
const KIND_ICON = { improvement: 'mdi-lightbulb-on-outline', comment: 'mdi-comment-text-outline', problem: 'mdi-bug-outline' } as const;
const statusItems = computed(() => FEEDBACK_STATUSES.map((s) => ({ value: s, title: t(`feedbackBox.status.${s}`) })));
const kindItems = computed(() => FEEDBACK_KINDS.map((k) => ({ value: k, title: t(`feedbackBox.kind.${k}`) })));
const orgItems = computed(() => balances.value.map((b) => ({ value: b.organizationId, title: b.organizationName || b.organizationId })));

let timer: ReturnType<typeof setTimeout> | null = null;
async function load(more = false): Promise<void> {
  if (!more && !items.value.length) loading.value = true;
  else if (!more) refreshing.value = true;
  failure.value = null;
  try {
    const page = await feedbackApi.adminList({ status: status.value ?? undefined, kind: kind.value ?? undefined, unread: onlyUnread.value, q: q.value.trim() || undefined, cursor: more ? nextCursor.value ?? undefined : undefined });
    items.value = more ? [...items.value, ...page.items] : page.items;
    nextCursor.value = page.nextCursor;
  } catch (e) {
    failure.value = extractError(e);
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

async function loadBalances(): Promise<void> {
  try {
    balances.value = await feedbackApi.balances();
  } catch (e) {
    notify.error(extractError(e));
  }
}

async function openItem(id: string | null): Promise<void> {
  if (!id) {
    detail.value = null;
    return;
  }
  try {
    detail.value = await feedbackApi.adminGet(id);
    const row = items.value.find((i) => i.id === id);
    if (row) row.unread = false;
    void store.refresh();
  } catch (e) {
    notify.error(extractError(e));
    void router.replace({ query: {} });
  }
}

async function respond(input: RespondInput): Promise<void> {
  if (!detail.value) return;
  busy.value = true;
  try {
    detail.value = await feedbackApi.respond(detail.value.item.id, input);
    const row = items.value.find((i) => i.id === detail.value!.item.id);
    if (row) Object.assign(row, detail.value.item);
    notify.success(t('feedbackBox.responded'));
    if (input.points) void loadBalances();
  } catch (e) {
    notify.error(extractError(e));
  } finally {
    busy.value = false;
  }
}

async function saveAdjust(): Promise<void> {
  const a = adjust.value;
  if (!a.organizationId || !a.amount || !a.reason.trim()) return;
  busy.value = true;
  try {
    await feedbackApi.adjust({ organizationId: a.organizationId, amount: a.amount, reason: a.reason.trim(), idempotencyKey: crypto.randomUUID() });
    adjusting.value = false;
    notify.success(t('feedbackBox.adjusted'));
    await loadBalances();
  } catch (e) {
    notify.error(extractError(e));
  } finally {
    busy.value = false;
  }
}

function openAdjust(organizationId: string | null = null): void {
  adjust.value = { organizationId, amount: null, reason: '' };
  adjusting.value = true;
}

watch([status, kind, onlyUnread], () => void load());
watch(q, () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void load(), 350);
});
watch(selectedId, (id) => void openItem(id));
watch(tab, (v) => v === 'points' && void loadBalances());
onMounted(async () => {
  void feedbackApi.suggestions().then((s) => (suggestions.value = s)).catch(() => undefined);
  await load();
  if (selectedId.value) void openItem(selectedId.value);
});
</script>

<template>
  <div>
    <PageHeader :title="t('feedbackBox.platformTitle')" :subtitle="t('feedbackBox.platformSubtitle')" />

    <v-tabs v-model="tab" class="mb-4">
      <v-tab value="items">{{ t('feedbackBox.tabItems') }}<v-badge v-if="store.platformUnread" :content="store.platformUnread" color="error" inline /></v-tab>
      <v-tab value="points">{{ t('feedbackBox.tabPoints') }}</v-tab>
    </v-tabs>

    <template v-if="tab === 'items'">
      <div class="d-flex flex-wrap ga-4 align-center mb-4">
        <v-text-field v-model="q" :placeholder="t('feedbackBox.search')" prepend-inner-icon="mdi-magnify" clearable hide-details :max-width="320" />
        <v-select v-model="status" :items="statusItems" :label="t('feedbackBox.statusLabel')" clearable hide-details :max-width="200" />
        <v-select v-model="kind" :items="kindItems" :label="t('feedbackBox.kindLabel')" clearable hide-details :max-width="200" />
        <v-switch v-model="onlyUnread" color="primary" :label="t('feedbackBox.onlyUnread')" hide-details />
      </div>

      <v-progress-linear :active="refreshing" indeterminate color="primary" class="mb-2" />
      <v-alert v-if="failure" type="error" class="mb-4" :text="failure" />
      <div v-else-if="loading" class="d-flex justify-center pa-6"><v-progress-circular indeterminate color="primary" /></div>
      <v-card v-else-if="!items.length"><EmptyState icon="mdi-inbox-outline" :title="t('feedbackBox.platformEmpty')" /></v-card>
      <v-row v-else>
        <v-col cols="12" :md="detail && !smAndDown ? 5 : 12">
          <v-card>
            <v-list lines="two">
              <v-list-item v-for="i in items" :key="i.id" :active="i.id === selectedId" :data-feedback="i.id" @click="router.replace({ query: { id: i.id } })">
                <template #prepend>
                  <v-badge :model-value="i.unread" dot color="error" location="top end">
                    <v-avatar color="lightprimary" size="36"><v-icon :icon="KIND_ICON[i.kind]" color="primary" size="20" /></v-avatar>
                  </v-badge>
                </template>
                <v-list-item-title :class="{ 'font-weight-bold': i.unread }">{{ i.title }}</v-list-item-title>
                <v-list-item-subtitle>{{ i.organizationName || i.organizationId }} · {{ i.authorName || t('feedbackBox.unknownPerson') }} · {{ formatRelative(i.lastActivityAt) }}</v-list-item-subtitle>
                <template #append><FeedbackStatusChip :status="i.status" /></template>
              </v-list-item>
            </v-list>
            <div v-if="nextCursor" class="d-flex justify-center pb-4"><v-btn variant="text" @click="load(true)">{{ t('feedbackBox.more') }}</v-btn></div>
          </v-card>
        </v-col>
        <v-col v-if="detail && !smAndDown" cols="12" md="7">
          <v-card class="pa-6"><FeedbackConversation :key="`${detail.item.id}-${detail.item.status}-${detail.replies.length}-${detail.points.length}`" :detail="detail" mode="platform" :busy="busy" :suggestions="suggestions" @respond="respond" /></v-card>
        </v-col>
      </v-row>
    </template>

    <template v-else>
      <v-card>
        <v-card-title class="d-flex align-center">
          <span class="flex-grow-1 text-title-large">{{ t('feedbackBox.balancesTitle') }}</span>
          <v-btn variant="tonal" prepend-icon="mdi-plus-minus-variant" @click="openAdjust()">{{ t('feedbackBox.adjust') }}</v-btn>
        </v-card-title>
        <EmptyState v-if="!balances.length" compact icon="mdi-star-outline" :title="t('feedbackBox.noBalances')" />
        <v-list v-else>
          <v-list-item v-for="b in balances" :key="b.organizationId" :title="b.organizationName || b.organizationId" :subtitle="t('feedbackBox.movements', { n: b.entries }, b.entries)" :data-balance-org="b.organizationId">
            <template #append>
              <span class="text-title-large mr-4">{{ b.balance }}</span>
              <v-btn variant="text" size="small" @click="openAdjust(b.organizationId)">{{ t('feedbackBox.adjust') }}</v-btn>
            </template>
          </v-list-item>
        </v-list>
      </v-card>
    </template>

    <v-dialog :model-value="!!detail && smAndDown && tab === 'items'" fullscreen @update:model-value="(v) => !v && router.replace({ query: {} })">
      <v-card v-if="detail">
        <v-card-title class="d-flex align-center">
          <span class="flex-grow-1 text-truncate">{{ t('feedbackBox.platformTitle') }}</span>
          <v-btn icon="mdi-close" variant="text" size="small" :aria-label="t('common.close')" @click="router.replace({ query: {} })" />
        </v-card-title>
        <v-card-text><FeedbackConversation :key="`${detail.item.id}-${detail.item.status}-${detail.replies.length}-${detail.points.length}`" :detail="detail" mode="platform" :busy="busy" :suggestions="suggestions" @respond="respond" /></v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="adjusting" max-width="520">
      <v-card>
        <v-card-title>{{ t('feedbackBox.adjustTitle') }}</v-card-title>
        <v-card-text class="d-flex flex-column ga-4">
          <v-select v-model="adjust.organizationId" :items="orgItems" :label="t('feedbackBox.company')" />
          <v-text-field v-model.number="adjust.amount" type="number" :label="t('feedbackBox.points')" :hint="t('feedbackBox.adjustHint')" persistent-hint />
          <v-text-field v-model="adjust.reason" :label="t('feedbackBox.reason')" maxlength="200" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="adjusting = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="flat" :disabled="!adjust.organizationId || !adjust.amount || !adjust.reason.trim()" :loading="busy" @click="saveAdjust">{{ t('common.save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
