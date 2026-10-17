<script setup lang="ts">
/**
 * Maestro de proveedores. La identificación (RUC, cédula, pasaporte) no se cambia una vez creado el proveedor: las órdenes, las
 * facturas y las retenciones ya la citan; si estaba mal, se desactiva y se crea otro. Los proveedores no se borran: se desactivan.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { usePurchasingStore } from '@/stores/purchasing';
import type { Supplier, SupplierIdentificationType, SupplierInput } from '@/types/purchasing';
import PageHeader from '@/components/ui/PageHeader.vue';
import PurchasingTabs from '@/components/purchasing/PurchasingTabs.vue';

const { t } = useI18n();
const auth = useAuthStore();
const store = usePurchasingStore();

const canManage = computed(() => auth.can('supplier:manage'));
const search = ref('');
const showInactive = ref(false);
const snackbar = ref<string | null>(null);

const dialog = ref(false);
const editing = ref<Supplier | null>(null);
const formError = ref<string | null>(null);
const form = ref(emptyForm());

function emptyForm() {
  return {
    identificationType: 'RUC' as SupplierIdentificationType,
    identification: '',
    legalName: '',
    tradeName: '',
    email: '',
    phone: '',
    address: '',
    paymentTermDays: '0',
    relatedParty: false,
    notes: '',
  };
}

const idTypes: SupplierIdentificationType[] = ['RUC', 'CEDULA', 'PASAPORTE', 'EXTERIOR'];
const headers = computed(() => [
  { title: t('purchasing.suppliers.identification'), key: 'identification', sortable: false, align: 'start' as const },
  { title: t('purchasing.suppliers.legalName'), key: 'legalName', sortable: false, align: 'start' as const },
  { title: t('purchasing.suppliers.contact'), key: 'contact', sortable: false, align: 'start' as const },
  { title: t('purchasing.suppliers.creditDays'), key: 'paymentTermDays', sortable: false, align: 'end' as const },
  { title: t('common.status'), key: 'status', sortable: false, align: 'start' as const },
  { title: t('common.actions'), key: 'actions', sortable: false, align: 'end' as const },
]);

let timer: ReturnType<typeof setTimeout> | null = null;
function load(): Promise<void> {
  return store.fetchSuppliers({ q: search.value || undefined, status: showInactive.value ? undefined : 'active' });
}
watch([search, showInactive], () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void load(), 300);
});
onMounted(() => void load());

function openCreate(): void {
  editing.value = null;
  form.value = emptyForm();
  formError.value = null;
  dialog.value = true;
}

function openEdit(supplier: Supplier): void {
  editing.value = supplier;
  form.value = {
    identificationType: supplier.identificationType,
    identification: supplier.identification,
    legalName: supplier.legalName,
    tradeName: supplier.tradeName ?? '',
    email: supplier.email ?? '',
    phone: supplier.phone ?? '',
    address: supplier.address ?? '',
    paymentTermDays: String(supplier.paymentTermDays),
    relatedParty: supplier.relatedParty,
    notes: supplier.notes ?? '',
  };
  formError.value = null;
  dialog.value = true;
}

const days = computed(() => Number(form.value.paymentTermDays));
const canSave = computed(
  () => form.value.identification.trim() !== '' && form.value.legalName.trim() !== '' && Number.isInteger(days.value) && days.value >= 0 && days.value <= 365,
);

async function save(): Promise<void> {
  if (!canSave.value) return;
  formError.value = null;
  const input: SupplierInput = {
    identificationType: form.value.identificationType,
    identification: form.value.identification.trim(),
    legalName: form.value.legalName.trim(),
    tradeName: form.value.tradeName.trim() || null,
    email: form.value.email.trim() || null,
    phone: form.value.phone.trim() || null,
    address: form.value.address.trim() || null,
    paymentTermDays: days.value,
    relatedParty: form.value.relatedParty,
    notes: form.value.notes.trim() || null,
  };
  try {
    await store.saveSupplier(editing.value?.id ?? null, input);
    dialog.value = false;
    snackbar.value = t(editing.value ? 'purchasing.suppliers.updated' : 'purchasing.suppliers.created');
    await load();
  } catch {
    formError.value = store.error;
  }
}

async function toggle(supplier: Supplier): Promise<void> {
  try {
    await store.setSupplierActive(supplier.id, supplier.status !== 'active');
    snackbar.value = t(supplier.status === 'active' ? 'purchasing.suppliers.deactivated' : 'purchasing.suppliers.activated');
    await load();
  } catch {
    snackbar.value = store.error;
  }
}
</script>

<template>
  <v-container>
    <PageHeader :title="$t('purchasing.title')" :subtitle="$t('purchasing.suppliers.intro')">
      <template #actions>
        <v-btn v-if="canManage" color="primary" prepend-icon="mdi-plus" @click="openCreate">
          {{ $t('purchasing.suppliers.new') }}
        </v-btn>
      </template>
    </PageHeader>
    <PurchasingTabs />

    <v-alert v-if="store.error && !dialog" type="error" closable class="mb-4">{{ store.error }}</v-alert>

    <v-card>
      <v-card-text>
        <div class="d-flex flex-wrap align-center ga-4 mb-4">
          <v-text-field v-model="search" :label="$t('common.search')" prepend-inner-icon="mdi-magnify" clearable min-width="260" />
          <v-switch v-model="showInactive" :label="$t('purchasing.suppliers.showInactive')" color="primary" />
        </div>

        <v-data-table :headers="headers" :items="store.suppliers" :loading="store.loading" :items-per-page="-1" hide-default-footer>
          <template #item.identification="{ item }">
            {{ item.identification }}
            <div class="text-body-2 text-medium-emphasis">{{ $t(`purchasing.idTypes.${item.identificationType}`) }}</div>
          </template>
          <template #item.legalName="{ item }">
            {{ item.legalName }}
            <div v-if="item.tradeName" class="text-body-2 text-medium-emphasis">{{ item.tradeName }}</div>
          </template>
          <template #item.contact="{ item }">
            <div>{{ item.email ?? '—' }}</div>
            <div class="text-body-2 text-medium-emphasis">{{ item.phone ?? '' }}</div>
          </template>
          <template #item.paymentTermDays="{ item }">
            {{ item.paymentTermDays === 0 ? $t('purchasing.suppliers.cash') : $t('purchasing.suppliers.days', { n: item.paymentTermDays }) }}
          </template>
          <template #item.status="{ item }">
            <v-chip :color="item.status === 'active' ? 'lightsuccess' : 'lightwarning'" variant="flat" size="small">
              {{ $t(item.status === 'active' ? 'common.active' : 'common.inactive') }}
            </v-chip>
          </template>
          <template #item.actions="{ item }">
            <template v-if="canManage">
              <v-btn icon="mdi-pencil-outline" variant="text" size="small" :aria-label="$t('common.edit')" @click="openEdit(item)" />
              <v-btn
                :icon="item.status === 'active' ? 'mdi-cancel' : 'mdi-check-circle-outline'"
                variant="text"
                size="small"
                :aria-label="$t(item.status === 'active' ? 'purchasing.suppliers.deactivate' : 'purchasing.suppliers.activate')"
                @click="toggle(item)"
              />
            </template>
          </template>
          <template #no-data>{{ $t('purchasing.suppliers.empty') }}</template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <v-dialog v-model="dialog" max-width="720">
      <v-card>
        <v-card-title>{{ $t(editing ? 'purchasing.suppliers.edit' : 'purchasing.suppliers.new') }}</v-card-title>
        <v-card-text>
          <v-alert v-if="formError" type="error" class="mb-4">{{ formError }}</v-alert>
          <v-row>
            <v-col cols="12" sm="4">
              <v-select
                v-model="form.identificationType"
                :items="idTypes.map((v) => ({ value: v, title: $t(`purchasing.idTypes.${v}`) }))"
                :label="$t('purchasing.suppliers.idType')"
                :disabled="editing !== null"
              />
            </v-col>
            <v-col cols="12" sm="8">
              <v-text-field
                v-model="form.identification"
                :label="$t('purchasing.suppliers.identification')"
                :hint="editing ? $t('purchasing.suppliers.identificationLocked') : undefined"
                persistent-hint
                maxlength="20"
                :disabled="editing !== null"
              />
            </v-col>
            <v-col cols="12" sm="7">
              <v-text-field v-model="form.legalName" :label="$t('purchasing.suppliers.legalName')" maxlength="300" />
            </v-col>
            <v-col cols="12" sm="5">
              <v-text-field v-model="form.tradeName" :label="$t('purchasing.suppliers.tradeName')" maxlength="300" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="form.email" :label="$t('common.email')" type="email" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="form.phone" :label="$t('common.phone')" maxlength="40" />
            </v-col>
            <v-col cols="12">
              <v-text-field v-model="form.address" :label="$t('common.address')" maxlength="500" />
            </v-col>
            <v-col cols="12" sm="4">
              <v-text-field v-model="form.paymentTermDays" :label="$t('purchasing.suppliers.creditDays')" :hint="$t('purchasing.suppliers.creditDaysHint')" persistent-hint inputmode="numeric" />
            </v-col>
            <v-col cols="12" sm="8" class="d-flex align-center">
              <v-switch v-model="form.relatedParty" :label="$t('purchasing.suppliers.relatedParty')" color="primary" />
            </v-col>
            <v-col cols="12">
              <v-textarea v-model="form.notes" :label="$t('common.notes')" rows="2" auto-grow maxlength="2000" />
            </v-col>
          </v-row>
        </v-card-text>
        <v-card-actions class="flex-wrap ga-2">
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="store.saving" :disabled="!canSave" @click="save">{{ $t('common.save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar :model-value="snackbar !== null" timeout="3000" @update:model-value="snackbar = null">{{ snackbar }}</v-snackbar>
  </v-container>
</template>
