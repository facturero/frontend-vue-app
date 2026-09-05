<script setup lang="ts">
import { useI18n } from 'vue-i18n';

/**
 * Bandeja de mensajes de la barra superior. Hoy no hay fuente de datos (la API
 * aún no la expone), así que el patrón visual se prepara aquí: mensajes con
 * avatar tonal, título y extracto. Quien conecte el origen solo tiene que pasar
 * `messages`.
 */
export interface InboxMessage {
  id: string;
  title: string;
  excerpt: string;
  at?: number;
}

withDefaults(defineProps<{ messages?: InboxMessage[] }>(), { messages: () => [] });

const { t } = useI18n();

function timeAgo(at?: number): string {
  if (!at) return '·';
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return t('notifications.justNow');
  if (s < 3600) return t('notifications.minutesAgo', { n: Math.floor(s / 60) });
  return t('notifications.hoursAgo', { n: Math.floor(s / 3600) });
}
</script>

<template>
  <v-menu min-width="340" transition="slide-y-transition" location="bottom center" :offset="[0, 8]">
    <template #activator="{ props }">
      <v-btn icon v-bind="props">
        <v-icon icon="mdi-email-outline" />
      </v-btn>
    </template>
    <v-card>
      <v-list density="compact" max-height="360" class="py-0">
        <v-list-item v-for="m in messages" :key="m.id">
          <template #prepend>
            <v-avatar color="lightinfo" size="40" class="mr-2">
              <v-icon icon="mdi-email-outline" color="info" size="20" />
            </v-avatar>
          </template>
          <v-list-item-title class="text-body-2 font-weight-medium">{{ m.title }}</v-list-item-title>
          <v-list-item-subtitle class="text-caption">
            {{ m.excerpt }}<template v-if="m.at"> · {{ timeAgo(m.at) }}</template>
          </v-list-item-subtitle>
        </v-list-item>
      </v-list>
      <div v-if="!messages.length" class="text-center text-medium-emphasis pa-8">
        <v-icon icon="mdi-email-off-outline" size="48" class="mb-4" />
        <p class="text-body-2">{{ $t('messages.empty') }}</p>
      </div>
    </v-card>
  </v-menu>
</template>