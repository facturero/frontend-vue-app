<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useInvoiceStore } from '@/stores/invoices';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const store = useInvoiceStore();
const auth = useAuthStore();

const filterStatus = ref('');

const canCreate = computed(() => auth.can('invoice:create'));
const canIssue = computed(() => auth.can('invoice:issue'));
const canVoid = computed(() => auth.can('invoice:void'));
const canUpdate = computed(() => auth.can('invoice:update'));

const statusChip = (status: string) => {
  const map: Record<string, string> = {
    draft: 'warning',
    issued: 'success',
    voided: 'error',
  };
  return map[status] || 'grey';
};

const formatDate = (date: string | null) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('es-EC', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
};

async function load() {
  await store.fetch(filterStatus.value ? { status: filterStatus.value } : undefined);
}

function goDetail(id: string) {
  router.push(`/invoices/${id}`);
}

function goEdit(id: string) {
  router.push(`/invoices/${id}/edit`);
}

function goCreate() {
  router.push('/invoices/new');
}

onMounted(load);
</script>

<template>
  <v-container fluid>
    <v-row align="center" justify="space-between" class="mb-4">
      <v-col>
        <h1 class="text-h4">Facturas</h1>
      </v-col>
      <v-col class="text-right">
        <v-btn v-if="canCreate" color="primary" prepend-icon="mdi-plus" @click="goCreate">
          Nueva factura
        </v-btn>
      </v-col>
    </v-row>

    <v-card>
      <v-card-text>
        <v-row>
          <v-col cols="12" sm="4">
            <v-select
              v-model="filterStatus"
              :items="[
                { title: 'Todos', value: '' },
                { title: 'Borrador', value: 'draft' },
                { title: 'Emitido', value: 'issued' },
                { title: 'Anulado', value: 'voided' },
              ]"
              label="Estado"
              clearable
              @update:model-value="load"
            />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card class="mt-4">
      <v-progress-linear v-if="store.loading" indeterminate />

      <v-table>
        <thead>
          <tr>
            <th>#</th>
            <th>Cliente</th>
            <th>Identificación</th>
            <th>Subtotal</th>
            <th>IVA</th>
            <th>Total</th>
            <th>Estado</th>
            <th>Fecha</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="inv in store.list" :key="inv.id">
            <td>{{ inv.number || '—' }}</td>
            <td>{{ inv.customerName }}</td>
            <td>{{ inv.customerIdentification }}</td>
            <td>{{ inv.subtotal }}</td>
            <td>{{ inv.taxTotal }}</td>
            <td><strong>{{ inv.total }}</strong></td>
            <td>
              <v-chip :color="statusChip(inv.status)" size="small">
                {{ inv.status === 'draft' ? 'Borrador' : inv.status === 'issued' ? 'Emitida' : 'Anulada' }}
              </v-chip>
            </td>
            <td>{{ formatDate(inv.issueDate) }}</td>
            <td>
              <v-btn icon="mdi-eye" variant="text" size="small" @click="goDetail(inv.id)" />
              <v-btn
                v-if="inv.status === 'draft' && canUpdate"
                icon="mdi-pencil"
                variant="text"
                size="small"
                title="Editar borrador"
                @click="goEdit(inv.id)"
              />
            </td>
          </tr>
          <tr v-if="store.list.length === 0 && !store.loading">
            <td colspan="9" class="text-center text-grey">No hay facturas</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>
  </v-container>
</template>
