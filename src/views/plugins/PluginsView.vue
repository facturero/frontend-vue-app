<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { usePluginsStore } from '@/stores/plugins';
import { usePluginsRealtime } from '@/composable/usePluginsRealtime';
import PluginCatalogTab from '@/components/plugins/PluginCatalogTab.vue';
import MyPluginsTab from '@/components/plugins/MyPluginsTab.vue';
import CustomRequestsTab from '@/components/plugins/CustomRequestsTab.vue';

const store = usePluginsStore();
const tab = ref('catalog');

usePluginsRealtime();

onMounted(() => {
  void store.fetchCatalog();
});
</script>

<template>
  <v-container>
    <div class="d-flex align-center justify-space-between mt-6 mb-4">
      <h2 class="text-h5 font-weight-medium">Plugins</h2>
    </div>

    <v-tabs v-model="tab" color="primary" class="mb-4">
      <v-tab value="catalog" prepend-icon="mdi-storefront-outline">Catálogo</v-tab>
      <v-tab value="my" prepend-icon="mdi-puzzle-outline">Mis plugins</v-tab>
      <v-tab value="custom" prepend-icon="mdi-file-document-edit-outline">A medida</v-tab>
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
