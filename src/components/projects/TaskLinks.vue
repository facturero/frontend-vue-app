<script setup lang="ts">
import { computed, ref, watch, mergeProps } from 'vue';
import { useI18n } from 'vue-i18n';
import { customerApi } from '@/api/customers';
import { invoiceApi } from '@/api/invoices';
import { productApi } from '@/api/products';
import { purchasingApi } from '@/api/purchasing';
import { useAuthStore } from '@/stores/auth';
import { usePluginsStore } from '@/stores/plugins';
import { useProjectsStore } from '@/stores/projects';
import { LINK_ICON, linkRoute } from '@/utils/projects';
import type { LinkEntity } from '@/types/projects';

/**
 * «Vinculado a»: la tarea apunta a un cliente, una factura, una orden de compra o un producto. Es lo que Asana no tiene y nosotros sí,
 * porque el proyecto vive junto al ERP: desde la ficha del cliente se ven sus tareas y desde la tarea se abre el cliente.
 *
 * Solo se ofrecen los tipos cuyo módulo está activo y que la persona puede leer; el texto del vínculo es el que se veía al elegir
 * (projects-service no puede preguntar a los otros servicios el nombre del registro).
 */
const props = defineProps<{ canEdit: boolean }>();
const { t } = useI18n();
const store = useProjectsStore();
const auth = useAuthStore();
const plugins = usePluginsStore();

interface Option {
  value: string;
  title: string;
  subtitle?: string;
}

const SOURCES: Array<{ type: LinkEntity; plugin: string; permission: string | null; search: (q: string) => Promise<Option[]> }> = [
  {
    type: 'customer',
    plugin: 'crm.contacts',
    permission: 'customer:read',
    search: async (q) =>
      (await customerApi.list({ search: q, status: 'active' })).slice(0, 20).map((c) => ({ value: c.id, title: c.tradeName || c.businessName, subtitle: c.identification ?? undefined })),
  },
  {
    type: 'invoice',
    plugin: 'finance.electronic_invoicing',
    permission: 'invoice:read',
    // El listado de facturas no busca en el servidor: se filtra aquí por número o cliente.
    search: async (q) => {
      const needle = q.toLowerCase();
      return (await invoiceApi.list())
        .filter((i) => !needle || (i.number ?? '').toLowerCase().includes(needle) || i.customerName.toLowerCase().includes(needle))
        .slice(0, 20)
        .map((i) => ({ value: i.id, title: i.number ?? t('projects.links.draftInvoice'), subtitle: i.customerName }));
    },
  },
  {
    type: 'purchase_order',
    plugin: 'purchasing.purchase_orders',
    permission: 'purchase:read',
    search: async (q) =>
      (await purchasingApi.listOrders({ q: q || undefined })).items
        .slice(0, 20)
        .map((o) => ({ value: o.id, title: o.number ?? t('projects.links.draftOrder'), subtitle: o.supplier.legalName })),
  },
  {
    type: 'product',
    plugin: 'infra.catalog_products',
    permission: null,
    search: async (q) => (await productApi.list({ search: q || undefined, pageSize: 20 })).items.map((p) => ({ value: p.id, title: p.name, subtitle: p.sku ?? undefined })),
  },
];

const available = computed(() => SOURCES.filter((s) => plugins.isActive(s.plugin) && (!s.permission || auth.can(s.permission))));
const typeItems = computed(() => available.value.map((s) => ({ value: s.type, title: t(`projects.links.type.${s.type}`), props: { prependIcon: LINK_ICON[s.type] } })));

const menu = ref(false);
const type = ref<LinkEntity | null>(null);
const query = ref('');
const results = ref<Option[]>([]);
const searching = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

watch(menu, (open) => {
  if (open && !type.value) type.value = available.value[0]?.type ?? null;
  if (open) void search();
});
watch(type, () => void search());
watch(query, () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void search(), 300);
});

async function search(): Promise<void> {
  const source = SOURCES.find((s) => s.type === type.value);
  if (!source) return;
  searching.value = true;
  try {
    results.value = await source.search(query.value.trim());
  } catch {
    results.value = [];
  } finally {
    searching.value = false;
  }
}

async function pick(option: Option | null): Promise<void> {
  if (!option || !type.value) return;
  menu.value = false;
  query.value = '';
  try {
    await store.addLink(type.value, option.value, option.title);
  } catch {
    // El aviso lo deja el store.
  }
}

async function remove(linkId: string): Promise<void> {
  try {
    await store.removeLink(linkId);
  } catch {
    // El aviso lo deja el store.
  }
}
</script>

<template>
  <div class="d-flex align-center flex-wrap ga-2 py-2">
    <v-chip
      v-for="l in store.detail?.links ?? []"
      :key="l.id"
      size="small"
      :prepend-icon="LINK_ICON[l.entityType]"
      :to="linkRoute(l.entityType, l.entityId) ?? undefined"
      :closable="props.canEdit"
      @click:close="remove(l.id)"
    >
      {{ l.label }}
    </v-chip>
    <v-menu v-if="props.canEdit && available.length" v-model="menu" :close-on-content-click="false">
      <template #activator="{ props: activator }">
        <v-tooltip location="top" :text="t('projects.links.add')"><template #activator="{ props: tip }"><v-btn v-bind="mergeProps(activator, tip)" icon="mdi-link-plus" variant="text" size="x-small" :aria-label="t('projects.links.add')" /></template></v-tooltip>
      </template>
      <v-card min-width="320" class="pa-4 d-flex flex-column ga-2">
        <v-select v-model="type" :items="typeItems" :label="t('projects.links.what')" />
        <v-autocomplete
          v-model:search="query"
          :items="results"
          :loading="searching"
          :label="t('projects.links.search')"
          :no-data-text="t('projects.links.none')"
          no-filter
          return-object
          @update:model-value="(v: Option | null) => pick(v)"
        >
          <template #item="{ props: item, item: option }">
            <v-list-item v-bind="item" :subtitle="option.subtitle" />
          </template>
        </v-autocomplete>
      </v-card>
    </v-menu>
    <span v-if="!store.detail?.links.length && !(props.canEdit && available.length)" class="text-body-medium text-medium-emphasis">—</span>
  </div>
</template>
