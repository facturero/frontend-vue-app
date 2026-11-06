<script setup lang="ts">
/**
 * Lo que se ve cuando no hay datos (REGLAS-FRONT.md R-03). Envuelve `v-empty-state` para que todos los vacíos del CRM se vean igual.
 *
 * Tres vacíos distintos, y cada uno dice algo distinto:
 * - aún no hay nada → invita a crear (`action-text` + `@action`: «Crear proyecto»);
 * - el filtro no encontró nada → ofrece limpiar el filtro, no crear;
 * - todo hecho (bandeja, tareas) → lo celebra, sin botón.
 *
 * `compact` es para dentro de una columna, una sección o una tabla: icono chico y sin el aire de una página entera.
 */
withDefaults(
  defineProps<{
    icon: string;
    title: string;
    text?: string;
    actionText?: string;
    actionIcon?: string;
    compact?: boolean;
  }>(),
  { text: undefined, actionText: undefined, actionIcon: undefined, compact: false },
);
const emit = defineEmits<{ action: [] }>();
</script>

<template>
  <v-empty-state :icon="icon" :title="title" :text="text" :size="compact ? 32 : 56" color="primary" :class="compact ? 'pa-2' : 'pa-6'">
    <template v-if="actionText" #actions>
      <v-btn color="primary" :prepend-icon="actionIcon" :size="compact ? 'small' : undefined" @click="emit('action')">{{ actionText }}</v-btn>
    </template>
  </v-empty-state>
</template>
