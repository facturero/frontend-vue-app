<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useOrganizationStore } from '@/stores/organization';
import { usePluginsStore } from '@/stores/plugins';
import { shouldAutoStartTour, useAppTour } from '@/composable/useAppTour';
import PageHeader from '@/components/ui/PageHeader.vue';
import FieldHelp from '@/components/ui/FieldHelp.vue';

const auth = useAuthStore();
const store = useOrganizationStore();
const router = useRouter();
const { startTour } = useAppTour();

// `embedded`: la vista vive dentro de Ajustes (arquetipo F) como pestaña, sin
// container ni PageHeader propios. Se omiten también las tarjetas de acceso
// rápido a Establecimientos/Certificado: en Ajustes son pestañas hermanas.
const props = defineProps<{ embedded?: boolean }>();

const legalName = ref('');
const tradeName = ref('');
const taxId = ref('');
const countryCode = ref('EC');
const obligadoContabilidad = ref(false);
const saved = ref(false);

/**
 * Segundo paso del alta: se llega aquí porque el guard del router no deja
 * entrar sin organización. Se guarda al montar porque `needsOrgSetup` deja de
 * ser cierto en cuanto se guarda, y al terminar hay que saber si esto era un
 * alta (llevar al inicio) o una edición normal desde Ajustes (quedarse).
 */
const isSetup = ref(false);

onMounted(async () => {
  isSetup.value = !props.embedded && auth.needsOrgSetup;
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
  await nextTick();
  maybeStartOrgTour();
});

/**
 * Tour de la organización: explica campo a campo qué se está pidiendo. Sale
 * una sola vez y solo en el alta, con el formulario ya pintado para que
 * driver.js encuentre los campos que señala.
 */
function maybeStartOrgTour(): void {
  const id = auth.user?.id;
  if (!isSetup.value || !id) return;
  if (!shouldAutoStartTour(id, 'organization')) return;
  startTour('organization');
}

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
    // Cerrado el perfil de la organización, el alta sigue hacia el perfil de
    // negocio (qué se le sugiere) si aún no se ha decidido; si ya eligió (cambió
    // de organización, invitado hereda una configurada), el sitio es el inicio,
    // donde arranca el tour de la aplicación. En una edición desde Ajustes se
    // queda donde estaba.
    if (isSetup.value) {
      isSetup.value = false;
      const plugins = usePluginsStore();
      await plugins.ensureMyLoaded();
      await router.push(
        plugins.profilePending ? { name: 'business-profile' } : { name: 'home' },
      );
      return;
    }
    saved.value = true;
  } catch {
    // handled by store
  }
}
</script>

<template>
  <!-- El wrapper cambia según el modo: en Ajustes (embedded) no hay container propio. -->
  <component :is="props.embedded ? 'div' : 'v-container'">
    <PageHeader v-if="!props.embedded" :title="$t('organization.settingsTitle')" />

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

            <v-form data-tour="org-form" @submit.prevent="submit">
              <v-text-field
                v-model="legalName"
                :label="$t('organization.legalName')"
                class="mb-4"
                :placeholder="$t('organization.legalNamePlaceholder')"
              >
                <template #append>
                  <FieldHelp :text="$t('organization.help.legalName')" />
                </template>
              </v-text-field>

              <v-text-field
                v-model="tradeName"
                :label="$t('customers.tradeName')"
                class="mb-4"
                :placeholder="$t('organization.tradeNamePlaceholder')"
              >
                <template #append>
                  <FieldHelp :text="$t('organization.help.tradeName')" />
                </template>
              </v-text-field>

              <v-text-field
                v-model="taxId"
                :label="$t('invoices.taxIdLabel')"
                class="mb-4"
                :placeholder="$t('invoices.taxIdPlaceholder')"
              >
                <template #append>
                  <FieldHelp :text="$t('organization.help.taxId')" />
                </template>
              </v-text-field>

              <v-select
                v-model="countryCode"
                :items="[{ title: 'Ecuador', value: 'EC' }]"
                :label="$t('common.country')"
                class="mb-4"
              >
                <template #append>
                  <FieldHelp :text="$t('organization.help.country')" />
                </template>
              </v-select>

              <v-checkbox
                v-model="obligadoContabilidad"
                density="compact"
                hide-details="auto"
                class="mb-4"
              >
                <template #label>
                  {{ $t('organization.accountingObliged') }}
                  <FieldHelp :text="$t('organization.help.accounting')" />
                </template>
              </v-checkbox>

              <v-btn
                data-tour="org-submit"
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

    <!-- Durante el alta estas dos tarjetas son callejones sin salida: el guard
         del router no deja entrar a ninguna de las dos hasta que la organización
         esté rellenada, así que solo distraen del formulario de arriba. -->
    <v-row v-if="!props.embedded && !isSetup">
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

    <v-row v-if="!props.embedded && !isSetup">
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
  </component>
</template>
