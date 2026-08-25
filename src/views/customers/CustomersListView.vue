<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useCustomerStore } from '@/stores/customers';

const router = useRouter();
const auth = useAuthStore();
const store = useCustomerStore();

const search = ref('');
const statusFilter = ref<string | null>(null);
const typeFilter = ref<string | null>(null);
const tagFilter = ref<string | null>(null);
const filtersApplied = ref(false);

const canCreate = computed(() => auth.can('customer:create'));
const canDisable = computed(() => auth.can('customer:update'));

const disableDialog = ref<{ id: string; name: string } | null>(null);
const disabling = ref(false);
const showDisableDialog = computed(() => disableDialog.value !== null);

async function confirmDisable(): Promise<void> {
  if (!disableDialog.value) return;
  disabling.value = true;
  try {
    await store.disable(disableDialog.value.id);
  } finally {
    disabling.value = false;
    disableDialog.value = null;
  }
}

const headers = [
  { title: 'Identificación', key: 'identification', sortable: true, align: 'start' as const },
  { title: 'Nombre / Razón social', key: 'businessName', sortable: true, align: 'start' as const },
  { title: 'Tipo', key: 'type', sortable: true, align: 'start' as const },
  { title: 'Email', key: 'email', sortable: false, align: 'start' as const },
  { title: 'Teléfono', key: 'phone', sortable: false, align: 'start' as const },
  { title: 'Estado', key: 'status', sortable: true, align: 'start' as const },
  { title: 'Acciones', key: 'actions', sortable: false, align: 'end' as const },
] as const;

const filtered = computed(() => {
  let result = store.list;
  if (search.value) {
    const q = search.value.toLowerCase();
    result = result.filter(
      (c) =>
        c.businessName.toLowerCase().includes(q) ||
        (c.identification ?? '').toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q),
    );
  }
  if (statusFilter.value) {
    result = result.filter((c) => c.status === statusFilter.value);
  }
  if (typeFilter.value) {
    result = result.filter((c) => c.type === typeFilter.value);
  }
  return result;
});

async function doSearch(): Promise<void> {
  filtersApplied.value = true;
  try {
    await store.fetch({
      search: search.value || undefined,
      status: statusFilter.value || undefined,
      tagId: tagFilter.value || undefined,
    });
  } finally {
    filtersApplied.value = false;
  }
}

function viewDetail(id: string): void {
  router.push({ name: 'customers-detail', params: { id } });
}

function goCreate(): void {
  router.push({ name: 'customers-create' });
}

onMounted(async () => {
  await Promise.all([
    store.fetch(),
    store.fetchCatalog(),
  ]);
});
</script>

<template>
  <v-container>
    <div class="d-flex align-center justify-space-between mt-6 mb-4">
      <h2 class="text-h5 font-weight-medium">Clientes</h2>
      <v-btn v-if="canCreate" color="primary" variant="tonal" prepend-icon="mdi-plus" @click="goCreate">
        Nuevo cliente
      </v-btn>
    </div>

    <v-alert v-if="store.error" type="error" density="compact" variant="tonal" closable class="mb-4"
      @click:close="store.error = null">
      {{ store.error }}
    </v-alert>

    <v-card elevation="2" rounded="lg" class="mb-4">
      <v-card-text>
        <v-row dense align="end">
          <v-col cols="12" sm="4">
            <v-text-field v-model="search" label="Buscar por nombre, identificación o email" variant="outlined"
              density="compact" hide-details prepend-inner-icon="mdi-magnify" clearable @keyup.enter="doSearch" />
          </v-col>
          <v-col cols="6" sm="2">
            <v-select v-model="statusFilter" :items="[
              { title: 'Todos los estados', value: null },
              { title: 'Activo', value: 'active' },
              { title: 'Inactivo', value: 'inactive' },
            ]" label="Estado" variant="outlined" density="compact" hide-details clearable
              @update:model-value="doSearch" />
          </v-col>
          <v-col cols="6" sm="2">
            <v-select v-model="typeFilter" :items="[
              { title: 'Todos los tipos', value: null },
              { title: 'Persona', value: 'person' },
              { title: 'Empresa', value: 'company' },
            ]" label="Tipo" variant="outlined" density="compact" hide-details clearable
              @update:model-value="doSearch" />
          </v-col>
          <v-col cols="8" sm="3">
            <v-select v-model="tagFilter" :items="[
              { title: 'Todas las etiquetas', value: null },
              ...store.tags.map((t) => ({ title: t.name, value: t.id })),
            ]" label="Etiqueta" variant="outlined" density="compact" hide-details clearable
              @update:model-value="doSearch" />
          </v-col>
          <v-col cols="4" sm="1">
            <v-btn variant="text" icon="mdi-refresh" :loading="store.loading" @click="doSearch" />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card>
      <v-data-table :headers="headers" :items="filtered" :loading="store.loading" item-value="id" :items-per-page="10"
        :items-per-page-options="[
          { title: '5', value: 5 },
          { title: '10', value: 10 },
          { title: '25', value: 25 },
          { title: '50', value: 50 },
        ]">
        <template #item.identification="{ item }">
          <span class="text-caption font-weight-medium">{{ item.identification || '—' }}</span>
        </template>

        <template #item.businessName="{ item }">
          <div>
            <div class="text-body-2">{{ item.businessName }}</div>
            <div v-if="item.tradeName" class="text-caption text-medium-emphasis">{{ item.tradeName }}</div>
          </div>
        </template>

        <template #item.type="{ item }">
          <v-chip size="x-small" variant="tonal" :color="item.type === 'company' ? 'primary' : 'info'">
            {{ item.type === 'company' ? 'Empresa' : 'Persona' }}
          </v-chip>
        </template>

        <template #item.email="{ item }">
          <span class="text-caption">{{ item.email || '—' }}</span>
        </template>

        <template #item.phone="{ item }">
          <span class="text-caption">{{ item.phone || '—' }}</span>
        </template>

        <template #item.status="{ item }">
          <v-chip size="x-small" :color="item.status === 'active' ? 'success' : 'warning'" variant="tonal">
            {{ item.status === 'active' ? 'Activo' : 'Inactivo' }}
          </v-chip>
        </template>

        <template #item.actions="{ item }">
          <div class="d-flex justify-end ga-1">
            <v-btn size="small" variant="text" icon="mdi-eye" @click="viewDetail(item.id)" />
            <v-btn v-if="item.status === 'active' && item.isSystem === false && canDisable"
              size="small" variant="text" icon="mdi-account-cancel" color="warning"
              @click="disableDialog = { id: item.id, name: item.businessName }" />
          </div>
        </template>

        <template #no-data>
          <div class="text-center text-medium-emphasis pa-6">
            No hay clientes registrados
          </div>
        </template>
      </v-data-table>
    </v-card>

    <v-dialog v-model="showDisableDialog" max-width="400">
      <v-card>
        <v-card-title>Deshabilitar cliente</v-card-title>
        <v-card-text>
          ¿Estás seguro de deshabilitar a <strong>{{ disableDialog?.name }}</strong>?
          <p class="text-caption text-medium-emphasis mt-2">El cliente quedará inactivo pero no se eliminará de la base de datos.</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="disableDialog = null">Cancelar</v-btn>
          <v-btn color="warning" variant="tonal" :loading="disabling" @click="confirmDisable">
            Deshabilitar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
