<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { isNavItemActive, type NavItem } from '@/menus/navigation';
import { useChatStore } from '@/stores/chat';

/**
 * Una pantalla del menú lateral: enlace (marcado también en sus pantallas internas), bloqueada mientras falta configurar la
 * organización, o «Pronto». Va aparte de AppNavigationDrawer porque la misma fila sale suelta o dentro de un grupo.
 */
const props = defineProps<{ item: NavItem & { blocked: boolean } }>();
const route = useRoute();
const chat = useChatStore();
/** Contador del ítem: menciones y DMs sin leer en rojo con su número; si solo hay algo sin leer, un punto. */
const badge = computed(() => (props.item.badge === 'chat' ? chat.badge : null));
</script>

<template>
  <v-list-item v-if="item.soon" :prepend-icon="item.icon" :title="$t(item.titleKey)" disabled rounded="lg">
    <template #append>
      <v-chip size="x-small" color="secondary">{{ $t('nav.comingSoon') }}</v-chip>
    </template>
  </v-list-item>
  <v-list-item v-else-if="item.blocked" disabled rounded="lg">
    <template #prepend>
      <v-icon :icon="item.icon" class="mr-2" />
      <v-icon icon="mdi-lock-outline" size="x-small" class="lock-icon" />
    </template>
    <v-list-item-title>{{ $t(item.titleKey) }}</v-list-item-title>
  </v-list-item>
  <!-- `active` explícito: el router solo marca la ruta exacta, y las pantallas internas (nuevo, editar, detalle) deben dejar marcado el ítem. -->
  <v-list-item v-else :to="item.to" :active="isNavItemActive(item, route.path)" :prepend-icon="item.icon" :title="$t(item.titleKey)"
    rounded="lg">
    <template v-if="badge && (badge.mentions || badge.any)" #append>
      <v-badge v-if="badge.mentions" :content="badge.mentions > 99 ? '99+' : badge.mentions" color="error" inline />
      <v-badge v-else dot color="primary" inline />
    </template>
  </v-list-item>
</template>

<style scoped>
.lock-icon {
  position: absolute;
  bottom: 2px;
  right: -2px;
  background: rgba(var(--v-theme-surface), 0.85);
  border-radius: 50%;
  padding: 1px;
}
</style>
