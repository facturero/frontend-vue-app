<script setup lang="ts">
import { useRoute } from 'vue-router';
import { isNavItemActive, type NavItem } from '@/menus/navigation';

/**
 * Una pantalla del menú lateral: enlace (marcado también en sus pantallas internas), bloqueada mientras falta configurar la
 * organización, o «Pronto». Va aparte de AppNavigationDrawer porque la misma fila sale suelta o dentro de un grupo.
 */
defineProps<{ item: NavItem & { blocked: boolean } }>();
const route = useRoute();
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
    rounded="lg" />
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
