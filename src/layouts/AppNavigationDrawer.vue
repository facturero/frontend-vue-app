<script setup lang="ts">
import { computed } from 'vue';
import { useDisplay } from 'vuetify';
import { useUiStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import { getNavigationItems } from '@/menus/navigation';

const ui = useUiStore();
const auth = useAuthStore();
const { mobile } = useDisplay();

const allowedWhenBlocked = ['/profile', '/organization/settings'];

const items = computed(() =>
  getNavigationItems()
    .filter((item) => !item.permission || auth.can(item.permission))
    .map((item) => ({
      ...item,
      blocked: auth.needsOrgSetup && !allowedWhenBlocked.includes(item.to ?? ''),
    })),
);
</script>

<template>
  <v-navigation-drawer v-model="ui.drawer" :rail="!mobile && ui.rail" :permanent="!mobile" :temporary="mobile"
    expand-on-hover>
    <div class="drawer-nav-scroll">
      <v-list nav density="compact" color="primary">

        <v-list-item prepend-icon="mdi-alpha-c-circle" title="CRM" subtitle="Panel de adm." class="drawer-brand" />
        <v-divider />

        <template v-for="item in items" :key="item.title">
          <v-list-item v-if="item.soon" :prepend-icon="item.icon" :title="item.title" disabled rounded="lg">
            <template #append>
              <v-chip size="x-small" color="secondary" variant="tonal">pronto</v-chip>
            </template>
          </v-list-item>
          <v-list-item v-else-if="item.blocked" disabled rounded="lg">
            <template #prepend>
              <v-icon :icon="item.icon" class="mr-2" />
              <v-icon icon="mdi-lock-outline" size="x-small" class="lock-icon" />
            </template>
            <v-list-item-title>{{ item.title }}</v-list-item-title>
          </v-list-item>
          <v-list-item v-else :to="item.to" :prepend-icon="item.icon" :title="item.title" rounded="lg" />
        </template>
      </v-list>
    </div>

    <template #append>
      <v-divider />
      <v-list-item prepend-icon="mdi-chevron-left" title="Colapsar" @click="ui.toggleRail()"
        class="drawer-collapse-btn" />
    </template>
  </v-navigation-drawer>
</template>

<style scoped>
.drawer-brand {
  min-height: 64px;
}

.drawer-nav-scroll {
  flex: 1 1 auto;
  overflow-y: auto;
  overflow-x: hidden;
}

.drawer-collapse-btn {
  flex-shrink: 0;
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
