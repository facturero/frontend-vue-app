<script setup lang="ts">
import { computed } from 'vue';
import { useDisplay } from 'vuetify';
import { useUiStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import { getNavigationItems } from '@/menus/navigation';

const ui = useUiStore();
const auth = useAuthStore();
const { mobile } = useDisplay();

const items = computed(() =>
  getNavigationItems().filter((item) => !item.permission || auth.can(item.permission)),
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
          <v-list-item v-if="!item.soon" :to="item.to" :prepend-icon="item.icon" :title="item.title" rounded="lg" />
          <v-list-item v-else :prepend-icon="item.icon" :title="item.title" disabled rounded="lg">
            <template #append>
              <v-chip size="x-small" color="secondary" variant="tonal">pronto</v-chip>
            </template>
          </v-list-item>
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
</style>
