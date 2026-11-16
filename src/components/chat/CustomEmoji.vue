<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useChatStore } from '@/stores/chat';
import { fileUrl } from '@/composable/useFileUrl';

/**
 * Un emoji personalizado (`:nombre:`) como imagen, del tamaño de una letra un poco grande (como en Slack). Si la organización ya no lo
 * tiene (lo quitaron) o todavía no cargó la lista, se ve `:nombre:` en texto; un nombre desconocido pide la lista otra vez (con freno).
 */
const props = withDefaults(defineProps<{ name: string; size?: string }>(), { size: '1.375em' });
const chat = useChatStore();
const emoji = computed(() => chat.emojis.get(props.name) ?? null);
const src = computed(() => (emoji.value ? fileUrl(emoji.value.documentId) : undefined));
onMounted(() => {
  if (!emoji.value) chat.ensureEmoji(props.name);
});
</script>

<template>
  <img
    v-if="src"
    :src="src"
    :alt="`:${name}:`"
    :title="`:${name}:`"
    class="d-inline-block"
    :style="{ width: size, height: size, objectFit: 'contain', verticalAlign: 'text-bottom' }"
    :data-emoji="name"
  />
  <span v-else :data-emoji="name">:{{ name }}:</span>
</template>
