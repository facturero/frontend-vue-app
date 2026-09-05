<script setup lang="ts">
import { computed } from 'vue';
import { useDisplay } from 'vuetify';
import { useUiStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import { usePluginsStore } from '@/stores/plugins';
import { getNavigationItems } from '@/menus/navigation';

const ui = useUiStore();
const auth = useAuthStore();
const plugins = usePluginsStore();
const { mobile } = useDisplay();

const allowedWhenBlocked = ['/profile', '/organization/settings'];

const items = computed(() =>
  getNavigationItems()
    .filter((item) => !item.permission || auth.can(item.permission))
    .filter((item) => plugins.isActive(item.plugin))
    .map((item) => ({
      ...item,
      blocked: auth.needsOrgSetup && !allowedWhenBlocked.includes(item.to ?? ''),
    })),
);
</script>

<template>
  <v-navigation-drawer v-model="ui.drawer" :rail="!mobile && ui.rail" :permanent="!mobile" :temporary="mobile"
    expand-on-hover>
    <div class="flex-grow-1 overflow-y-auto overflow-x-hidden">
      <!-- Sin `color`: el ítem activo se pinta como píldora sólida (ver <style>). -->
      <v-list nav density="compact">

        <v-list-item prepend-icon="mdi-alpha-c-circle" :title="$t('nav.brand')" :subtitle="$t('nav.brandSubtitle')"
          class="drawer-brand" />
        <v-divider />

        <template v-for="item in items" :key="item.titleKey">
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
          <v-list-item v-else :to="item.to" :prepend-icon="item.icon" :title="$t(item.titleKey)" rounded="lg" />
        </template>
      </v-list>
    </div>

    <template #append>
      <v-divider />
      <v-list-item prepend-icon="mdi-chevron-left" :title="$t('nav.collapse')" @click="ui.toggleRail()"
        class="flex-shrink-0" />
    </template>
  </v-navigation-drawer>
</template>

<style scoped>
.drawer-brand {
  min-height: 64px;
}

/*
 * Ítem activo como píldora sólida en vez del resaltado tenue de Vuetify.
 * `!important` es necesario: Vuetify aplica el suyo con mayor especificidad
 * mediante la capa de overlay del propio v-list-item.
 */
.v-list-item--active {
  background-color: rgb(var(--v-theme-primary)) !important;
  color: rgb(var(--v-theme-on-primary)) !important;
}

.v-list-item--active :deep(.v-list-item__overlay) {
  opacity: 0;
}

.lock-icon {
  position: absolute;
  bottom: 2px;
  right: -2px;
  background: rgba(var(--v-theme-surface), 0.85);
  border-radius: 50%;
  padding: 1px;
}
</style>
