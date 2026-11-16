<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useChatStore } from '@/stores/chat';
import CustomEmojiImg from './CustomEmoji.vue';
import CustomEmojiDialog from './CustomEmojiDialog.vue';

/**
 * Selector de emojis: los de uso diario en una oficina y, debajo, los personalizados de la organización (`:nombre:`, como en Slack),
 * con un enlace para subir otros. Sin librería (pesan cientos de KB por miles de emojis que nadie usa para reaccionar en el trabajo);
 * si hiciera falta uno que no está, se agrega a la lista o se sube como personalizado.
 */
withDefaults(defineProps<{ label?: string; icon?: string; size?: string }>(), { label: '', icon: 'mdi-emoticon-plus-outline', size: 'x-small' });
const emit = defineEmits<{ pick: [string]; open: [boolean] }>();
const { t } = useI18n();
const chat = useChatStore();
const manage = ref(false);

const EMOJIS = [
  '👍', '👎', '👌', '🙏', '👏', '🙌', '💪', '🤝',
  '✅', '❌', '⚠️', '❓', '❗', '💯', '🔥', '⭐',
  '😀', '😂', '😊', '😍', '🤔', '😅', '😮', '😢',
  '😎', '🥳', '🎉', '❤️', '💡', '👀', '🚀', '⏰',
  '📌', '📎', '📅', '💰', '📈', '📉', '🛒', '☕',
];

function onOpen(v: boolean): void {
  emit('open', v);
  // Al abrirlo, la lista al día (un emoji que otra persona acaba de subir).
  if (v) void chat.loadEmojis(false, 5_000);
}
</script>

<template>
  <v-menu location="top" :close-on-content-click="true" @update:model-value="onOpen">
    <template #activator="{ props: menu }">
      <slot :props="menu">
        <v-btn v-bind="menu" :icon="icon" variant="text" :size="size" :aria-label="label || t('chat.react')" />
      </slot>
    </template>
    <v-card class="pa-2" max-width="296" data-emoji-picker>
      <div class="d-flex flex-wrap">
        <v-btn v-for="e in EMOJIS" :key="e" variant="text" size="small" min-width="36" class="px-0 text-body-large" :aria-label="e" @click="emit('pick', e)">
          {{ e }}
        </v-btn>
      </div>
      <template v-if="chat.emojiList.length">
        <v-divider class="my-2" />
        <div class="text-body-small text-medium-emphasis px-1 mb-1">{{ t('chat.emojis.custom') }}</div>
        <div class="d-flex flex-wrap overflow-y-auto" :style="{ maxHeight: '144px' }">
          <v-btn
            v-for="e in chat.emojiList"
            :key="e.id"
            v-tooltip:top="`:${e.name}:`"
            variant="text"
            size="small"
            min-width="36"
            class="px-0"
            :aria-label="`:${e.name}:`"
            @click="emit('pick', `:${e.name}:`)"
          >
            <CustomEmojiImg :name="e.name" size="22px" />
          </v-btn>
        </div>
      </template>
      <v-divider class="my-2" />
      <v-btn variant="text" size="small" block prepend-icon="mdi-emoticon-plus-outline" @click="manage = true">{{ t('chat.emojis.manage') }}</v-btn>
    </v-card>
  </v-menu>
  <CustomEmojiDialog v-if="manage" v-model="manage" />
</template>
