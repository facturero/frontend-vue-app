<template>
  <v-menu min-width="340" transition="slide-y-transition" location="bottom center" :offset="[0, 8]" @update:model-value="onOpen">
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
      <div class="d-flex align-center px-4 py-2">
        <span class="text-subtitle-2">{{ $t('notifications.title') }}</span>
        <v-spacer />
        <v-btn
          v-if="realtime.unread > 0"
          variant="text"
          size="small"
          density="comfortable"
          @click="realtime.markAllRead()"
        >
          {{ $t('notifications.markAllRead') }}
        </v-btn>
      </div>
      <v-divider />
      <v-list density="compact" max-height="360" class="py-0">
        <v-list-item
          v-for="n in realtime.items"
          :key="n.id"
          :class="{ 'bg-lightprimary': !n.read }"
          @click="open(n)"
        >
          <template #prepend>
            <v-avatar :color="n.read ? 'grey-lighten-3' : 'lightprimary'" size="36" class="mr-2">
              <v-icon :icon="iconFor(n.event)" :color="n.read ? 'medium-emphasis' : 'primary'" size="20" />
            </v-avatar>
          </template>
          <v-list-item-title class="text-body-2" :class="{ 'font-weight-medium': !n.read }">
            {{ $t(n.titleKey) }}
          </v-list-item-title>
          <v-list-item-subtitle class="text-caption">
            {{ n.detail }}<template v-if="n.detail"> · </template>{{ timeAgo(n.at) }}
          </v-list-item-subtitle>
        </v-list-item>
      </v-list>
      <div v-if="!realtime.items.length" class="text-center text-medium-emphasis pa-8">
        <v-icon icon="mdi-bell-off-outline" size="48" class="mb-4" />
        <p class="text-body-2">{{ $t('notifications.empty') }}</p>
      </div>
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  useRealtimeStore,
  routeForEvent,
  type RealtimeNotification,
} from '@/stores/realtime';

const { t } = useI18n();
const router = useRouter();
const realtime = useRealtimeStore();

/** Al abrir se recarga del servidor, pero NO se marca nada leído: con estado
 *  real de lectura, vaciar el badge por abrir el menú es perder el aviso. */
function onOpen(open: boolean): void {
  if (open) void realtime.fetchNotifications();
}

/** Click en una notificación: se marca leída y lleva al elemento del que habla. */
function open(n: RealtimeNotification): void {
  void realtime.markRead(n);
  const to = routeForEvent(n.event, n.data);
  if (to) router.push(to);
}

function iconFor(event: string): string {
  if (event === 'plugin.activated') return 'mdi-puzzle-check';
  if (event === 'plugin.deactivated') return 'mdi-puzzle-remove';
  if (event === 'plugin.created') return 'mdi-puzzle-plus';
  if (event === 'billing.invoice.issued') return 'mdi-file-document-check-outline';
  if (event === 'billing.invoice.voided') return 'mdi-file-document-remove-outline';
  if (event === 'identity.user.enabled') return 'mdi-account-check-outline';
  if (event === 'identity.user.disabled') return 'mdi-account-cancel-outline';
  if (event === 'identity.user.invited') return 'mdi-account-plus-outline';
  return 'mdi-bell-ring-outline';
}

function timeAgo(at: number): string {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return t('notifications.justNow');
  if (s < 3600) return t('notifications.minutesAgo', { n: Math.floor(s / 60) });
  return t('notifications.hoursAgo', { n: Math.floor(s / 3600) });
}
</script>
