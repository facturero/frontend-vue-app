<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useOrganizationStore } from '@/stores/organization';
import type { EstablishmentDTO, EmissionPointDTO } from '@/types/organization';
import PageHeader from '@/components/ui/PageHeader.vue';

const { t } = useI18n();
const auth = useAuthStore();
const store = useOrganizationStore();

// `embedded`: la vista vive dentro de Ajustes (arquetipo F) como pestaña, sin
// container ni PageHeader propios.
const props = defineProps<{ embedded?: boolean }>();

const canCreate = computed(() => auth.can('establishment:create'));

const selected = ref<EstablishmentDTO | null>(null);

const showEstablishmentDialog = ref(false);
const newEstablishmentName = ref('');
const newEstablishmentAddress = ref('');

const showEmissionPointDialog = ref(false);
const newEmissionPointName = ref('');
const newEmissionPointType = ref<'web' | 'pos'>('web');

const showPairingDialog = ref(false);
const pairingPoint = ref<EmissionPointDTO | null>(null);

async function selectEstablishment(est: EstablishmentDTO): Promise<void> {
  selected.value = est;
  await store.fetchEmissionPoints(est.id);
}

async function submitEstablishment(): Promise<void> {
  if (!newEstablishmentName.value) return;
  try {
    const est = await store.createEstablishment({
      name: newEstablishmentName.value,
      address: newEstablishmentAddress.value || undefined,
    });
    showEstablishmentDialog.value = false;
    newEstablishmentName.value = '';
    newEstablishmentAddress.value = '';
    await selectEstablishment(est);
  } catch {
    // el error ya se muestra desde el store
  }
}

async function submitEmissionPoint(): Promise<void> {
  if (!selected.value) return;
  try {
    await store.createEmissionPoint(selected.value.id, {
      name: newEmissionPointName.value || undefined,
      type: newEmissionPointType.value,
    });
    showEmissionPointDialog.value = false;
    newEmissionPointName.value = '';
    newEmissionPointType.value = 'web';
  } catch {
    // el error ya se muestra desde el store
  }
}

function openPairingDialog(ep: EmissionPointDTO): void {
  if (!selected.value) return;
  pairingPoint.value = ep;
  showPairingDialog.value = true;
  store.startPairingCodePolling(selected.value.id, ep.id);
}

function closePairingDialog(): void {
  showPairingDialog.value = false;
  pairingPoint.value = null;
  store.stopPairingCodePolling();
}

async function handleUnlink(ep: EmissionPointDTO): Promise<void> {
  if (!selected.value) return;
  const confirmed = confirm(
    t('establishments.unlinkConfirm', {
      name: ep.name || t('establishments.pointFallback', { code: ep.code }),
    }),
  );
  if (!confirmed) return;
  await store.unlinkEmissionPoint(selected.value.id, ep.id);
}

onMounted(async () => {
  await store.fetchEstablishments();
  if (store.establishments.length > 0) {
    await selectEstablishment(store.establishments[0]);
  }
});

onUnmounted(() => {
  store.stopPairingCodePolling();
});
</script>

<template>
  <!-- El wrapper cambia según el modo: en Ajustes (embedded) no hay container propio. -->
  <component :is="props.embedded ? 'div' : 'v-container'">
    <PageHeader
      v-if="!props.embedded"
      :title="$t('establishments.title')"
      :subtitle="$t('establishments.intro')"
    />

    <v-alert v-if="store.error" type="error" closable class="mb-4"
      @click:close="store.error = null">
      {{ store.error }}
    </v-alert>

    <v-row>
      <!-- Establecimientos -->
      <v-col cols="12" md="5">
        <v-card>
          <v-card-title class="d-flex align-center justify-space-between">
            <span class="text-body-1 font-weight-medium">{{ $t('establishments.listTitle') }}</span>
            <v-btn v-if="canCreate" size="small" variant="tonal" color="primary" prepend-icon="mdi-plus"
              @click="showEstablishmentDialog = true">
              {{ $t('establishments.new') }}
            </v-btn>
          </v-card-title>
          <v-list density="compact" nav>
            <v-list-item
              v-for="est in store.establishments"
              :key="est.id"
              :active="selected?.id === est.id"
              @click="selectEstablishment(est)"
            >
              <v-list-item-title>{{ est.name }}</v-list-item-title>
              <v-list-item-subtitle>
                {{ $t('establishments.code', { code: est.code }) }}
                <v-chip size="x-small" class="ml-2" variant="flat" :color="est.status === 'active' ? 'lightsuccess' : 'lightwarning'">
                  {{ est.status === 'active' ? $t('common.active') : $t('common.inactive') }}
                </v-chip>
              </v-list-item-subtitle>
            </v-list-item>
            <v-list-item v-if="store.establishments.length === 0">
              <v-list-item-title class="text-medium-emphasis">
                {{ $t('establishments.empty') }}
              </v-list-item-title>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>

      <!-- Puntos de emisión del establecimiento seleccionado -->
      <v-col cols="12" md="7">
        <v-card v-if="selected">
          <v-card-title class="d-flex align-center justify-space-between">
            <span class="text-body-1 font-weight-medium">
              {{ $t('establishments.pointsFor', { name: selected.name }) }}
            </span>
            <v-btn v-if="canCreate" size="small" variant="tonal" color="primary" prepend-icon="mdi-plus"
              @click="showEmissionPointDialog = true">
              {{ $t('establishments.new') }}
            </v-btn>
          </v-card-title>
          <v-list density="compact">
            <v-list-item v-for="ep in store.emissionPoints" :key="ep.id">
              <v-list-item-title class="d-flex align-center ga-2">
                {{ ep.name || $t('establishments.pointFallback', { code: ep.code }) }}
                <v-chip size="x-small" variant="flat" :color="ep.type === 'pos' ? 'lightinfo' : 'lightsecondary'">
                  {{ ep.type === 'pos' ? $t('establishments.typePos') : $t('establishments.typeWeb') }}
                </v-chip>
              </v-list-item-title>
              <v-list-item-subtitle class="d-flex align-center ga-2">
                <span class="text-caption">{{ $t('establishments.code', { code: ep.code }) }}</span>
                <v-chip size="x-small" variant="flat" :color="ep.status === 'active' ? 'lightsuccess' : 'lightwarning'">
                  {{ ep.status === 'active' ? $t('common.active') : $t('common.inactive') }}
                </v-chip>
                <template v-if="ep.type === 'pos'">
                  <v-chip size="x-small" variant="flat" :color="ep.paired ? 'lightsuccess' : 'lightwarning'">
                    {{ ep.paired ? $t('establishments.paired') : $t('establishments.unpaired') }}
                  </v-chip>
                </template>
              </v-list-item-subtitle>

              <template v-if="ep.type === 'pos'" #append>
                <v-btn
                  v-if="!ep.paired"
                  size="small"
                  variant="tonal"
                  color="primary"
                  @click="openPairingDialog(ep)"
                >
                  {{ $t('establishments.viewCode') }}
                </v-btn>
                <v-btn
                  v-else
                  size="small"
                  variant="text"
                  color="error"
                  @click="handleUnlink(ep)"
                >
                  {{ $t('establishments.unlink') }}
                </v-btn>
              </template>
            </v-list-item>
            <v-list-item v-if="store.emissionPoints.length === 0">
              <v-list-item-title class="text-medium-emphasis">
                {{ $t('establishments.noPoints') }}
              </v-list-item-title>
            </v-list-item>
          </v-list>
          <v-card-text class="text-caption text-medium-emphasis">
            {{ $t('establishments.idHint', { id: selected.id }) }}
          </v-card-text>
        </v-card>

        <v-card v-else>
          <v-card-text class="text-medium-emphasis text-center pa-8">
            {{ $t('establishments.pickOne') }}
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Dialog: nuevo establecimiento -->
    <v-dialog v-model="showEstablishmentDialog" max-width="480">
      <v-card>
        <v-card-title>{{ $t('establishments.newEstablishment') }}</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newEstablishmentName"
            :label="$t('common.name')"
            class="mb-4"
            :placeholder="$t('invoices.establishmentPlaceholder')"
          />
          <v-text-field
            v-model="newEstablishmentAddress"
            :label="$t('establishments.addressOptional')"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showEstablishmentDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="store.saving" :disabled="!newEstablishmentName" @click="submitEstablishment">
            {{ $t('common.create') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: nuevo punto de emisión -->
    <v-dialog v-model="showEmissionPointDialog" max-width="480">
      <v-card>
        <v-card-title>{{ $t('establishments.newPoint') }}</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newEmissionPointName"
            :label="$t('establishments.nameOptional')"
            class="mb-4"
            :placeholder="$t('establishments.namePlaceholder')"
          />
          <p class="text-caption text-medium-emphasis mb-2">{{ $t('establishments.pointType') }}</p>
          <v-btn-toggle v-model="newEmissionPointType" mandatory color="primary" density="comfortable" class="mb-2">
            <v-btn value="web">{{ $t('establishments.typeWeb') }}</v-btn>
            <v-btn value="pos">{{ $t('establishments.typePosLong') }}</v-btn>
          </v-btn-toggle>
          <p v-if="newEmissionPointType === 'pos'" class="text-caption text-medium-emphasis">
            {{ $t('establishments.posHint') }}
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showEmissionPointDialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="store.saving" @click="submitEmissionPoint">
            {{ $t('common.create') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: código de emparejamiento rotativo -->
    <v-dialog v-model="showPairingDialog" max-width="420" @update:model-value="(v: boolean) => !v && closePairingDialog()">
      <v-card>
        <v-card-title>
          {{ $t('establishments.pairTitle', {
            name: pairingPoint?.name || $t('establishments.pointFallback', { code: pairingPoint?.code }),
          }) }}
        </v-card-title>
        <v-card-text class="text-center">
          <p class="text-body-2 text-medium-emphasis mb-4">
            {{ $t('establishments.pairHint') }}
          </p>
          <p class="text-h3 font-weight-bold font-mono" style="letter-spacing: 0.3em;">
            {{ store.pairingCode ?? '······' }}
          </p>
          <p class="text-caption text-medium-emphasis mt-2">
            {{ $t('establishments.rotatesIn', { seconds: store.pairingSecondsRemaining }) }}
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="closePairingDialog">{{ $t('common.close') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </component>
</template>
