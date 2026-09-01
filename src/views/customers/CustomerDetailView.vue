<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useCustomerStore } from '@/stores/customers';
import { customerApi } from '@/api/customers';
import type { ContactInput, AddressInput, AddressType } from '@/types/customers';
import PageHeader from '@/components/ui/PageHeader.vue';

const apiUrl = import.meta.env.VITE_API_URL as string;

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const store = useCustomerStore();

const customerId = computed(() => route.params.id as string);
const canUpdate = computed(() => auth.can('customer:update'));
const disabling = ref(false);

const customer = computed(() => store.current);

const idTypeName = computed(() => {
  const idType = store.identificationTypes.find(
    (x) => x.id === customer.value?.identificationTypeId,
  );
  return idType?.name ?? '—';
});

// --------- Contactos ---------
const contactDialog = ref(false);
const editingContactId = ref<string | null>(null);
const contactForm = ref<ContactInput>({ name: '' });
const contactBusy = ref(false);

function openNewContact(): void {
  editingContactId.value = null;
  contactForm.value = { name: '' };
  contactDialog.value = true;
}

function openEditContact(id: string): void {
  const c = customer.value?.contacts.find((x) => x.id === id);
  if (!c) return;
  editingContactId.value = id;
  contactForm.value = {
    name: c.name,
    email: c.email ?? undefined,
    phone: c.phone ?? undefined,
    position: c.position ?? undefined,
  };
  contactDialog.value = true;
}

async function submitContact(): Promise<void> {
  if (!contactForm.value.name.trim()) return;
  contactBusy.value = true;
  try {
    if (editingContactId.value) {
      await customerApi.updateContact(editingContactId.value, contactForm.value);
    } else {
      await customerApi.addContact(customerId.value, contactForm.value);
    }
    await store.fetchById(customerId.value);
    contactDialog.value = false;
  } finally {
    contactBusy.value = false;
  }
}

async function removeContact(id: string): Promise<void> {
  if (!confirm(t('customers.removeContactConfirm'))) return;
  await customerApi.removeContact(id);
  await store.fetchById(customerId.value);
}

// --------- Direcciones ---------
const addressDialog = ref(false);
const editingAddressId = ref<string | null>(null);
const addressForm = ref<AddressInput>({ line1: '', type: 'other' });
const addressBusy = ref(false);

function openNewAddress(): void {
  editingAddressId.value = null;
  addressForm.value = { line1: '', type: 'other' };
  addressDialog.value = true;
}

function openEditAddress(id: string): void {
  const a = customer.value?.addresses.find((x) => x.id === id);
  if (!a) return;
  editingAddressId.value = id;
  addressForm.value = {
    type: a.type,
    line1: a.line1,
    line2: a.line2 ?? undefined,
    city: a.city ?? undefined,
    province: a.province ?? undefined,
    countryCode: a.countryCode ?? undefined,
    postalCode: a.postalCode ?? undefined,
    isPrimary: a.isPrimary,
  };
  addressDialog.value = true;
}

async function submitAddress(): Promise<void> {
  if (!addressForm.value.line1.trim()) return;
  addressBusy.value = true;
  try {
    if (editingAddressId.value) {
      await customerApi.updateAddress(editingAddressId.value, addressForm.value);
    } else {
      await customerApi.addAddress(customerId.value, addressForm.value);
    }
    await store.fetchById(customerId.value);
    addressDialog.value = false;
  } finally {
    addressBusy.value = false;
  }
}

async function removeAddress(id: string): Promise<void> {
  if (!confirm(t('customers.removeAddressConfirm'))) return;
  await customerApi.removeAddress(id);
  await store.fetchById(customerId.value);
}

const addressTypeLabels = computed<Record<AddressType, string>>(() => ({
  billing: t('customers.addressType.billing'),
  shipping: t('customers.addressType.shipping'),
  other: t('customers.addressType.other'),
}));

// --------- Etiquetas ---------
const availableTags = computed(() =>
  store.tags.filter(
    (tag) => !customer.value?.tags.some((ct) => ct.id === tag.id),
  ),
);

async function assignTag(tagId: string): Promise<void> {
  await customerApi.assignTag(customerId.value, tagId);
  await store.fetchById(customerId.value);
}

async function removeTag(tagId: string): Promise<void> {
  await customerApi.removeTag(customerId.value, tagId);
  await store.fetchById(customerId.value);
}

// --------- Acciones principales ---------
async function disable(): Promise<void> {
  if (!confirm(t('customers.deactivateConfirm'))) return;
  disabling.value = true;
  try {
    await store.disable(customerId.value);
  } finally {
    disabling.value = false;
  }
}

function goEdit(): void {
  router.push({ name: 'customers-edit', params: { id: customerId.value } });
}

onMounted(async () => {
  try {
    await Promise.all([
      store.fetchById(customerId.value),
      store.fetchCatalog(),
    ]);
  } catch {
    router.push({ name: 'customers' });
  }
});
</script>

<template>
  <v-container>
    <PageHeader
      :title="customer?.businessName || $t('customers.singular')"
      :back-to="{ name: 'customers' }"
    >
      <template #actions>
        <v-btn v-if="canUpdate && customer?.status === 'active'" color="error" variant="tonal" size="small"
          prepend-icon="mdi-archive" :loading="disabling" @click="disable">
          {{ $t('common.deactivate') }}
        </v-btn>
        <v-btn v-if="canUpdate" color="primary" variant="tonal" size="small" prepend-icon="mdi-pencil"
          @click="goEdit">
          {{ $t('common.edit') }}
        </v-btn>
      </template>
    </PageHeader>

    <v-alert v-if="store.error" type="error" closable class="mb-4"
      @click:close="store.error = null">
      {{ store.error }}
    </v-alert>

    <div v-if="!store.loading && customer">
      <v-row>
        <v-col cols="12" md="8">
          <!-- Información general -->
          <v-card class="mb-4">
            <v-card-title class="text-h6">{{ $t('common.generalInfo') }}</v-card-title>
            <v-card-text>
              <v-row>
                <v-col cols="6">
                  <p class="text-caption text-medium-emphasis">{{ $t('customers.headers.businessName') }}</p>
                  <p class="text-body-1 mb-3">{{ customer.businessName }}</p>
                </v-col>
                <v-col cols="6">
                  <p class="text-caption text-medium-emphasis">{{ $t('customers.tradeName') }}</p>
                  <p class="text-body-1 mb-3">{{ customer.tradeName || '—' }}</p>
                </v-col>
                <v-col cols="6">
                  <p class="text-caption text-medium-emphasis">{{ $t('common.type') }}</p>
                  <v-chip size="x-small"
                    :color="customer.type === 'company' ? 'primary' : 'info'" class="mb-3">
                    {{ customer.type === 'company' ? $t('customers.company') : $t('customers.person') }}
                  </v-chip>
                </v-col>
                <v-col cols="6">
                  <p class="text-caption text-medium-emphasis">{{ $t('common.status') }}</p>
                  <v-chip size="x-small" :color="customer.status === 'active' ? 'success' : 'warning'" class="mb-3">
                    {{ customer.status === 'active' ? $t('common.active') : $t('common.inactive') }}
                  </v-chip>
                </v-col>
                <v-col cols="6">
                  <p class="text-caption text-medium-emphasis">{{ $t('customers.headers.identification') }}</p>
                  <p class="text-body-1 mb-3">
                    {{ customer.identification || '—' }}
                    <span class="text-caption text-medium-emphasis">({{ idTypeName }})</span>
                  </p>
                </v-col>
                <v-col cols="6">
                  <p class="text-caption text-medium-emphasis">{{ $t('common.country') }}</p>
                  <p class="text-body-1 mb-3">{{ customer.countryCode }}</p>
                </v-col>
                <v-col cols="6">
                  <p class="text-caption text-medium-emphasis">{{ $t('common.email') }}</p>
                  <p class="text-body-1 mb-3">{{ customer.email || '—' }}</p>
                </v-col>
                <v-col cols="6">
                  <p class="text-caption text-medium-emphasis">{{ $t('common.phone') }}</p>
                  <p class="text-body-1 mb-3">{{ customer.phone || '—' }}</p>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>

          <!-- Contactos -->
          <v-card v-if="customer.type === 'company'" class="mb-4">
            <v-card-title class="text-h6 d-flex align-center">
              {{ $t('customers.contacts') }}
              <v-spacer />
              <v-btn v-if="canUpdate" size="small" variant="tonal" color="primary" prepend-icon="mdi-plus"
                @click="openNewContact">
                {{ $t('common.add') }}
              </v-btn>
            </v-card-title>
            <v-card-text>
              <v-table v-if="customer.contacts.length > 0" density="compact">
                <thead>
                  <tr>
                    <th class="text-left font-weight-medium">{{ $t('common.name') }}</th>
                    <th class="text-left font-weight-medium">{{ $t('customers.position') }}</th>
                    <th class="text-left font-weight-medium">{{ $t('common.email') }}</th>
                    <th class="text-left font-weight-medium">{{ $t('common.phone') }}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="c in customer.contacts" :key="c.id">
                    <td>{{ c.name }}</td>
                    <td>{{ c.position || '—' }}</td>
                    <td>{{ c.email || '—' }}</td>
                    <td>{{ c.phone || '—' }}</td>
                    <td class="text-right">
                      <v-btn v-if="canUpdate" size="x-small" variant="text" icon="mdi-pencil"
                        @click="openEditContact(c.id)" />
                      <v-btn v-if="canUpdate" size="x-small" variant="text" icon="mdi-delete"
                        color="error" @click="removeContact(c.id)" />
                    </td>
                  </tr>
                </tbody>
              </v-table>
              <p v-else class="text-body-2 text-medium-emphasis">{{ $t('customers.noContacts') }}</p>
            </v-card-text>
          </v-card>

          <!-- Direcciones -->
          <v-card v-if="customer.type === 'company'" class="mb-4">
            <v-card-title class="text-h6 d-flex align-center">
              {{ $t('customers.addresses') }}
              <v-spacer />
              <v-btn v-if="canUpdate" size="small" variant="tonal" color="primary" prepend-icon="mdi-plus"
                @click="openNewAddress">
                {{ $t('common.add') }}
              </v-btn>
            </v-card-title>
            <v-card-text>
              <div v-if="customer.addresses.length > 0" class="d-flex flex-column ga-3">
                <v-card v-for="a in customer.addresses" :key="a.id" variant="outlined" class="pa-3">
                  <div class="d-flex align-start">
                    <div class="flex-grow-1">
                      <div class="d-flex align-center ga-2 mb-1">
                        <v-chip size="x-small" color="info">
                          {{ addressTypeLabels[a.type] }}
                        </v-chip>
                        <v-chip v-if="a.isPrimary" size="x-small" color="primary">
                          {{ $t('common.primary') }}
                        </v-chip>
                      </div>
                      <p class="text-body-2 mb-1">{{ a.line1 }}</p>
                      <p v-if="a.line2" class="text-body-2 mb-1">{{ a.line2 }}</p>
                      <p class="text-caption text-medium-emphasis">
                        {{ [a.city, a.province, a.countryCode].filter(Boolean).join(', ') || '—' }}
                        <span v-if="a.postalCode">· {{ $t('customers.postalCodeShort') }} {{ a.postalCode }}</span>
                      </p>
                    </div>
                    <div class="d-flex ga-1">
                      <v-btn v-if="canUpdate" size="x-small" variant="text" icon="mdi-pencil"
                        @click="openEditAddress(a.id)" />
                      <v-btn v-if="canUpdate" size="x-small" variant="text" icon="mdi-delete"
                        color="error" @click="removeAddress(a.id)" />
                    </div>
                  </div>
                </v-card>
              </div>
              <p v-else class="text-body-2 text-medium-emphasis">{{ $t('customers.noAddresses') }}</p>
            </v-card-text>
          </v-card>
        </v-col>

        <!-- Sidebar: avatar + etiquetas + metadatos -->
        <v-col cols="12" md="4">
          <v-card v-if="customer.imageFileId" class="mb-4">
            <v-card-title class="text-h6">{{ $t('customers.avatar') }}</v-card-title>
            <v-card-text class="d-flex justify-center">
              <v-avatar size="150" rounded="lg">
                <v-img :src="`${apiUrl}/files/${customer.imageFileId}/download`" alt="avatar" cover />
              </v-avatar>
            </v-card-text>
          </v-card>

          <v-card class="mb-4">
            <v-card-title class="text-h6">{{ $t('customers.tags') }}</v-card-title>
            <v-card-text>
              <div class="d-flex flex-wrap ga-2 mb-3">
                <v-chip v-for="tag in customer.tags" :key="tag.id" size="small" :color="tag.color || 'default'" closable @click:close="removeTag(tag.id)">
                  {{ tag.name }}
                </v-chip>
                <p v-if="customer.tags.length === 0" class="text-body-2 text-medium-emphasis">
                  {{ $t('customers.noTags') }}
                </p>
              </div>
              <v-select v-if="canUpdate && availableTags.length > 0" :items="availableTags" item-title="name"
                item-value="id" :label="$t('customers.addTag')" hide-details
                @update:model-value="assignTag" />
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </div>

    <div v-else class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <!-- Diálogo de contacto -->
    <v-dialog v-model="contactDialog" max-width="500">
      <v-card>
        <v-card-title>{{ editingContactId ? $t('customers.editContact') : $t('customers.newContact') }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="contactForm.name" :label="$t('common.name')"
            required class="mb-3" />
          <v-text-field v-model="contactForm.position" :label="$t('customers.position')"
            class="mb-3" />
          <v-text-field v-model="contactForm.email" :label="$t('common.email')" type="email" class="mb-3" />
          <v-text-field v-model="contactForm.phone" :label="$t('common.phone')" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="contactDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="tonal" :loading="contactBusy" @click="submitContact">
            {{ $t('common.save') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Diálogo de dirección -->
    <v-dialog v-model="addressDialog" max-width="600">
      <v-card>
        <v-card-title>{{ editingAddressId ? $t('customers.editAddress') : $t('customers.newAddress') }}</v-card-title>
        <v-card-text>
          <v-row dense>
            <v-col cols="12" md="6">
              <v-select v-model="addressForm.type" :items="[
                { title: $t('customers.addressType.billing'), value: 'billing' },
                { title: $t('customers.addressType.shipping'), value: 'shipping' },
                { title: $t('customers.addressType.other'), value: 'other' },
              ]" :label="$t('common.type')" class="mb-3" />
            </v-col>
            <v-col cols="12" md="6" class="d-flex align-center">
              <v-switch v-model="addressForm.isPrimary" :label="$t('common.primary')" color="primary" hide-details
                density="compact" class="mt-0" />
            </v-col>
          </v-row>
          <v-text-field v-model="addressForm.line1" :label="$t('customers.line1')" required class="mb-3" />
          <v-text-field v-model="addressForm.line2" :label="$t('customers.line2')" class="mb-3" />
          <v-row dense>
            <v-col cols="12" md="6">
              <v-text-field v-model="addressForm.city" :label="$t('customers.city')"
                class="mb-3" />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field v-model="addressForm.province" :label="$t('customers.province')" class="mb-3" />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field v-model="addressForm.countryCode" :label="$t('customers.countryIso')" maxlength="2" class="mb-3" />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field v-model="addressForm.postalCode" :label="$t('customers.postalCode')" />
            </v-col>
          </v-row>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="addressDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="tonal" :loading="addressBusy" @click="submitAddress">
            {{ $t('common.save') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
