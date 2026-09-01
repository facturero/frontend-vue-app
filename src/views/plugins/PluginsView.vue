<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { usePluginsStore } from '@/stores/plugins';
import { usePluginsRealtime } from '@/composable/usePluginsRealtime';
import PluginCatalogTab from '@/components/plugins/PluginCatalogTab.vue';
import MyPluginsTab from '@/components/plugins/MyPluginsTab.vue';
import CustomRequestsTab from '@/components/plugins/CustomRequestsTab.vue';
import PageHeader from '@/components/ui/PageHeader.vue';

const store = usePluginsStore();
const tab = ref('catalog');

usePluginsRealtime();

onMounted(() => {
  void store.fetchCatalog();
});
</script>

<template>
  <v-container>
    <PageHeader :title="$t('plugins.title')">
      <template #actions>

      </template>
    </PageHeader>

    <v-tabs v-model="tab" color="primary" class="mb-4">
      <v-tab value="catalog" prepend-icon="mdi-storefront-outline">{{ $t('plugins.tabCatalog') }}</v-tab>
      <v-tab value="my" prepend-icon="mdi-puzzle-outline">{{ $t('plugins.tabMine') }}</v-tab>
      <v-tab value="custom" prepend-icon="mdi-file-document-edit-outline">{{ $t('plugins.tabCustom') }}</v-tab>
    </v-tabs>

    <v-tabs-window v-model="tab">
      <v-tabs-window-item value="catalog">
        <PluginCatalogTab />
      </v-tabs-window-item>

      <v-tabs-window-item value="my">
        <MyPluginsTab />
      </v-tabs-window-item>

      <v-tabs-window-item value="custom">
        <CustomRequestsTab />
      </v-tabs-window-item>
    </v-tabs-window>
  </v-container>
</template>
