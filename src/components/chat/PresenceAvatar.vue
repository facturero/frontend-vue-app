<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useChatStore } from '@/stores/chat';
import UserAvatar from '@/components/projects/UserAvatar.vue';

/**
 * Avatar con el punto de presencia de Slack: verde = conectado, amarillo = ausente (10 min sin actividad en todas sus pestañas), sin
 * punto = desconectado. El estado lo da el hub del gateway (`stores/chat.ts`, `presenceOf`); quien muestra el avatar pide la presencia
 * de esas personas con `loadPresence`.
 */
const props = withDefaults(defineProps<{ userId: string | null; size?: number }>(), { size: 28 });
const { t } = useI18n();
const chat = useChatStore();
const state = computed(() => chat.presenceOf(props.userId));
</script>

<template>
  <v-badge
    :model-value="state !== 'offline'"
    dot
    bordered
    location="bottom end"
    :color="state === 'online' ? 'success' : 'warning'"
    :title="t(`chat.presence.${state}`)"
    :data-presence="state"
  >
    <UserAvatar :user-id="userId" :size="size" :tooltip="false" />
  </v-badge>
</template>
