<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { usePluginsStore } from '@/stores/plugins';
import { usePluginCartStore } from '@/stores/pluginCart';
import { usePluginsRealtime } from '@/composable/usePluginsRealtime';
import PluginCatalogTab from '@/components/plugins/PluginCatalogTab.vue';
import PluginCartDialog from '@/components/plugins/PluginCartDialog.vue';
import MyPluginsTab from '@/components/plugins/MyPluginsTab.vue';
import CustomRequestsTab from '@/components/plugins/CustomRequestsTab.vue';
import PageHeader from '@/components/ui/PageHeader.vue';

const store = usePluginsStore();
const cart = usePluginCartStore();
const route = useRoute();
const tab = ref('catalog');

// ?q=… llega desde el buscador de la barra superior: aterriza en el catálogo ya filtrado.
const catalogSearch = computed(() => (route.query.q as string | undefined) ?? '');
watch(catalogSearch, (q) => {
  if (q) tab.value = 'catalog';
}, { immediate: true });

usePluginsRealtime();

// Reactivar un módulo desactivado lo agrega al carrito y lo abre: pasa por la misma cotización (precio, prueba gratis,
// código de descuento) que una activación nueva.
async function reactivate(code: string): Promise<void> {
  await cart.add(code);
  await cart.openCart();
}

onMounted(() => {
  void store.fetchCatalog();
  // El carrito guardado en el servidor: lo dejado pendiente en otra sesión o equipo aparece aquí.
  if (!cart.loaded) void cart.load();
});

const currentProfile = computed(() => store.myProfile?.profile ?? null);
const profilePending = computed(() => store.myProfile?.status === 'pending');
</script>

<template>
  <v-container>
    <PageHeader :title="$t('plugins.title')">
      <template #actions>
        <v-badge :content="cart.count" :model-value="cart.count > 0" color="primary">
          <v-btn prepend-icon="mdi-cart-outline" @click="cart.openCart()">{{ $t('plugins.cart.title') }}</v-btn>
        </v-badge>
      </template>
    </PageHeader>

    <v-alert v-if="cart.error && !cart.open" type="error" closable class="mb-4" @click:close="cart.error = null">
      {{ cart.error }}
    </v-alert>

    <v-alert
      v-if="cart.lastActivated !== null"
      type="success"
      closable
      class="mb-4"
      @click:close="cart.lastActivated = null"
    >
      {{ $t('plugins.cart.activated', { count: cart.lastActivated }) }}
    </v-alert>

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
        <MyPluginsTab @reactivate="reactivate" />
      </v-tabs-window-item>

      <v-tabs-window-item value="custom">
        <CustomRequestsTab />
      </v-tabs-window-item>
    </v-tabs-window>
    <PluginCartDialog />
  </v-container>
</template>
