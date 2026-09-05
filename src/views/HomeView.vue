<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useCustomerStore } from '@/stores/customers';
import { useEmployeeStore } from '@/stores/employees';
import { useProductStore } from '@/stores/products';
import { useInvoiceStore } from '@/stores/invoices';
import PageHeader from '@/components/ui/PageHeader.vue';

const { t, locale } = useI18n();
const auth = useAuthStore();
const router = useRouter();
const customers = useCustomerStore();
const employees = useEmployeeStore();
const products = useProductStore();
const invoices = useInvoiceStore();

const loading = ref(true);
const loadError = ref<string | null>(null);

const todayLabel = computed(() =>
  new Date().toLocaleDateString(locale.value, { weekday: 'long', day: 'numeric', month: 'long' }),
);

const activeCustomers = computed(() => customers.list.filter((c) => c.status === 'active').length);
const activeEmployees = computed(() => employees.list.filter((e) => e.status === 'active').length);
const activeProducts = computed(() => products.list.filter((p) => p.status === 'active').length);
const issuedInvoices = computed(() => invoices.list.filter((i) => i.status === 'issued').length);

const cards = computed(() =>
  [
    {
      key: 'customers',
      label: t('home.activeCustomers'),
      icon: 'mdi-account-group-outline',
      bg: 'lightprimary',
      fg: 'primary',
      permission: 'customer:read',
      value: activeCustomers.value,
    },
    {
      key: 'employees',
      label: t('home.activeEmployees'),
      icon: 'mdi-account-tie-outline',
      bg: 'lightinfo',
      fg: 'info',
      permission: 'user:read',
      value: activeEmployees.value,
    },
    {
      key: 'products',
      label: t('home.activeProducts'),
      icon: 'mdi-package-variant-closed',
      bg: 'lightsuccess',
      fg: 'success',
      permission: 'product:read',
      value: activeProducts.value,
    },
    {
      key: 'invoices',
      label: t('home.issuedInvoices'),
      icon: 'mdi-file-document-outline',
      bg: 'lightwarning',
      fg: 'warning',
      permission: 'invoice:read',
      value: issuedInvoices.value,
    },
  ].filter((c) => auth.can(c.permission)),
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
    const tasks: Promise<void>[] = [];
    if (auth.can('customer:read')) tasks.push(customers.fetch());
    if (auth.can('user:read')) tasks.push(employees.fetch());
    if (auth.can('product:read')) tasks.push(products.fetch());
    if (auth.can('invoice:read')) tasks.push(invoices.fetch());
    await Promise.all(tasks).catch(() => {
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