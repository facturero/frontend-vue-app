<script setup lang="ts">
/**
 * El chat del asistente: cabecera, historial, mensajes, confirmaciones y caja de texto. Lo usan el panel lateral y el
 * diálogo grande (`AssistantPanel.vue`); el estado (conversación, borrador, si se ve el historial) vive en el store, así
 * que pasar de uno a otro no pierde nada.
 *
 * Lo que de verdad importa aquí son las tarjetas de confirmación: cuando el asistente quiere escribir algo, se enseña la
 * frase exacta de lo que va a pasar y no ocurre nada hasta que alguien pulsa. Esa frase la escribe el servidor a partir de
 * los argumentos reales, no el modelo: lo que se confirma es lo que se ejecuta.
 */
import { nextTick, ref, watch } from 'vue';
import { formatDate as fmtDate } from '@/utils/format';
import { useRouter } from 'vue-router';
import { useAssistantStore } from '@/stores/assistant';
import type { ConversationSummary } from '@/types/assistant';
import AssistantChart from '@/components/AssistantChart.vue';
import { parseAssistantBlocks } from '@/utils/assistant-blocks';
import { renderInlineMarkdown, renderMarkdownLite } from '@/utils/markdown-lite';

/** Una tabla o un gráfico necesitan todo el ancho de la burbuja; el texto, no. */
/** Alineación de una columna según el separador (`---:` a la derecha): las cifras se leen mejor alineadas. */
function alignClass(align: 'left' | 'right' | 'center' | null | undefined): string | undefined {
  return align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : undefined;
}

function hasRichBlocks(text: string): boolean {
  return parseAssistantBlocks(text).some((b) => b.kind !== 'text');
}

const props = defineProps<{
  /** En el diálogo grande: burbujas más anchas y el botón pasa a «volver al panel». */
  expanded: boolean;
}>();
const emit = defineEmits<{ 'toggle-size': []; close: [] }>();

const store = useAssistantStore();
const router = useRouter();
const scroller = ref<HTMLElement | null>(null);

// ¿Está la persona viendo el final? Si subió a leer algo, una respuesta nueva no la arrastra abajo: se le avisa con el botón
// flotante («Respuesta nueva») y baja cuando quiera. El margen evita que unos píxeles de redondeo cuenten como «arriba».
const NEAR_BOTTOM_PX = 80;
const atBottom = ref(true);
const unread = ref(false);

function onScroll(): void {
  const el = scroller.value;
  if (!el) return;
  atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  if (atBottom.value) unread.value = false;
}

async function scrollToBottom(smooth = false): Promise<void> {
  await nextTick();
  const el = scroller.value;
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  atBottom.value = true;
  unread.value = false;
}

/** Lo que escribe la persona siempre se ve; lo que llega del asistente, solo si ya estaba abajo. */
function followNew(): void {
  const last = store.messages[store.messages.length - 1];
  if (atBottom.value || last?.role === 'user') void scrollToBottom();
  else unread.value = true;
}

watch(() => store.messages.length, followNew);
watch(() => store.pendingActions.length, followNew);
// Los puntos de «escribiendo» aparecen abajo: si estaba abajo, que se vean.
watch(() => store.sending, (sending) => {
  if (sending && atBottom.value) void scrollToBottom();
});
// Otra conversación, o volver del historial: se empieza por el final. Va después de `followNew` para corregir lo que marcó.
watch(() => store.conversationId, () => void scrollToBottom());
watch(() => store.showHistory, (history) => {
  if (!history) void scrollToBottom();
});
// Al abrir en grande (otra instancia), la conversación tiene que verse desde el final, como estaba.
void scrollToBottom();

async function submit(): Promise<void> {
  // Con Enter el botón deshabilitado no frena nada: sin servidores, el borrador se queda para cuando vuelvan.
  if (!store.available || !store.draft.trim()) return;
  const text = store.draft;
  store.draft = '';
  store.showHistory = false;
  await store.send(text);
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatDate(iso: string): string {
  return fmtDate(iso);
}

async function openFromHistory(id: string): Promise<void> {
  await store.openConversation(id);
  store.showHistory = false;
}

function startNewChat(): void {
  store.reset();
  store.showHistory = false;
}

// Borrar pide confirmación: desde la lista no se ve el contenido del hilo, y un
// clic de más no debería llevarse una conversación.
const pendingDelete = ref<ConversationSummary | null>(null);
const deleting = ref(false);

async function confirmDelete(): Promise<void> {
  if (!pendingDelete.value) return;
  deleting.value = true;
  try {
    await store.deleteConversation(pendingDelete.value.id);
  } finally {
    deleting.value = false;
    pendingDelete.value = null;
  }
}

/**
 * Enlaces del asistente a pantallas de la app, como `[facturación](/invoices/new)`.
 *
 * Solo se convierten en enlace las rutas **internas que existen en el router**:
 * el texto viene del modelo, y el modelo lee datos de clientes y productos. Si
 * un dato trae un enlace a otra web, se queda en texto plano y nunca llega a ser
 * clicable. Con cualquier ruta que no encaje pasa lo mismo.
 */
const SAFE_PATH = /^\/(?!\/)[A-Za-z0-9/_\-?=&.]*$/;

function resolveLink(href: string): string | null {
  if (!SAFE_PATH.test(href)) return null;
  // La ruta comodín del router redirige a inicio y no tiene nombre: una ruta
  // que solo encaja con ella es una pantalla que no existe.
  return router.resolve(href).name ? href : null;
}

const renderText = (text: string) => renderMarkdownLite(text, resolveLink);
const renderCell = (text: string) => renderInlineMarkdown(text, resolveLink);

/** Los enlaces se pintan con v-html, así que la navegación se engancha aquí. */
function onMessageClick(event: MouseEvent): void {
  const link = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[data-internal-link]');
  if (!link) return;
  // Ctrl/Cmd+clic o clic central: que el navegador lo abra en otra pestaña.
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
  event.preventDefault();
  // Desde el diálogo grande, ir a otra pantalla lo cierra: si no, la pantalla nueva quedaría tapada.
  if (props.expanded) emit('close');
  void router.push(link.getAttribute('href') ?? '/');
}
</script>

<template>
  <div class="d-flex flex-column fill-height">
    <div class="d-flex align-center ga-3 pa-4 border-b">
      <v-avatar color="lightprimary" size="36">
        <v-icon icon="mdi-robot-outline" color="primary" size="20" />
      </v-avatar>
      <span class="text-body-large font-weight-bold">{{ $t('assistant.title') }}</span>
      <v-spacer />
      <v-btn
        icon="mdi-plus"
        variant="text"
        size="small"
        :title="$t('assistant.newChat')"
        @click="startNewChat"
      />
      <v-btn
        icon="mdi-history"
        variant="text"
        size="small"
        :color="store.showHistory ? 'primary' : undefined"
        :title="$t('assistant.history')"
        @click="store.showHistory = !store.showHistory"
      />
      <v-btn
        :icon="expanded ? 'mdi-arrow-collapse' : 'mdi-arrow-expand'"
        variant="text"
        size="small"
        :title="expanded ? $t('assistant.collapse') : $t('assistant.expand')"
        :aria-label="expanded ? $t('assistant.collapse') : $t('assistant.expand')"
        data-testid="assistant-toggle-size"
        @click="emit('toggle-size')"
      />
      <v-btn icon="mdi-close" variant="text" size="small" :title="$t('assistant.close')" @click="emit('close')" />
    </div>

    <div v-if="store.showHistory" ref="scroller" class="flex-grow-1 overflow-y-auto pa-4">
      <v-list v-if="store.conversations.length" density="comfortable" nav>
        <v-list-item
          v-for="conversation in store.conversations"
          :key="conversation.id"
          @click="openFromHistory(conversation.id)"
        >
          <v-list-item-title class="text-body-medium">
            {{ conversation.title ?? $t('assistant.untitled') }}
          </v-list-item-title>
          <v-list-item-subtitle class="text-body-small text-medium-emphasis">
            {{ formatDate(conversation.updatedAt) }}
          </v-list-item-subtitle>
          <template #append>
            <v-btn
              icon="mdi-delete-outline"
              variant="text"
              size="small"
              :title="$t('assistant.deleteConversation')"
              @click.stop="pendingDelete = conversation"
            />
          </template>
        </v-list-item>
      </v-list>
      <p v-else class="text-body-medium text-medium-emphasis">
        {{ $t('assistant.historyEmpty') }}
      </p>

      <v-alert
        v-if="store.error"
        type="error"
        closable
        class="mt-3"
        @click:close="store.error = null"
      >
        {{ store.error }}
      </v-alert>
    </div>

    <div v-else class="position-relative flex-grow-1 d-flex flex-column chat-viewport">
    <div ref="scroller" class="flex-grow-1 overflow-y-auto pa-4" @scroll.passive="onScroll">
      <div v-if="!store.messages.length" class="text-center text-medium-emphasis py-8">
        <v-avatar color="lightprimary" size="56" class="mb-3">
          <v-icon icon="mdi-robot-happy-outline" color="primary" size="30" />
        </v-avatar>
        <p class="text-body-medium mb-4">{{ $t('assistant.emptyHint') }}</p>
        <div class="d-flex flex-column ga-2 align-start mx-auto" style="max-width: 280px">
          <v-chip
            v-for="example in ['assistant.examples.sales', 'assistant.examples.role', 'assistant.examples.customer']"
            :key="example"
            size="small"
            variant="outlined"
            :disabled="!store.available"
            @click="store.draft = $t(example)"
          >
            {{ $t(example) }}
          </v-chip>
        </div>
      </div>

      <div
        v-for="(message, index) in store.messages"
        :key="index"
        class="d-flex ga-2 mb-4"
        :class="message.role === 'user' ? 'flex-row-reverse' : ''"
      >
        <v-avatar
          :color="message.role === 'user' ? 'primary' : 'lightprimary'"
          size="28"
          class="flex-shrink-0 mt-1"
        >
          <v-icon
            :icon="message.role === 'user' ? 'mdi-account' : 'mdi-robot-outline'"
            :color="message.role === 'user' ? 'white' : 'primary'"
            size="16"
          />
        </v-avatar>
        <div class="d-flex flex-column" :class="message.role === 'user' ? 'align-end' : 'align-start'" style="min-width: 0">
          <v-sheet
            :color="message.role === 'user' ? 'primary' : undefined"
            :class="{
              border: message.role === 'assistant',
              'message-bubble--wide': expanded,
              'message-bubble--rich': message.role === 'assistant' && hasRichBlocks(message.text),
            }"
            rounded="lg"
            class="pa-3 message-bubble"
            elevation="0"
          >
            <span v-if="message.role === 'user'" class="text-body-medium text-pre-wrap message-text">{{ message.text }}</span>
            <!-- Texto, tabla o gráfico: las tablas y los gráficos solo aparecen si la persona los pidió (lo decide el prompt). -->
            <div v-else class="d-flex flex-column ga-2">
              <template v-for="(block, b) in parseAssistantBlocks(message.text)" :key="b">
                <!-- eslint-disable-next-line vue/no-v-html -->
                <div
                  v-if="block.kind === 'text'"
                  class="text-body-medium message-text markdown-lite"
                  @click="onMessageClick"
                  v-html="renderText(block.text)"
                />
                <div v-else-if="block.kind === 'table'" class="overflow-x-auto markdown-lite" @click="onMessageClick">
                  <v-table density="compact" class="text-body-small" data-testid="assistant-table">
                    <thead>
                      <tr>
                        <!-- eslint-disable-next-line vue/no-v-html -->
                        <th v-for="(head, h) in block.head" :key="h" :class="alignClass(block.align[h])" v-html="renderCell(head)" />
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(row, r) in block.rows" :key="r">
                        <!-- eslint-disable-next-line vue/no-v-html -->
                        <td v-for="(cell, c) in row" :key="c" :class="alignClass(block.align[c])" v-html="renderCell(cell)" />
                      </tr>
                    </tbody>
                  </v-table>
                </div>
                <AssistantChart v-else :chart="block.chart" />
              </template>
            </div>
          </v-sheet>
          <span class="text-body-small text-medium-emphasis mt-1 px-1">{{ formatTime(message.createdAt) }}</span>
        </div>
      </div>

      <!-- Confirmación de escrituras. Nada se ejecuta hasta pulsar. -->
      <v-card
        v-for="action in store.pendingActions"
        :key="action.id"
        class="mb-4 confirm-card"
        elevation="0"
      >
        <v-card-text class="pb-2">
          <div class="d-flex align-center ga-2 mb-2">
            <v-icon icon="mdi-shield-alert-outline" color="warning" size="18" />
            <span class="text-body-small font-weight-medium text-medium-emphasis">
              {{ $t('assistant.confirmTitle') }}
            </span>
          </div>
          <p class="text-body-medium mb-0">{{ action.summary }}</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            size="small"
            :disabled="!!store.deciding || !store.available"
            @click="store.decide(action.id, false)"
          >
            {{ $t('assistant.reject') }}
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            size="small"
            :loading="store.deciding === action.id"
            :disabled="!store.available"
            @click="store.decide(action.id, true)"
          >
            {{ $t('assistant.approve') }}
          </v-btn>
        </v-card-actions>
      </v-card>

      <div v-if="store.sending" class="d-flex ga-2 mb-4">
        <v-avatar color="lightprimary" size="28" class="flex-shrink-0 mt-1">
          <v-icon icon="mdi-robot-outline" color="primary" size="16" />
        </v-avatar>
        <v-sheet rounded="lg" class="pa-3 border message-bubble d-flex align-center">
          <span class="typing-dots">
            <span /><span /><span />
          </span>
        </v-sheet>
      </div>

      <v-alert
        v-if="store.error"
        type="error"
        closable
        class="mt-3"
        @click:close="store.error = null"
      >
        {{ store.error }}
      </v-alert>
    </div>

    <!-- Arriba leyendo: un botón para volver al final, que además dice si el asistente sigue pensando o si llegó una
         respuesta. Sin él, quien sube a releer no sabe si esperar o si ya le contestaron. -->
    <v-btn
      v-if="!atBottom"
      class="scroll-down border"
      color="surface"
      size="small"
      rounded="pill"
      elevation="4"
      :aria-label="$t('assistant.scrollDown')"
      data-testid="assistant-scroll-down"
      @click="scrollToBottom(true)"
    >
      <!-- Fondo de superficie y no `primary`: pasa por encima de las burbujas de la persona, que ya son de ese color. -->
      <span class="d-inline-flex align-center ga-2 text-primary">
        <v-progress-circular v-if="store.sending" indeterminate size="14" width="2" />
        <v-icon v-else icon="mdi-arrow-down" size="16" />
        <span v-if="store.sending">{{ $t('assistant.thinking') }}</span>
        <span v-else-if="unread">{{ $t('assistant.newReply') }}</span>
      </span>
    </v-btn>
    </div>

    <!-- En el historial no se escribe: primero se abre una conversación o se
         empieza una nueva. -->
    <v-divider v-if="!store.showHistory" />

    <div v-if="!store.showHistory" class="pa-3">
      <!-- Sin servidores de IA no se escribe, pero lo de arriba (y el historial) se sigue leyendo. Se reabre solo. -->
      <v-alert
        v-if="!store.available"
        type="warning"
        icon="mdi-server-off"
        class="mb-2"
        data-testid="assistant-unavailable"
      >
        {{ $t('assistant.unavailable') }}
      </v-alert>
      <!-- El servidor dejó fuera los turnos más antiguos para que la conversación quepa en el modelo. -->
      <div
        v-if="store.contextTrimmed"
        class="d-flex align-center ga-2 mb-2 text-body-small text-medium-emphasis"
        data-testid="assistant-context-trimmed"
      >
        <v-icon icon="mdi-history" size="16" />
        <span class="flex-grow-1">{{ $t('assistant.contextTrimmed') }}</span>
        <v-btn variant="text" size="x-small" color="primary" @click="startNewChat">{{ $t('assistant.newChat') }}</v-btn>
      </div>
      <div class="d-flex align-end ga-2">
        <v-textarea
          v-model="store.draft"
          :placeholder="$t('assistant.placeholder')"
          rows="1"
          auto-grow
          max-rows="6"
          hide-details
          density="comfortable"
          rounded="lg"
          class="assistant-input"
          :disabled="store.sending || !store.available"
          :autofocus="expanded"
          @keydown.enter.exact.prevent="submit"
        />
        <v-btn
          icon="mdi-send"
          color="primary"
          variant="flat"
          size="default"
          class="flex-shrink-0"
          :disabled="!store.draft.trim() || store.sending || !store.available"
          @click="submit"
        />
      </div>
      <p class="text-body-small text-medium-emphasis mt-2 mb-0">
        {{ $t('assistant.disclaimer') }}
      </p>
    </div>

    <v-dialog
      :model-value="!!pendingDelete"
      max-width="380"
      @update:model-value="(v) => { if (!v && !deleting) pendingDelete = null; }"
    >
      <v-card>
        <v-card-title class="text-body-large font-weight-bold">
          {{ $t('assistant.deleteTitle') }}
        </v-card-title>
        <v-card-text class="text-body-medium">
          <p class="mb-2 font-weight-medium">{{ pendingDelete?.title ?? $t('assistant.untitled') }}</p>
          <p class="mb-0 text-medium-emphasis">{{ $t('assistant.deleteHint') }}</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="deleting" @click="pendingDelete = null">
            {{ $t('assistant.cancel') }}
          </v-btn>
          <v-btn color="error" variant="flat" :loading="deleting" @click="confirmDelete">
            {{ $t('assistant.delete') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.message-bubble {
  max-width: 300px;
  word-break: break-word;
}

/* En el diálogo grande hay sitio: la respuesta se lee de corrido en vez de en una columna estrecha. */
.message-bubble--wide {
  max-width: 680px;
}

/* Con tabla o gráfico la burbuja toma todo su ancho máximo: si no, se encoge al texto y el gráfico queda en nada. */
.message-bubble--rich {
  width: 100%;
}

/* El HTML de la respuesta sale de `utils/markdown-lite.ts` (v-html): aquí no llegan las utilidades de Vuetify a cada
   etiqueta, así que los márgenes van con :deep. Mismo ritmo que el resto de la app: 8 px entre bloques. */
.markdown-lite :deep(p),
.markdown-lite :deep(ul),
.markdown-lite :deep(ol),
.markdown-lite :deep(blockquote),
.markdown-lite :deep(pre) {
  margin: 0 0 8px;
}

.markdown-lite :deep(:is(p, ul, ol, blockquote, pre, hr):last-child) {
  margin-bottom: 0;
}

.markdown-lite :deep(ul),
.markdown-lite :deep(ol) {
  padding-inline-start: 20px;
}

/* Una lista dentro de otra va pegada a su elemento. */
.markdown-lite :deep(li > ul),
.markdown-lite :deep(li > ol) {
  margin: 2px 0 0;
}

.markdown-lite :deep(li) {
  margin-bottom: 2px;
}

/* Títulos `##`/`###` de las respuestas largas: un respiro arriba para separar secciones, sin tamaños de página. */
.markdown-lite :deep(.md-heading) {
  font-weight: 600;
  margin-top: 12px;
}

.markdown-lite :deep(.md-heading:first-child) {
  margin-top: 0;
}

.markdown-lite :deep(.md-rule) {
  border: 0;
  border-top: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  margin: 12px 0;
}

.markdown-lite :deep(blockquote) {
  border-inline-start: 3px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding-inline-start: 8px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.markdown-lite :deep(pre) {
  background-color: rgba(var(--v-theme-on-surface), 0.06);
  border-radius: 4px;
  padding: 8px;
  overflow-x: auto;
  white-space: pre;
}

.markdown-lite :deep(pre code) {
  background: none;
  padding: 0;
}

.markdown-lite :deep(code) {
  background-color: rgba(var(--v-theme-on-surface), 0.06);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 0.9em;
}

.confirm-card {
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-inline-start: 3px solid rgb(var(--v-theme-warning));
}

/* El hueco del scroll tiene que poder encogerse dentro del flex: sin min-height 0 crece con los mensajes y no hay scroll. */
.chat-viewport {
  min-height: 0;
}

.scroll-down {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1;
}

.assistant-input :deep(textarea) {
  line-height: 1.4;
}

.typing-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 16px;
}

.typing-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: rgb(var(--v-theme-primary));
  opacity: 0.5;
  animation: typing-bounce 1.2s infinite ease-in-out;
}

.typing-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing-bounce {
  0%, 80%, 100% {
    transform: scale(0.7);
    opacity: 0.4;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
