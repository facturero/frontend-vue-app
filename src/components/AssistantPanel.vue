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

const store = useAssistantStore();
const draft = ref('');
const scroller = ref<HTMLElement | null>(null);

async function scrollToBottom(): Promise<void> {
  await nextTick();
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
}

watch(() => store.messages.length, scrollToBottom);
watch(() => store.pendingActions.length, scrollToBottom);

async function submit(): Promise<void> {
  const text = draft.value;
  draft.value = '';
  await store.send(text);
}
</script>

<template>
  <v-navigation-drawer
    v-model="store.open"
    location="right"
    temporary
    width="420"
    :scrim="false"
  >
    <div class="d-flex flex-column fill-height">
      <div class="d-flex align-center ga-2 pa-4 pb-2">
        <v-icon icon="mdi-robot-outline" color="primary" />
        <span class="text-subtitle-1 font-weight-bold">{{ $t('assistant.title') }}</span>
        <v-spacer />
        <v-btn
          icon="mdi-plus"
          variant="text"
          size="small"
          :title="$t('assistant.newChat')"
          @click="store.reset()"
        />
        <v-btn icon="mdi-close" variant="text" size="small" @click="store.open = false" />
      </div>

      <v-divider />

      <div ref="scroller" class="flex-grow-1 overflow-y-auto pa-4">
        <div v-if="!store.messages.length" class="text-center text-medium-emphasis py-8">
          <v-icon icon="mdi-robot-happy-outline" size="40" class="mb-3 d-block mx-auto" />
          <p class="text-body-2 mb-4">{{ $t('assistant.emptyHint') }}</p>
          <v-chip
            v-for="example in ['assistant.examples.sales', 'assistant.examples.role', 'assistant.examples.customer']"
            :key="example"
            size="small"
            class="ma-1"
            @click="draft = $t(example)"
          >
            {{ $t(example) }}
          </v-chip>
        </div>

        <div
          v-for="(message, index) in store.messages"
          :key="index"
          class="mb-3 d-flex"
          :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <v-sheet
            :color="message.role === 'user' ? 'lightprimary' : 'surface'"
            rounded="lg"
            class="pa-3"
            max-width="320"
            :border="message.role === 'assistant'"
          >
            <span class="text-body-2" style="white-space: pre-wrap">{{ message.text }}</span>
          </v-sheet>
        </div>

        <!-- Confirmación de escrituras. Nada se ejecuta hasta pulsar. -->
        <v-card
          v-for="action in store.pendingActions"
          :key="action.id"
          class="mb-3"
          border
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

        <div v-if="store.sending" class="d-flex align-center ga-2 text-medium-emphasis">
          <v-progress-circular indeterminate size="16" width="2" />
          <span class="text-caption">{{ $t('assistant.thinking') }}</span>
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

      <v-divider />

      <div class="pa-3">
        <v-textarea
          v-model="draft"
          :placeholder="$t('assistant.placeholder')"
          rows="2"
          auto-grow
          max-rows="6"
          hide-details
          :disabled="store.sending"
          @keydown.enter.exact.prevent="submit"
        >
          <template #append-inner>
            <v-btn
              icon="mdi-send"
              variant="text"
              size="small"
              :disabled="!draft.trim() || store.sending"
              @click="submit"
            />
          </template>
        </v-textarea>
        <p class="text-caption text-medium-emphasis mt-2 mb-0">
          {{ $t('assistant.disclaimer') }}
        </p>
      </div>
    </div>
  </v-navigation-drawer>
</template>
