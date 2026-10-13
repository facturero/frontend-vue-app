<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import PageHeader from '@/components/ui/PageHeader.vue';
import PosCart from '@/components/pos/PosCart.vue';
import PosPaymentDialog from '@/components/pos/PosPaymentDialog.vue';
import PosProductSearch from '@/components/pos/PosProductSearch.vue';
import PosSetupDialog from '@/components/pos/PosSetupDialog.vue';
import { usePosMoney } from '@/composable/usePosMoney';
import { useOrganizationStore } from '@/stores/organization';
import { usePosStore } from '@/stores/pos';
import type { ProductSummary } from '@/types/products';

/**
 * Caja web (`/pos`, y única pantalla del dominio `pos.`): vender y facturar desde una laptop con la sesión de quien vende. La
 * organización la pone el JWT, así que el mismo dominio sirve a todas; nada se configura por organización. Sin modo sin conexión:
 * si no hay internet no se factura. Ver docs/POS-WEB.md.
 */
const { t } = useI18n();
const pos = usePosStore();
const org = useOrganizationStore();
const { money } = usePosMoney();

const setupOpen = ref(false);
const payOpen = ref(false);
const notice = ref<string | null>(null);

const pointLabel = computed(() => {
  if (!pos.point) return undefined;
  const est = org.establishments.find((e) => e.id === pos.point?.establishmentId);
  const ep = org.emissionPoints.find((p) => p.id === pos.point?.emissionPointId);
  return est && ep ? t('pos.subtitle', { point: `${est.code}-${ep.code}`, terminal: pos.terminalId }) : undefined;
});

/** El total que la caja calculó y el que facturó el servidor difieren (un precio cambió en el CRM): se avisa, la factura vale la del servidor. */
const mismatch = computed(() => !!pos.lastSale && pos.lastSale.totalCents !== pos.lastSale.expectedCents);

onMounted(async () => {
  pos.init();
  void org.fetch();
  await org.fetchEstablishments();
  if (pos.point) await org.fetchEmissionPoints(pos.point.establishmentId);
  else setupOpen.value = true;
});

async function onAdd(product: ProductSummary): Promise<void> {
  pos.dismissLastSale();
  const failure = await pos.addProduct(product);
  if (failure) notice.value = t(`pos.addFailed.${failure}`, { name: product.name });
}
</script>

<template>
  <div class="pa-4 pa-md-6">
    <PageHeader :title="$t('pos.title')" :subtitle="pointLabel" :sticky="false">
      <template #actions>
        <v-btn variant="tonal" prepend-icon="mdi-swap-horizontal" @click="setupOpen = true">{{ $t('pos.setup.change') }}</v-btn>
      </template>
    </PageHeader>

    <v-alert v-if="pos.lastSale" type="success" closable class="mb-4" @click:close="pos.dismissLastSale()">
      <div class="font-weight-medium">
        {{ $t('pos.done.title', { number: pos.lastSale.number ?? '—', total: money(pos.lastSale.totalCents) }) }}
      </div>
      <div v-if="pos.lastSale.paymentMethodCode === '01' && pos.lastSale.receivedCents !== null">
        {{ $t('pos.done.change', { change: money(pos.lastSale.changeCents) }) }}
      </div>
      <div class="text-caption">{{ $t('pos.done.sri') }}</div>
    </v-alert>
    <v-alert v-if="mismatch && pos.lastSale" type="warning" class="mb-4">
      {{ $t('pos.done.mismatch', { expected: money(pos.lastSale.expectedCents), total: money(pos.lastSale.totalCents) }) }}
    </v-alert>

    <v-row>
      <v-col cols="12" md="7">
        <PosProductSearch @add="onAdd" />
      </v-col>
      <v-col cols="12" md="5">
        <PosCart @charge="payOpen = true" />
      </v-col>
    </v-row>

    <PosSetupDialog v-model="setupOpen" />
    <PosPaymentDialog v-model="payOpen" />
    <v-snackbar :model-value="!!notice" color="warning" @update:model-value="notice = null">{{ notice }}</v-snackbar>
  </div>
</template>
