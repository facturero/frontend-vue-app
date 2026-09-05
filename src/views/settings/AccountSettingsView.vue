<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { usePluginsStore } from '@/stores/plugins';
import PageHeader from '@/components/ui/PageHeader.vue';
import ProfileView from '@/views/ProfileView.vue';
import OrganizationSettingsView from '@/views/organization/OrganizationSettingsView.vue';
import EstablishmentsView from '@/views/organization/EstablishmentsView.vue';
import CertificatesView from '@/views/organization/CertificatesView.vue';

interface SettingsTab {
  key: string;
  titleKey: string;
  icon: string;
  component: unknown;
  visible: boolean;
}

const auth = useAuthStore();
const plugins = usePluginsStore();
const route = useRoute();

const activeTab = ref('profile');

const tabs: SettingsTab[] = [
  {
    key: 'profile',
    titleKey: 'common.myProfile',
    icon: 'mdi-account-circle-outline',
    component: ProfileView,
    visible: true,
  },
  {
    key: 'organization',
    titleKey: 'organization.settingsTitle',
    icon: 'mdi-domain',
    component: OrganizationSettingsView,
    visible: auth.can('organization:admin'),
  },
  {
    key: 'establishments',
    titleKey: 'establishments.title',
    icon: 'mdi-store-outline',
    component: EstablishmentsView,
    visible: auth.can('establishment:read') && plugins.isActive('org.establishments'),
  },
  {
    key: 'certificates',
    titleKey: 'certificates.title',
    icon: 'mdi-file-certificate-outline',
    component: CertificatesView,
    visible: auth.can('fiscal:manage') && plugins.isActive('finance.electronic_certificate'),
  },
];

const visibleTabs = computed(() => tabs.filter((t) => t.visible));

const currentTab = computed(() => {
  const found = visibleTabs.value.find((t) => t.key === activeTab.value);
  return found ?? visibleTabs.value[0];
});

// El arquetipo F consolidó las 4 rutas en una: un deep-link ?tab=xxx aterriza
// directo en su pestaña (p. ej. desde las tarjetas del onboarding).
function applyQuery(): void {
  const tab = route.query.tab as string | undefined;
  if (tab && visibleTabs.value.some((t) => t.key === tab)) {
    activeTab.value = tab;
  } else if (!visibleTabs.value.some((t) => t.key === activeTab.value)) {
    activeTab.value = visibleTabs.value[0]?.key ?? 'profile';
  }
}

onMounted(applyQuery);
watch(() => route.query.tab, applyQuery);
</script>

<template>
  <v-container fluid>
    <PageHeader :title="$t('nav.settings')" />

    <v-card>
      <v-tabs v-model="activeTab" color="primary" grow>
        <v-tab v-for="tab in visibleTabs" :key="tab.key" :value="tab.key" :prepend-icon="tab.icon">
          {{ $t(tab.titleKey) }}
        </v-tab>
      </v-tabs>

      <v-card-text class="pa-6" v-if="currentTab">
        <!-- key remonta la vista al cambiar de pestaña: evita datos stale y
             detiene polling (puntos de emisión) sin dependencias del ciclo -->
        <component :is="currentTab.component" :key="currentTab.key" :embedded="true" />
      </v-card-text>
    </v-card>
  </v-container>
</template>