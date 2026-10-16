<script setup lang="ts">
/**
 * Emisión de una guía de remisión: ampara el traslado de mercadería (quién la lleva, de dónde sale y a quién llega). No lleva
 * valores ni impuestos. Se emite ANTES de que salga la mercadería: el traslado no puede empezar antes de hoy.
 */
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useTaxDocumentsStore } from '@/stores/taxDocuments';
import { DOCUMENT_NUMBER_PATTERN, todayIso } from '@/utils/taxDocuments';
import type { DeliveryGuideInput } from '@/types/fiscal';
import PageHeader from '@/components/ui/PageHeader.vue';
import TaxDocumentTabs from '@/components/taxDocuments/TaxDocumentTabs.vue';
import IssuerPicker from '@/components/taxDocuments/IssuerPicker.vue';

const router = useRouter();
const store = useTaxDocumentsStore();

interface ItemRow { internalCode: string; description: string; quantity: string }
interface RecipientRow {
  identification: string;
  businessName: string;
  address: string;
  reason: string;
  route: string;
  withSupport: boolean;
  supportNumber: string;
  supportDate: string;
  supportAuthorization: string;
  items: ItemRow[];
}

const newItem = (): ItemRow => ({ internalCode: '', description: '', quantity: '1' });
const newRecipient = (): RecipientRow => ({
  identification: '',
  businessName: '',
  address: '',
  reason: '',
  route: '',
  withSupport: false,
  supportNumber: '',
  supportDate: todayIso(),
  supportAuthorization: '',
  items: [newItem()],
});

const establishmentId = ref('');
const emissionPointId = ref('');
const originAddress = ref('');
const transportStart = ref(todayIso());
const transportEnd = ref(todayIso());
const carrier = reactive({
  identificationType: 'RUC' as 'RUC' | 'CEDULA' | 'PASAPORTE' | 'EXTERIOR',
  identification: '',
  businessName: '',
  plate: '',
  rise: '',
});
const recipients = ref<RecipientRow[]>([newRecipient()]);

const quantityOf = (item: ItemRow): number => Number(item.quantity.replace(',', '.'));
const itemValid = (item: ItemRow): boolean => item.description.trim() !== '' && Number.isFinite(quantityOf(item)) && quantityOf(item) > 0;
const recipientValid = (r: RecipientRow): boolean =>
  r.identification.trim() !== '' && r.businessName.trim() !== '' && r.address.trim() !== '' && r.reason.trim() !== ''
  && r.items.length > 0 && r.items.every(itemValid)
  && (!r.withSupport || (DOCUMENT_NUMBER_PATTERN.test(r.supportNumber) && r.supportDate !== ''));

const canSubmit = computed(() =>
  Boolean(establishmentId.value && emissionPointId.value)
  && carrier.identification.trim() !== '' && carrier.businessName.trim() !== '' && carrier.plate.trim() !== ''
  && transportStart.value >= todayIso() && transportEnd.value >= transportStart.value
  && recipients.value.length > 0 && recipients.value.every(recipientValid),
);

async function submit(): Promise<void> {
  if (!canSubmit.value) return;
  const input: DeliveryGuideInput = {
    establishmentId: establishmentId.value,
    emissionPointId: emissionPointId.value,
    originAddress: originAddress.value.trim() || null,
    carrier: {
      identificationType: carrier.identificationType,
      identification: carrier.identification.trim(),
      businessName: carrier.businessName.trim(),
      plate: carrier.plate.trim(),
      rise: carrier.rise.trim() || null,
    },
    transportStart: transportStart.value,
    transportEnd: transportEnd.value,
    recipients: recipients.value.map((r) => ({
      identification: r.identification.trim(),
      businessName: r.businessName.trim(),
      address: r.address.trim(),
      reason: r.reason.trim(),
      route: r.route.trim() || null,
      support: r.withSupport
        ? { documentCode: '01', number: r.supportNumber, issueDate: r.supportDate, authorizationNumber: r.supportAuthorization.trim() || null }
        : null,
      items: r.items.map((item) => ({
        internalCode: item.internalCode.trim() || null,
        description: item.description.trim(),
        quantity: quantityOf(item),
      })),
    })),
  };
  await store.createDeliveryGuide(input);
  await router.push({ name: 'tax-delivery-guides' });
}
</script>

<template>
  <v-container>
    <PageHeader :title="$t('taxDocuments.title')" :subtitle="$t('taxDocuments.guides.formIntro')" />
    <TaxDocumentTabs />

    <v-alert v-if="store.error" type="error" closable class="mb-4" @click:close="store.error = null">
      {{ store.error }}
    </v-alert>

    <v-form @submit.prevent="submit">
      <v-card class="mb-4">
        <v-card-title class="text-h6">{{ $t('taxDocuments.issuer') }}</v-card-title>
        <v-card-text>
          <IssuerPicker v-model:establishment-id="establishmentId" v-model:emission-point-id="emissionPointId" />
        </v-card-text>
      </v-card>

      <v-card class="mb-4">
        <v-card-title class="text-h6">{{ $t('taxDocuments.guides.transport') }}</v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="12">
              <v-text-field v-model="originAddress" :label="$t('taxDocuments.guides.origin')" :hint="$t('taxDocuments.guides.originHint')" persistent-hint maxlength="300" />
            </v-col>
            <v-col cols="12" sm="3">
              <v-select
                v-model="carrier.identificationType"
                :items="['RUC', 'CEDULA', 'PASAPORTE', 'EXTERIOR'].map((v) => ({ value: v, title: $t(`taxDocuments.idTypes.${v}`) }))"
                :label="$t('taxDocuments.idType')"
              />
            </v-col>
            <v-col cols="12" sm="3">
              <v-text-field v-model="carrier.identification" :label="$t('taxDocuments.identification')" maxlength="20" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="carrier.businessName" :label="$t('taxDocuments.guides.carrierName')" maxlength="300" />
            </v-col>
            <v-col cols="12" sm="3">
              <v-text-field v-model="carrier.plate" :label="$t('taxDocuments.guides.plate')" maxlength="20" />
            </v-col>
            <v-col cols="12" sm="3">
              <v-text-field v-model="carrier.rise" :label="$t('taxDocuments.guides.rise')" maxlength="40" />
            </v-col>
            <v-col cols="12" sm="3">
              <v-text-field v-model="transportStart" :label="$t('taxDocuments.guides.start')" type="date" :min="todayIso()" />
            </v-col>
            <v-col cols="12" sm="3">
              <v-text-field v-model="transportEnd" :label="$t('taxDocuments.guides.end')" type="date" :min="transportStart" />
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <v-card v-for="(recipient, ri) in recipients" :key="ri" class="mb-4">
        <v-card-title class="d-flex align-center justify-space-between ga-2">
          <span class="text-h6">{{ $t('taxDocuments.guides.recipient', { n: ri + 1 }) }}</span>
          <v-btn
            v-if="recipients.length > 1"
            variant="text"
            prepend-icon="mdi-delete-outline"
            @click="recipients.splice(ri, 1)"
          >
            {{ $t('common.delete') }}
          </v-btn>
        </v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="12" sm="4">
              <v-text-field v-model="recipient.identification" :label="$t('taxDocuments.identification')" maxlength="20" />
            </v-col>
            <v-col cols="12" sm="8">
              <v-text-field v-model="recipient.businessName" :label="$t('taxDocuments.businessName')" maxlength="300" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="recipient.address" :label="$t('taxDocuments.guides.destination')" maxlength="300" />
            </v-col>
            <v-col cols="12" sm="3">
              <v-text-field v-model="recipient.reason" :label="$t('taxDocuments.guides.reason')" maxlength="300" />
            </v-col>
            <v-col cols="12" sm="3">
              <v-text-field v-model="recipient.route" :label="$t('taxDocuments.guides.route')" maxlength="300" />
            </v-col>
            <v-col cols="12">
              <v-switch v-model="recipient.withSupport" :label="$t('taxDocuments.guides.withSupport')" color="primary" />
            </v-col>
            <template v-if="recipient.withSupport">
              <v-col cols="12" sm="4">
                <v-text-field v-model="recipient.supportNumber" :label="$t('taxDocuments.guides.invoiceNumber')" placeholder="000-000-000000000" maxlength="17" />
              </v-col>
              <v-col cols="12" sm="4">
                <v-text-field v-model="recipient.supportDate" :label="$t('taxDocuments.guides.invoiceDate')" type="date" :max="todayIso()" />
              </v-col>
              <v-col cols="12" sm="4">
                <v-text-field v-model="recipient.supportAuthorization" :label="$t('taxDocuments.withholdings.authorization')" maxlength="49" />
              </v-col>
            </template>
          </v-row>

          <div class="text-subtitle-2 mb-2">{{ $t('taxDocuments.guides.items') }}</div>
          <v-row v-for="(item, ii) in recipient.items" :key="ii">
            <v-col cols="12" sm="2">
              <v-text-field v-model="item.internalCode" :label="$t('taxDocuments.guides.code')" maxlength="25" />
            </v-col>
            <v-col cols="12" sm="7">
              <v-text-field v-model="item.description" :label="$t('common.description')" maxlength="300" />
            </v-col>
            <v-col cols="9" sm="2">
              <v-text-field v-model="item.quantity" :label="$t('invoices.quantity')" inputmode="decimal" />
            </v-col>
            <v-col cols="3" sm="1" class="d-flex align-center">
              <v-btn icon="mdi-close" variant="text" :aria-label="$t('common.delete')" :disabled="recipient.items.length === 1" @click="recipient.items.splice(ii, 1)" />
            </v-col>
          </v-row>
          <v-btn variant="text" color="primary" prepend-icon="mdi-plus" @click="recipient.items.push(newItem())">
            {{ $t('taxDocuments.guides.addItem') }}
          </v-btn>
        </v-card-text>
      </v-card>

      <div class="d-flex flex-wrap justify-space-between ga-2">
        <v-btn variant="text" color="primary" prepend-icon="mdi-account-plus-outline" :disabled="recipients.length >= 50" @click="recipients.push(newRecipient())">
          {{ $t('taxDocuments.guides.addRecipient') }}
        </v-btn>
        <div class="d-flex flex-wrap ga-2">
          <v-btn variant="text" @click="router.push({ name: 'tax-delivery-guides' })">{{ $t('common.cancel') }}</v-btn>
          <v-btn type="submit" color="primary" :loading="store.saving" :disabled="!canSubmit">
            {{ $t('taxDocuments.guides.submit') }}
          </v-btn>
        </div>
      </div>
    </v-form>
  </v-container>
</template>
