<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useOrganizationStore } from '@/stores/organization';
import InvoiceOrgProfileDialog from '@/components/invoices/InvoiceOrgProfileDialog.vue';
import InvoiceEstablishmentDialog from '@/components/invoices/InvoiceEstablishmentDialog.vue';
import InvoiceCertificateDialog from '@/components/invoices/InvoiceCertificateDialog.vue';

const props = defineProps<{
  organizationComplete: boolean;
  hasEstablishments: boolean;
  authority: string;
  requiresSigningCertificate: boolean;
  noCertificate: boolean;
  hasLines: boolean;
  establishmentId: string;
  emissionPointId: string;
  saving: boolean;
}>();
const emit = defineEmits<{
  'update:establishmentId': [value: string];
  'update:emissionPointId': [value: string];
  issue: [];
}>();

const { t } = useI18n();
const orgStore = useOrganizationStore();

const showOrgDialog = ref(false);
const showEstablishmentDialog = ref(false);
const showCertificateDialog = ref(false);

const selectedEstablishmentHasEmissionPoints = computed(() =>
  !props.establishmentId || orgStore.emissionPoints.some(ep => ep.status === 'active'),
);

watch(() => props.establishmentId, (estId) => {
  emit('update:emissionPointId', '');
  if (estId) {
    void orgStore.fetchEmissionPoints(estId);
  } else {
    orgStore.emissionPoints.splice(0);
  }
});
</script>

<template>
  <section>
    <div class="text-subtitle-2 font-weight-medium mb-1">{{ $t('invoices.step3') }}</div>
    <p class="text-caption text-medium-emphasis mb-4">
      {{ authority
        ? $t('invoices.step3Subtitle', { authority })
        : $t('invoices.step3SubtitleGeneric') }}
    </p>

    <v-alert v-if="!organizationComplete" type="warning" class="mb-4">
      <div class="d-flex flex-wrap align-center ga-2">
        <i18n-t keypath="invoices.completeProfileHint" tag="span">
          <template #field><strong>{{ $t('invoices.taxIdAndCountry') }}</strong></template>
        </i18n-t>
        <v-btn variant="text" size="small" class="ml-auto" @click="showOrgDialog = true">
          {{ $t('invoices.completeNow') }}
        </v-btn>
      </div>
    </v-alert>

    <v-alert v-else-if="!hasEstablishments" type="warning" class="mb-4">
      <div class="d-flex flex-wrap align-center ga-2">
        <i18n-t keypath="invoices.needEstablishmentHint" tag="span">
          <template #field><strong>{{ $t('invoices.establishmentAndPoint') }}</strong></template>
        </i18n-t>
        <v-btn variant="text" size="small" class="ml-auto" @click="showEstablishmentDialog = true">
          {{ $t('invoices.createNow') }}
        </v-btn>
      </div>
    </v-alert>

    <template v-else>
      <v-sheet color="grey100" rounded="lg" class="d-flex ga-3 pa-4 mb-4">
        <v-select
          :model-value="establishmentId"
          :items="orgStore.establishments.filter(e => e.status === 'active').map(e => ({ title: `${e.code} — ${e.name}`, value: e.id }))"
          :label="$t('organization.establishment')"
          @update:model-value="(v) => emit('update:establishmentId', v as string)"
        />
        <v-select
          :model-value="emissionPointId"
          :items="orgStore.emissionPoints.filter(ep => ep.status === 'active').map(ep => ({ title: `${ep.code} — ${ep.name || $t('invoices.emissionPoint')}`, value: ep.id }))"
          :label="$t('invoices.emissionPoint')"
          :disabled="!establishmentId"
          @update:model-value="(v) => emit('update:emissionPointId', v as string)"
        />
      </v-sheet>

      <v-alert
        v-if="establishmentId && !selectedEstablishmentHasEmissionPoints"
        type="warning"
        class="mb-4"
      >
        <div class="d-flex flex-wrap align-center ga-2">
          <span>{{ $t('invoices.noEmissionPoints') }}</span>
          <v-btn variant="text" size="small" class="ml-auto" @click="showEstablishmentDialog = true">
            {{ $t('invoices.createOne') }}
          </v-btn>
        </div>
      </v-alert>

      <v-alert
        v-if="requiresSigningCertificate && noCertificate"
        type="info"
        class="mb-4"
      >
        <div class="d-flex flex-wrap align-center ga-2">
          <span>{{ $t('invoices.noCertificateHint') }}</span>
          <v-btn variant="text" size="small" class="ml-auto" @click="showCertificateDialog = true">
            {{ $t('invoices.uploadCertificate') }}
          </v-btn>
        </div>
      </v-alert>
    </template>

    <p v-if="!hasLines" class="text-caption text-medium-emphasis mb-4">
      {{ $t('invoices.addLineFirst') }}
    </p>
    <p v-else class="text-body-2 text-medium-emphasis mb-4">
      {{ $t('invoices.issueNote') }}
    </p>

    <div class="d-flex ga-3 justify-end">
      <v-btn variant="outlined" :to="{ name: 'invoices' }">
        {{ $t('common.cancel') }}
      </v-btn>
      <v-btn
        color="primary"
        size="large"
        :loading="saving"
        :disabled="!hasLines || !establishmentId || !emissionPointId"
        @click="emit('issue')"
      >
        {{ saving ? $t('invoices.issuing') : $t('invoices.issueInvoice') }}
      </v-btn>
    </div>

    <InvoiceOrgProfileDialog v-model="showOrgDialog" />
    <InvoiceEstablishmentDialog
      v-model="showEstablishmentDialog"
      @created="(id) => emit('update:establishmentId', id)"
    />
    <InvoiceCertificateDialog v-model="showCertificateDialog" />
  </section>
</template>