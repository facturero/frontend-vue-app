<template>
  <v-menu min-width="320" transition="slide-y-transition" location="bottom center" :offset="[0, 8]" @update:model-value="onOpen">
    <template #activator="{ props }">
      <v-btn icon v-bind="props">
        <v-badge
          :content="realtime.unread"
          :model-value="realtime.unread > 0"
          color="error"
          offset="-2"
        >
          <v-icon icon="mdi-bell-outline" />
        </v-badge>
      </v-btn>
    </template>
    <v-card>
      <v-list density="compact" max-height="360" class="py-0">
        <v-list-item v-for="n in realtime.items" :key="n.id" @click="goToPlugins()">
          <template #prepend>
            <v-icon :icon="iconFor(n.event)" />
          </template>
          <v-list-item-title class="text-body-2">{{ n.title }}</v-list-item-title>
          <v-list-item-subtitle class="text-caption">
            {{ n.detail }}<template v-if="n.detail"> · </template>{{ timeAgo(n.at) }}
          </v-list-item-subtitle>
        </v-list-item>
      </v-list>
      <div v-if="!realtime.items.length" class="text-center text-medium-emphasis pa-8">
        <v-icon icon="mdi-bell-off-outline" size="48" class="mb-4" />
        <p class="text-body-2">Sin notificaciones</p>
      </div>
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useRealtimeStore, type RealtimeNotification } from '@/stores/realtime';

const router = useRouter();
const realtime = useRealtimeStore();

function onOpen(open: boolean): void {
  if (open) realtime.markAllRead();
}

function goToPlugins(): void {
  router.push('/plugins');
}

function iconFor(event: string): string {
  if (event === 'plugin.activated') return 'mdi-puzzle-check';
  if (event === 'plugin.deactivated') return 'mdi-puzzle-remove';
  if (event === 'plugin.created') return 'mdi-puzzle-plus';
  return 'mdi-bell-ring-outline';
}

function timeAgo(at: number): string {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  return `hace ${Math.floor(s / 3600)} h`;
}
</script>
