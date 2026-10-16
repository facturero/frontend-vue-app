<script setup lang="ts">
/**
 * Establecimiento y punto de emisión desde los que sale un comprobante. Si la organización solo tiene uno de cada, queda elegido
 * solo: la mayoría de las empresas no debería tener que pensar en esto.
 */
import { computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useOrganizationStore } from '@/stores/organization';

const establishmentId = defineModel<string>('establishmentId', { required: true });
const emissionPointId = defineModel<string>('emissionPointId', { required: true });

const { t } = useI18n();
const org = useOrganizationStore();

const establishmentItems = computed(() =>
  org.establishments.filter((e) => e.status === 'active').map((e) => ({ title: `${e.code} — ${e.name}`, value: e.id })),
);
const pointItems = computed(() =>
  org.emissionPoints.filter((ep) => ep.status === 'active').map((ep) => ({ title: `${ep.code} — ${ep.name || t('invoices.emissionPoint')}`, value: ep.id })),
);

async function loadPoints(id: string): Promise<void> {
  emissionPointId.value = '';
  org.emissionPoints.splice(0);
  if (!id) return;
  await org.fetchEmissionPoints(id);
  const active = org.emissionPoints.filter((ep) => ep.status === 'active');
  if (active.length === 1) emissionPointId.value = active[0]!.id;
}

watch(establishmentId, (id) => void loadPoints(id));

onMounted(async () => {
  await org.fetchEstablishments();
  const active = org.establishments.filter((e) => e.status === 'active');
  if (!establishmentId.value && active.length === 1) establishmentId.value = active[0]!.id;
});
</script>

<template>
  <div class="d-flex flex-column flex-sm-row ga-4">
    <v-select v-model="establishmentId" :items="establishmentItems" :label="$t('organization.establishment')" />
    <v-select v-model="emissionPointId" :items="pointItems" :label="$t('invoices.emissionPoint')" :disabled="!establishmentId" />
  </div>
</template>
