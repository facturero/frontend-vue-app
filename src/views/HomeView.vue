<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useCustomerStore } from '@/stores/customers';
import { useEmployeeStore } from '@/stores/employees';
import { useProductStore } from '@/stores/products';
import { useInvoiceStore } from '@/stores/invoices';
import { usePluginsStore } from '@/stores/plugins';
import PageHeader from '@/components/ui/PageHeader.vue';

const { t, locale } = useI18n();
const auth = useAuthStore();
const router = useRouter();
const customers = useCustomerStore();
const employees = useEmployeeStore();
const products = useProductStore();
const invoices = useInvoiceStore();
const plugins = usePluginsStore();

const loading = ref(true);
const loadError = ref<string | null>(null);

const todayLabel = computed(() =>
  new Date().toLocaleDateString(locale.value, { weekday: 'long', day: 'numeric', month: 'long' }),
);

const activeCustomers = computed(() => customers.list.filter((c) => c.status === 'active').length);
const activeEmployees = computed(() => employees.list.filter((e) => e.status === 'active').length);
const activeProducts = computed(() => products.list.filter((p) => p.status === 'active').length);
const issuedInvoices = computed(() => invoices.list.filter((i) => i.status === 'issued').length);

/**
 * Cada tarjeta declara de qué depende y de dónde saca su número. El permiso no
 * basta: el fundador nace con todos, así que una organización recién creada
 * pedía clientes, productos y facturas a módulos que aún no tiene activos y se
 * llevaba tres 403 del gateway. Se filtra también por plugin, igual que el menú
 * lateral, y las peticiones salen de esta misma lista para que lo que se pide y
 * lo que se enseña no puedan separarse.
 */
const cards = computed(() =>
  [
    {
      key: 'customers',
      label: t('home.activeCustomers'),
      icon: 'mdi-account-group-outline',
      bg: 'lightprimary',
      fg: 'primary',
      permission: 'customer:read',
      plugin: 'crm.contacts',
      value: activeCustomers.value,
      fetch: () => customers.fetch(),
    },
    {
      key: 'employees',
      label: t('home.activeEmployees'),
      icon: 'mdi-account-tie-outline',
      bg: 'lightinfo',
      fg: 'info',
      permission: 'user:read',
      // Los empleados son del núcleo (auth-service): no hay plugin que activar.
      plugin: null,
      value: activeEmployees.value,
      fetch: () => employees.fetch(),
    },
    {
      key: 'products',
      label: t('home.activeProducts'),
      icon: 'mdi-package-variant-closed',
      bg: 'lightsuccess',
      fg: 'success',
      permission: 'product:read',
      plugin: 'infra.catalog_products',
      value: activeProducts.value,
      fetch: () => products.fetch(),
    },
    {
      key: 'invoices',
      label: t('home.issuedInvoices'),
      icon: 'mdi-file-document-outline',
      bg: 'lightwarning',
      fg: 'warning',
      permission: 'invoice:read',
      plugin: 'finance.electronic_invoicing',
      value: issuedInvoices.value,
      fetch: () => invoices.fetch(),
    },
  ].filter((c) => auth.can(c.permission) && plugins.isActive(c.plugin ?? undefined)),
);

onMounted(async () => {
  try {
    await auth.fetchMe();
    if (auth.needsOrg) {
      router.replace({ name: 'profile' });
      return;
    }
    if (auth.needsOrgSetup) {
      router.replace({ name: 'organization-settings' });
      return;
    }
    await Promise.all(cards.value.map((c) => c.fetch())).catch(() => {
      /* fallback silencioso: las tarjetas muestran 0 si un servicio falla */
    });
  } catch (e) {
    const err = e as { response?: { data?: { message?: string } } };
    loadError.value = err?.response?.data?.message ?? t('home.loadError');
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <v-container>
    <PageHeader :title="$t('home.title')" />

    <v-alert v-if="loadError" type="error" class="mb-4" :text="loadError" />

    <v-alert
      v-if="plugins.lastBatchResults"
      type="success"
      closable
      class="mb-4"
      @click:close="plugins.lastBatchResults = null"
    >
      <template #title>{{ $t('home.batchResults.title') }}</template>
      <div class="text-body-2">
        {{
          $t('home.batchResults.summary', {
            activated: plugins.lastBatchResults.filter((r) => r.result === 'activated').length,
            failed: plugins.lastBatchResults.filter((r) => r.result !== 'activated').length,
          })
        }}
      </div>
      <ul v-if="plugins.lastBatchResults.some((r) => r.result !== 'activated')" class="ml-4 text-caption">
        <li v-for="r in plugins.lastBatchResults.filter((r) => r.result !== 'activated')" :key="r.code">
          {{ r.code }}
          — {{ $t(`home.batchResults.reasons.${r.result}`) }}
        </li>
      </ul>
    </v-alert>

    <v-row v-if="loading" dense>
      <v-col cols="12" class="text-center py-12">
        <v-progress-circular indeterminate color="primary" />
      </v-col>
    </v-row>

    <v-row v-else dense>
      <v-col v-for="c in cards" :key="c.key" cols="12" sm="6" lg="3">
        <v-card class="fill-height">
          <v-card-text>
            <div class="d-flex align-center ga-4">
              <v-sheet :color="c.bg" class="w-13 h-13 d-flex align-center justify-center">
                <v-icon :icon="c.icon" :color="c.fg" size="26" />
              </v-sheet>
              <div>
                <div class="text-body-2 text-medium-emphasis">{{ c.label }}</div>
                <div class="text-h5 font-weight-bold">{{ c.value }}</div>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-card class="mt-6">
      <v-card-text>
        <div class="text-h6 font-weight-bold mb-1">
          <i18n-t keypath="home.welcome" tag="span">
            <template #org>{{ auth.user?.orgName || auth.user?.email }}</template>
          </i18n-t>
        </div>
        <i18n-t keypath="home.today" tag="span" class="text-body-2 text-medium-emphasis">
          <template #date>{{ todayLabel }}</template>
        </i18n-t>
      </v-card-text>
    </v-card>
  </v-container>
</template>