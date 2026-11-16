<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useChatStore } from '@/stores/chat';
import { fileUrl } from '@/composable/useFileUrl';
import EmojiPreview from './EmojiPreview.vue';

/**
 * Un emoji personalizado (`:nombre:`) como imagen, del tamaño de una letra un poco grande (como en Slack). Si la organización ya no lo
 * tiene (lo quitaron) o todavía no cargó la lista, se ve `:nombre:` en texto; un nombre desconocido pide la lista otra vez (con freno).
 * `preview`: al pasar el ratón, el emoji en grande y su nombre (`EmojiPreview`). Solo en los mensajes (lo enciende `RichTextView`);
 * ni en el editor ni en el selector, y en una reacción el tooltip lo pone la propia reacción (con quién reaccionó).
 */
const props = withDefaults(defineProps<{ name: string; size?: string; preview?: boolean }>(), { size: '1.375em', preview: false });
const chat = useChatStore();
const emoji = computed(() => chat.emojis.get(props.name) ?? null);
const src = computed(() => (emoji.value ? fileUrl(emoji.value.documentId) : undefined));
onMounted(() => {
  if (!emoji.value) chat.ensureEmoji(props.name);
});
</script>

<template>
  <v-tooltip v-if="src" location="top" :disabled="!preview">
    <template #activator="{ props: tip }">
      <img
        v-bind="tip"
        :src="src"
        :alt="`:${name}:`"
        class="d-inline-block"
        :style="{ width: size, height: size, objectFit: 'contain', verticalAlign: 'text-bottom' }"
        :data-emoji="name"
      />
    </template>
    <EmojiPreview :name="name" />
  </v-tooltip>
  <span v-else :data-emoji="name">:{{ name }}:</span>
</template>
