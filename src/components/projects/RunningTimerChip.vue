<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProjectsStore } from '@/stores/projects';
import { useTimerStore } from '@/stores/timer';
import { formatElapsed } from '@/utils/duration';

/**
 * El cronómetro en marcha, visible fuera de la tarea (como la barra de Asana): cuánto lleva, en qué tarea, y detenerlo o
 * descartarlo sin buscar la tarea. Un clic en el título abre la tarea.
 */
const emit = defineEmits<{ stopped: [] }>();
const { t } = useI18n();
const timer = useTimerStore();
const projects = useProjectsStore();

onMounted(() => void timer.load());

async function stop(): Promise<void> {
  const taskId = timer.timer?.taskId;
  await timer.stop();
  if (taskId && projects.detail?.id === taskId) await projects.openTask(taskId);
  emit('stopped');
}
</script>

<template>
  <v-chip v-if="timer.enabled && timer.timer" color="error" class="pr-1" prepend-icon="mdi-timer-outline">
    <span class="text-truncate cursor-pointer" @click="projects.openTask(timer.timer.taskId)">{{ timer.timer.taskTitle }}</span>
    <span class="ml-2 font-weight-medium">{{ formatElapsed(timer.elapsedMs) }}</span>
    <v-tooltip location="top" :text="t('projects.time.stop')"><template #activator="{ props: tip }"><v-btn v-bind="tip" icon="mdi-stop" size="x-small" variant="text" class="ml-1" :loading="timer.busy" :aria-label="t('projects.time.stop')" @click="stop" /></template></v-tooltip>
    <v-menu>
      <template #activator="{ props: menu }">
        <v-btn v-bind="menu" icon="mdi-dots-vertical" size="x-small" variant="text" :aria-label="t('projects.menu')" />
      </template>
      <v-list density="compact">
        <v-list-item prepend-icon="mdi-trash-can-outline" :title="t('projects.time.discard')" @click="timer.discard()" />
      </v-list>
    </v-menu>
  </v-chip>
</template>
