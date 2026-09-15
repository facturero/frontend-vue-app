<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { usePluginsStore } from '@/stores/plugins';
import { usePluginsRealtime } from '@/composable/usePluginsRealtime';
import PluginCatalogTab from '@/components/plugins/PluginCatalogTab.vue';
import MyPluginsTab from '@/components/plugins/MyPluginsTab.vue';
import CustomRequestsTab from '@/components/plugins/CustomRequestsTab.vue';
import PageHeader from '@/components/ui/PageHeader.vue';

const store = usePluginsStore();
const route = useRoute();
const tab = ref('catalog');

// ?q=… llega desde el buscador de la barra superior: aterriza en el catálogo ya filtrado.
const catalogSearch = computed(() => (route.query.q as string | undefined) ?? '');
watch(catalogSearch, (q) => {
  if (q) tab.value = 'catalog';
}, { immediate: true });

usePluginsRealtime();

onMounted(() => {
  void store.fetchCatalog();
});

const currentProfile = computed(() => store.myProfile?.profile ?? null);
const profilePending = computed(() => store.myProfile?.status === 'pending');
</script>

<template>
  <v-container>
    <PageHeader :title="$t('plugins.title')">
      <template #actions>

      </template>
    </PageHeader>

    <v-alert
      v-if="currentProfile"
      type="info"
      class="mb-4"
    >
      <div class="d-flex flex-wrap align-center ga-2">
        <v-icon :icon="currentProfile.icon" />
        <span class="text-body-2">
          {{ $t('plugins.profileBand', { name: currentProfile.name }) }}
        </span>
        <v-btn
          variant="text"
          size="small"
          :to="{ name: 'business-profile', query: { source: 'settings' } }"
          class="ml-auto"
        >
          {{ $t('plugins.changeProfile') }}
        </v-btn>
      </div>
    </v-alert>

    <v-alert v-else-if="profilePending" type="warning" class="mb-4">
      <div class="d-flex flex-wrap align-center ga-2">
        <span class="text-body-2">{{ $t('plugins.profilePending') }}</span>
        <v-btn
          variant="text"
          size="small"
          :to="{ name: 'business-profile' }"
          class="ml-auto"
        >
          {{ $t('plugins.chooseProfile') }}
        </v-btn>
      </div>
    </v-alert>

    <v-tabs v-model="tab" color="primary" class="mb-4">
      <v-tab value="catalog" prepend-icon="mdi-storefront-outline">{{ $t('plugins.tabCatalog') }}</v-tab>
      <v-tab value="my" prepend-icon="mdi-puzzle-outline">{{ $t('plugins.tabMine') }}</v-tab>
      <v-tab value="custom" prepend-icon="mdi-file-document-edit-outline">{{ $t('plugins.tabCustom') }}</v-tab>
    </v-tabs>

    <v-tabs-window v-model="tab">
      <v-tabs-window-item value="catalog">
        <PluginCatalogTab :initial-search="catalogSearch" />
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
