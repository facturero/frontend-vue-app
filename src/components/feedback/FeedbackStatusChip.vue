<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FeedbackStatus } from '@/types/feedback';

/** Estado de un comentario o mejora, con el color de su etapa (nueva → en revisión → aceptada → implementada, o descartada). */
const props = defineProps<{ status: FeedbackStatus }>();
const { t } = useI18n();
const COLORS: Record<FeedbackStatus, string> = { new: 'info', reviewing: 'warning', accepted: 'primary', implemented: 'success', declined: 'secondary' };
const color = computed(() => COLORS[props.status]);
</script>

<template>
  <v-chip size="small" :color="color" :data-status="status">{{ t(`feedbackBox.status.${status}`) }}</v-chip>
</template>
