<script setup lang="ts">
import { computed } from 'vue';
import { useChatStore } from '@/stores/chat';
import { fileUrl } from '@/composable/useFileUrl';

/**
 * Lo que sale al pasar el ratón sobre un emoji (mensaje, reacción, selector): el emoji en grande y su nombre, como en Slack. A 22 px un
 * emoji personalizado subido por la empresa no siempre se entiende; a 64 px sí. `caption` = una línea más (en una reacción, quién
 * reaccionó). `name` para los personalizados (`:nombre:`), `char` para los normales (sin nombre: el carácter en grande basta).
 */
const props = defineProps<{ name?: string | null; char?: string | null; caption?: string }>();
const chat = useChatStore();
const src = computed(() => {
  const e = props.name ? chat.emojis.get(props.name) : null;
  return e ? fileUrl(e.documentId) : undefined;
});
</script>

<template>
  <div class="d-flex flex-column align-center ga-1 py-1" data-emoji-preview>
    <img v-if="src" :src="src" :alt="`:${name}:`" :style="{ width: '64px', height: '64px', objectFit: 'contain' }" />
    <span v-else-if="char" :style="{ fontSize: '48px', lineHeight: '64px' }">{{ char }}</span>
    <span v-if="name" class="text-body-medium font-weight-medium">:{{ name }}:</span>
    <span v-if="caption" class="text-body-small text-center">{{ caption }}</span>
  </div>
</template>
