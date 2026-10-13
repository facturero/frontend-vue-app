<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import PosCart from '@/components/pos/PosCart.vue';
import PosCatalog from '@/components/pos/PosCatalog.vue';
import PosHeader from '@/components/pos/PosHeader.vue';
import PosPaymentDialog from '@/components/pos/PosPaymentDialog.vue';
import PosSetupDialog from '@/components/pos/PosSetupDialog.vue';
import PosStatusBar from '@/components/pos/PosStatusBar.vue';
import { usePosMoney } from '@/composable/usePosMoney';
import { useOrganizationStore } from '@/stores/organization';
import { usePosStore } from '@/stores/pos';
import { usePosCashierThemeStore } from '@/stores/posCashierTheme';
import type { ProductSummary } from '@/types/products';
import '@/styles/pos-kiosk.css';

/**
 * Caja web (`/pos` dentro del CRM): la misma pantalla que la caja de escritorio (cabecera, catálogo con
 * categorías, carrito a un lado, barra de estado) pintada con el tema de la organización, para vender y facturar desde una laptop con
 * la sesión de quien vende. La organización la pone el JWT, así que sirve a todas por igual; nada se configura por
 * organización. Sin modo sin conexión: si no hay internet no se factura. Ver docs/POS-WEB.md.
 */
const { t } = useI18n();
const pos = usePosStore();
const theme = usePosCashierThemeStore();
const org = useOrganizationStore();
const { money } = usePosMoney();

const setupOpen = ref(false);
const payOpen = ref(false);
const notice = ref<string | null>(null);

const pointLabel = computed(() => {
  if (!pos.point) return null;
  const est = org.establishments.find((e) => e.id === pos.point?.establishmentId);
  const ep = org.emissionPoints.find((p) => p.id === pos.point?.emissionPointId);
  return est && ep ? `${est.code}-${ep.code}` : null;
});

/** El total que la caja calculó y el que facturó el servidor difieren (un precio cambió en el CRM): se avisa, la factura vale la del servidor. */
const mismatch = computed(() => !!pos.lastSale && pos.lastSale.totalCents !== pos.lastSale.expectedCents);

// El tema es el del punto con el que se factura: se pide al elegirlo o cambiarlo.
watch(
  () => pos.point,
  (point) => {
    if (point) void theme.load(point.establishmentId, point.emissionPointId);
  },
);

onMounted(async () => {
  pos.init();
  theme.restore();
  if (pos.point) void theme.load(pos.point.establishmentId, pos.point.emissionPointId);
  void org.fetch();
  await org.fetchEstablishments();
  if (pos.point) await org.fetchEmissionPoints(pos.point.establishmentId);
  else setupOpen.value = true;
});

async function onAdd(product: ProductSummary): Promise<void> {
  pos.dismissLastSale();
  notice.value = null;
  const failure = await pos.addProduct(product);
  if (failure) notice.value = t(`pos.addFailed.${failure}`, { name: product.name });
}
</script>

<template>
  <div class="pk" :style="theme.vars" :data-mode="theme.mode">
    <PosStatusBar v-if="theme.config.layout.statusBarPosition === 'top'" />
    <PosHeader :point-label="pointLabel" @change-point="setupOpen = true" />

    <main class="pk-main">
      <div v-if="pos.lastSale" class="pk-banner pk-banner--ok" role="status">
        <i class="mdi mdi-check-circle-outline" />
        <div class="pk-grow">
          <strong>{{ $t('pos.done.title', { number: pos.lastSale.number ?? '—', total: money(pos.lastSale.totalCents) }) }}</strong>
          <span v-if="pos.lastSale.paymentMethodCode === '01' && pos.lastSale.receivedCents !== null">
            {{ $t('pos.done.change', { change: money(pos.lastSale.changeCents) }) }}
          </span>
          <span>{{ $t('pos.done.sri') }}</span>
        </div>
        <button type="button" class="pk-banner__x" :aria-label="$t('common.close')" @click="pos.dismissLastSale()"><i class="mdi mdi-close" /></button>
      </div>
      <div v-if="mismatch && pos.lastSale" class="pk-banner pk-banner--warn" role="alert">
        <i class="mdi mdi-alert-outline" />
        <div class="pk-grow">{{ $t('pos.done.mismatch', { expected: money(pos.lastSale.expectedCents), total: money(pos.lastSale.totalCents) }) }}</div>
      </div>
      <div v-if="notice" class="pk-banner pk-banner--warn" role="alert">
        <i class="mdi mdi-alert-outline" />
        <div class="pk-grow">{{ notice }}</div>
        <button type="button" class="pk-banner__x" :aria-label="$t('common.close')" @click="notice = null"><i class="mdi mdi-close" /></button>
      </div>

      <div class="pk-body" :class="{ 'pk-body--cart-left': theme.config.layout.cartPosition === 'left' }">
        <PosCatalog @add="onAdd" />
        <PosCart @charge="payOpen = true" />
      </div>
    </main>

    <PosStatusBar v-if="theme.config.layout.statusBarPosition !== 'top'" />

    <PosSetupDialog v-model="setupOpen" />
    <PosPaymentDialog v-model="payOpen" />
  </div>
</template>
