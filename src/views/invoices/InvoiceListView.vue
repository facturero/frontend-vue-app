<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useInvoiceStore } from '@/stores/invoices';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/ui/PageHeader.vue';

const { locale } = useI18n();
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
    draft: 'lightwarning',
    issued: 'lightsuccess',
    voided: 'lighterror',
  };
  return map[status] || 'grey';
};

const formatDate = (date: string | null) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString(locale.value, {
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
  <v-container>
    <PageHeader :title="$t('invoices.title')">
      <template #actions>
        <v-btn
          v-if="canCreate"
          color="primary"
          prepend-icon="mdi-plus"
          @click="goCreate"
        >
          {{ $t('invoices.new') }}
        </v-btn>
      </template>
    </PageHeader>

    <v-card>
      <v-card-text>
        <v-row>
          <v-col cols="12" sm="4">
            <v-select
              v-model="filterStatus"
              :items="[
                { title: $t('common.all'), value: '' },
                { title: $t('invoices.status.draft'), value: 'draft' },
                { title: $t('invoices.statusFilter.issued'), value: 'issued' },
                { title: $t('invoices.statusFilter.voided'), value: 'voided' },
              ]"
              :label="$t('common.status')"
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
            <th>{{ $t('invoices.customer') }}</th>
            <th>{{ $t('customers.headers.identification') }}</th>
            <th>{{ $t('invoices.subtotal') }}</th>
            <th>{{ $t('invoices.taxTotal') }}</th>
            <th>{{ $t('invoices.total') }}</th>
            <th>{{ $t('common.status') }}</th>
            <th>{{ $t('common.date') }}</th>
            <th>{{ $t('common.actions') }}</th>
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
              <v-chip :color="statusChip(inv.status)" size="small" variant="flat">
                {{ $t(`invoices.status.${inv.status}`) }}
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
                :title="$t('invoices.editDraft')"
                @click="goEdit(inv.id)"
              />
            </td>
          </tr>
          <tr v-if="store.list.length === 0 && !store.loading">
            <td colspan="9" class="text-center text-grey">{{ $t('invoices.empty') }}</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>
  </v-container>
</template>
