<script setup lang="ts">
import { computed } from 'vue';
import { formatDate } from '@/utils/format';
import { useI18n } from 'vue-i18n';
import { DUE_COLOR, addDays, dueState, localIsoDate } from '@/utils/projects';

/**
 * Fecha de entrega como la muestra Asana: «Hoy», «Mañana», «Ayer» o la fecha (dd/mm/yyyy), en rojo si venció.
 * `relativeOnly`: para ir junto a un campo que ya muestra la fecha (el detalle de tarea): solo dice lo que el campo no dice
 * («Hoy», «Mañana», «Ayer», «Vencida»); repetir «16/11/2026» al lado de «16/11/2026» no aporta.
 */
const props = defineProps<{ dueOn: string | null; completed?: boolean; relativeOnly?: boolean }>();
const { t } = useI18n();

const today = localIsoDate(new Date());
const state = computed(() => dueState(props.dueOn, today, props.completed));

const label = computed(() => {
  const d = props.dueOn;
  if (!d) return '';
  if (d === today) return t('projects.due.today');
  if (d === addDays(today, 1)) return t('projects.due.tomorrow');
  if (d === addDays(today, -1)) return t('projects.due.yesterday');
  // Hoy / mañana / ayer se dicen con palabras (como Asana); cualquier otro día, dd/mm/yyyy como en todo el CRM.
  if (props.relativeOnly) return state.value === 'overdue' ? t('projects.due.overdue') : '';
  return formatDate(d);
});
</script>

<template>
  <span v-if="dueOn && label" class="text-body-medium text-no-wrap" :class="DUE_COLOR[state] ? `text-${DUE_COLOR[state]}` : 'text-medium-emphasis'">
    {{ label }}
  </span>
</template>
