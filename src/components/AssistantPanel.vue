<script setup lang="ts">
/**
 * El asistente, en un panel lateral que no se lleva por delante la pantalla en
 * la que estás trabajando.
 *
 * Lo que de verdad importa aquí son las tarjetas de confirmación: cuando el
 * asistente quiere escribir algo, se enseña la frase exacta de lo que va a pasar
 * y no ocurre nada hasta que alguien pulsa. Esa frase la escribe el servidor a
 * partir de los argumentos reales, no el modelo: lo que se confirma es lo que se
 * ejecuta.
 */
import { nextTick, ref, watch } from 'vue';
import { useAssistantStore } from '@/stores/assistant';
import type { ConversationSummary } from '@/types/assistant';

const store = useAssistantStore();
const draft = ref('');
const scroller = ref<HTMLElement | null>(null);
const showHistory = ref(false);

async function scrollToBottom(): Promise<void> {
  await nextTick();
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
}

watch(() => store.messages.length, scrollToBottom);
watch(() => store.pendingActions.length, scrollToBottom);

async function submit(): Promise<void> {
  const text = draft.value;
  draft.value = '';
  showHistory.value = false;
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
  try {
    return new Date(iso).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

async function openFromHistory(id: string): Promise<void> {
  await store.openConversation(id);
  showHistory.value = false;
}

function startNewChat(): void {
  store.reset();
  showHistory.value = false;
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
 * Markdown-lite sin dependencias nuevas: el asistente devuelve **negrita**,
 * listas con "- "/"* " y párrafos — antes se mostraba todo literal (con los
 * asteriscos incluidos). Solo cubre ese subconjunto, a propósito: escapa HTML
 * primero para no abrir una vía de inyección con texto que viene del modelo.
 */
function renderMarkdownLite(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lines = escaped.split('\n');
  const html: string[] = [];
  let inList = false;

  for (const line of lines) {
    const bullet = line.match(/^\s*[-*]\s+(.*)/);
    if (bullet) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
      continue;
    }
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
    if (line.trim() === '') {
      html.push('<br>');
    } else {
      html.push(`<p>${inlineMarkdown(line)}</p>`);
    }
  }
  if (inList) html.push('</ul>');

  return html.join('');
}

function inlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}
</script>

<template>
  <v-navigation-drawer
    v-model="store.open"
    location="right"
    temporary
    width="420"
    :scrim="false"
    class="assistant-drawer"
  >
    <div class="d-flex flex-column fill-height">
      <div class="d-flex align-center ga-3 pa-4 assistant-header">
        <v-avatar color="lightprimary" size="36">
          <v-icon icon="mdi-robot-outline" color="primary" size="20" />
        </v-avatar>
        <span class="text-subtitle-1 font-weight-bold">{{ $t('assistant.title') }}</span>
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
          :color="showHistory ? 'primary' : undefined"
          :title="$t('assistant.history')"
          @click="showHistory = !showHistory"
        />
        <v-btn icon="mdi-close" variant="text" size="small" @click="store.open = false" />
      </div>

      <div v-if="showHistory" ref="scroller" class="flex-grow-1 overflow-y-auto pa-4">
        <v-list v-if="store.conversations.length" density="comfortable" nav>
          <v-list-item
            v-for="conversation in store.conversations"
            :key="conversation.id"
            @click="openFromHistory(conversation.id)"
          >
            <v-list-item-title class="text-body-2">
              {{ conversation.title ?? $t('assistant.untitled') }}
            </v-list-item-title>
            <v-list-item-subtitle class="text-caption text-medium-emphasis">
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
        <p v-else class="text-body-2 text-medium-emphasis">
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

      <div v-else ref="scroller" class="flex-grow-1 overflow-y-auto pa-4">
        <div v-if="!store.messages.length" class="text-center text-medium-emphasis py-8">
          <v-avatar color="lightprimary" size="56" class="mb-3">
            <v-icon icon="mdi-robot-happy-outline" color="primary" size="30" />
          </v-avatar>
          <p class="text-body-2 mb-4">{{ $t('assistant.emptyHint') }}</p>
          <div class="d-flex flex-column ga-2 align-start mx-auto" style="max-width: 280px">
            <v-chip
              v-for="example in ['assistant.examples.sales', 'assistant.examples.role', 'assistant.examples.customer']"
              :key="example"
              size="small"
              variant="outlined"
              class="example-chip"
              @click="draft = $t(example)"
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
              :class="message.role === 'assistant' ? 'assistant-bubble' : ''"
              rounded="lg"
              class="pa-3 message-bubble"
              elevation="0"
            >
              <span v-if="message.role === 'user'" class="text-body-2 message-text" style="white-space: pre-wrap; color: white">{{ message.text }}</span>
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div v-else class="text-body-2 message-text markdown-lite" v-html="renderMarkdownLite(message.text)" />
            </v-sheet>
            <span class="text-caption text-medium-emphasis mt-1 message-time">{{ formatTime(message.createdAt) }}</span>
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
              <span class="text-caption font-weight-medium text-medium-emphasis">
                {{ $t('assistant.confirmTitle') }}
              </span>
            </div>
            <p class="text-body-2 mb-0">{{ action.summary }}</p>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn
              variant="text"
              size="small"
              :disabled="!!store.deciding"
              @click="store.decide(action.id, false)"
            >
              {{ $t('assistant.reject') }}
            </v-btn>
            <v-btn
              color="primary"
              variant="flat"
              size="small"
              :loading="store.deciding === action.id"
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
          <v-sheet rounded="lg" class="pa-3 assistant-bubble message-bubble d-flex align-center">
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

      <!-- En el historial no se escribe: primero se abre una conversación o se
           empieza una nueva. -->
      <v-divider v-if="!showHistory" />

      <div v-if="!showHistory" class="pa-3">
        <div class="d-flex align-end ga-2">
          <v-textarea
            v-model="draft"
            :placeholder="$t('assistant.placeholder')"
            rows="1"
            auto-grow
            max-rows="6"
            hide-details
            density="comfortable"
            rounded="lg"
            class="assistant-input"
            :disabled="store.sending"
            @keydown.enter.exact.prevent="submit"
          />
          <v-btn
            icon="mdi-send"
            color="primary"
            variant="flat"
            size="default"
            class="flex-shrink-0"
            :disabled="!draft.trim() || store.sending"
            @click="submit"
          />
        </div>
        <p class="text-caption text-medium-emphasis mt-2 mb-0">
          {{ $t('assistant.disclaimer') }}
        </p>
      </div>
    </div>

    <v-dialog
      :model-value="!!pendingDelete"
      max-width="380"
      @update:model-value="(v) => { if (!v && !deleting) pendingDelete = null; }"
    >
      <v-card>
        <v-card-title class="text-subtitle-1 font-weight-bold">
          {{ $t('assistant.deleteTitle') }}
        </v-card-title>
        <v-card-text class="text-body-2">
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
  </v-navigation-drawer>
</template>

<style scoped>
.assistant-header {
  border-bottom: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.message-bubble {
  max-width: 300px;
  word-break: break-word;
}

.assistant-bubble {
  background-color: rgb(var(--v-theme-surface));
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.message-time {
  padding-inline: 4px;
}

.example-chip {
  cursor: pointer;
}

.markdown-lite :deep(p) {
  margin: 0 0 8px;
}

.markdown-lite :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-lite :deep(ul) {
  margin: 0 0 8px;
  padding-inline-start: 20px;
}

.markdown-lite :deep(ul:last-child) {
  margin-bottom: 0;
}

.markdown-lite :deep(li) {
  margin-bottom: 2px;
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
