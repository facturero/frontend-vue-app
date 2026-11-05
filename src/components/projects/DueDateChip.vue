<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { DUE_COLOR, addDays, dueState, localIsoDate } from '@/utils/projects';

/** Fecha de entrega como la muestra Asana: «Hoy», «Mañana», «Ayer» o «4 nov», en rojo si venció. */
const props = defineProps<{ dueOn: string | null; completed?: boolean }>();
const { t, locale } = useI18n();

const today = localIsoDate(new Date());
const state = computed(() => dueState(props.dueOn, today, props.completed));

const label = computed(() => {
  const d = props.dueOn;
  if (!d) return '';
  if (d === today) return t('projects.due.today');
  if (d === addDays(today, 1)) return t('projects.due.tomorrow');
  if (d === addDays(today, -1)) return t('projects.due.yesterday');
  const [y, m, day] = d.split('-').map(Number);
  const sameYear = y === new Date().getFullYear();
  return new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }).format(new Date(y!, m! - 1, day));
});
</script>

<template>
  <span v-if="dueOn" class="text-body-2 text-no-wrap" :class="DUE_COLOR[state] ? `text-${DUE_COLOR[state]}` : 'text-medium-emphasis'">
    {{ label }}
  </span>
</template>
