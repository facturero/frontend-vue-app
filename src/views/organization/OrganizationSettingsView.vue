<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useOrganizationStore } from '@/stores/organization';
import PageHeader from '@/components/ui/PageHeader.vue';

const auth = useAuthStore();
const store = useOrganizationStore();

const legalName = ref('');
const tradeName = ref('');
const taxId = ref('');
const countryCode = ref('EC');
const obligadoContabilidad = ref(false);
const saved = ref(false);

onMounted(async () => {
  try {
    await store.fetch();
    if (store.org) {
      legalName.value = store.org.legalName ?? '';
      tradeName.value = store.org.tradeName ?? '';
      taxId.value = store.org.taxId ?? '';
      countryCode.value = store.org.countryCode ?? 'EC';
      obligadoContabilidad.value = Boolean((store.org.settings as Record<string, unknown> | null)?.obligadoContabilidad);
    }
  } catch {
    // handled by store
  }
});

async function submit(): Promise<void> {
  saved.value = false;
  try {
    await store.upsert({
      legalName: legalName.value,
      tradeName: tradeName.value || undefined,
      taxId: taxId.value,
      countryCode: countryCode.value,
    });
    // El perfil legal/tributario va por upsert (PUT); obligadoContabilidad vive en
    // settings, que se actualiza por separado (PATCH) porque updateSettings()
    // reemplaza el objeto settings entero, así que hay que mergear lo que ya había.
    await store.update({
      settings: {
        ...((store.org?.settings as Record<string, unknown> | null) ?? {}),
        obligadoContabilidad: obligadoContabilidad.value,
      },
    });
    await auth.fetchMe();
    saved.value = true;
  } catch {
    // handled by store
  }
}
</script>

<template>
  <v-container>
    <PageHeader :title="$t('organization.settingsTitle')" />

    <v-row>
      <v-col cols="12" md="8" lg="6">
        <v-card>
          <v-card-text>
            <p class="text-body-2 text-medium-emphasis mb-4">
              {{ $t('organization.settingsIntro') }}
            </p>

            <v-alert
              v-if="store.error"
              type="error"
              closable
              class="mb-4"
              @click:close="store.error = null"
            >
              {{ store.error }}
            </v-alert>

            <v-alert
              v-if="saved"
              type="success"
              closable
              class="mb-4"
              @click:close="saved = false"
            >
              {{ $t('organization.updated') }}
            </v-alert>

            <v-form @submit.prevent="submit">
              <v-text-field
                v-model="legalName"
                :label="$t('organization.legalName')"
                class="mb-4"
                :placeholder="$t('organization.legalNamePlaceholder')"
              />

              <v-text-field
                v-model="tradeName"
                :label="$t('customers.tradeName')"
                class="mb-4"
                :placeholder="$t('organization.tradeNamePlaceholder')"
              />

              <v-text-field
                v-model="taxId"
                :label="$t('invoices.taxIdLabel')"
                class="mb-4"
                :placeholder="$t('invoices.taxIdPlaceholder')"
              />

              <v-select
                v-model="countryCode"
                :items="[{ title: 'Ecuador', value: 'EC' }]"
                :label="$t('common.country')"
                class="mb-4"
              />

              <v-checkbox
                v-model="obligadoContabilidad"
                :label="$t('organization.accountingObliged')"
                density="compact"
                hide-details="auto"
                class="mb-4"
              />
              <i18n-t keypath="organization.accountingHint" tag="p"
                class="text-caption text-medium-emphasis mb-4" style="margin-top: -8px;">
                <template #field><code>obligadoContabilidad</code></template>
              </i18n-t>

              <v-btn
                block
                color="primary"
                type="submit"
                :loading="store.saving"
                :disabled="!legalName || !taxId || !countryCode"
              >
                {{ $t('common.saveChanges') }}
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12" md="8" lg="6">
        <v-card class="mt-2">
          <v-card-text class="d-flex align-center justify-space-between">
            <div>
              <p class="text-body-1 font-weight-medium mb-1">{{ $t('organization.establishmentsCard') }}</p>
              <p class="text-body-2 text-medium-emphasis mb-0">
                {{ $t('organization.establishmentsCardHint') }}
              </p>
            </div>
            <v-btn variant="outlined" color="primary" to="/organization/establishments">
              {{ $t('organization.manage') }}
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12" md="8" lg="6">
        <v-card class="mt-2">
          <v-card-text class="d-flex align-center justify-space-between">
            <div>
              <p class="text-body-1 font-weight-medium mb-1">{{ $t('organization.certificateCard') }}</p>
              <p class="text-body-2 text-medium-emphasis mb-0">
                {{ $t('organization.certificateCardHint') }}
              </p>
            </div>
            <v-btn variant="outlined" color="primary" to="/organization/certificates">
              {{ $t('organization.manage') }}
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
