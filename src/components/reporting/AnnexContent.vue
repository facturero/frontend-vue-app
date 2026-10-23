<script setup lang="ts">
/**
 * El detalle de una versión según el anexo: el 103 por código de concepto, el 104 con su liquidación y el ATS en cuatro tablas. Todo viene
 * en centavos del servidor y aquí solo se le da formato; no se recalcula nada.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatMoney } from '@/utils/accounting';
import type { AnnexType, AtsContent, F103Content, F104Content, TarifaTotal } from '@/types/reporting';

const props = defineProps<{ annex: AnnexType; content: unknown }>();

const { t, locale } = useI18n();
const money = (cents: number) => formatMoney(cents, locale.value);
const rate = (n: number) => `${n} %`;

const f103 = computed(() => (props.annex === 'f103' ? (props.content as F103Content) : null));
const f104 = computed(() => (props.annex === 'f104' ? (props.content as F104Content) : null));
const ats = computed(() => (props.annex === 'ats' ? (props.content as AtsContent) : null));

const concepts = computed(() => Object.entries(f103.value?.totalesPorConcepto ?? {}).map(([code, c]) => ({ code, ...c })));
const conceptTotals = computed(() => ({
  base: concepts.value.reduce((s, c) => s + c.baseCents, 0),
  withheld: concepts.value.reduce((s, c) => s + c.valorRetenidoCents, 0),
}));
const tariffs = (rows: Record<string, TarifaTotal> | undefined) => Object.values(rows ?? {});

const h = (key: string, title: string, align: 'start' | 'end' = 'start') => ({ key, title, sortable: false, align });
const conceptHeaders = computed(() => [
  h('code', t('reporting.f103.concept')), h('porcentajes', t('reporting.f103.percentages')), h('retenciones', t('reporting.f103.count'), 'end'),
  h('baseCents', t('reporting.f103.base'), 'end'), h('valorRetenidoCents', t('reporting.f103.withheld'), 'end'),
]);
const rateHeaders = computed(() => [h('ratePercent', t('reporting.f104.rate')), h('baseCents', t('reporting.f104.base'), 'end'), h('ivaCents', t('reporting.f104.iva'), 'end')]);
const purchaseHeaders = computed(() => [
  h('fechaEmision', t('reporting.ats.date')), h('tipoComprobante', t('reporting.ats.type')), h('numero', t('reporting.ats.number')), h('proveedor', t('reporting.ats.party')),
  h('autorizacion', t('reporting.ats.authorization')), h('sustento', t('reporting.ats.support')), h('base0Cents', t('reporting.ats.base0'), 'end'),
  h('baseGravadaCents', t('reporting.ats.baseTaxed'), 'end'), h('ivaCents', t('reporting.ats.iva'), 'end'), h('retenciones', t('reporting.ats.withholdings')),
]);
const salesHeaders = computed(() => [
  h('identificacion', t('reporting.ats.id')), h('cliente', t('reporting.ats.customer')), h('tipoComprobante', t('reporting.ats.type')), h('comprobantes', t('reporting.ats.receipts'), 'end'),
  h('base0Cents', t('reporting.ats.base0'), 'end'), h('baseGravadaCents', t('reporting.ats.baseTaxed'), 'end'), h('ivaCents', t('reporting.ats.iva'), 'end'),
]);
const voidedHeaders = computed(() => [
  h('origen', t('reporting.ats.origin')), h('tipoComprobante', t('reporting.ats.type')), h('numero', t('reporting.ats.number')), h('fechaEmision', t('reporting.ats.issued')), h('fechaAnulacion', t('reporting.ats.voidedOn')),
]);
const orphanHeaders = computed(() => [
  h('numero', t('reporting.ats.number')), h('fechaEmision', t('reporting.ats.date')), h('proveedor', t('reporting.ats.party')), h('identificacion', t('reporting.ats.id')), h('sustento', t('reporting.ats.supportDocument')),
]);
const numberOf = (d: { establecimiento: string; puntoEmision: string; secuencial: string }) => `${d.establecimiento}-${d.puntoEmision}-${d.secuencial}`;
</script>

<template>
  <!-- Formulario 103 -->
  <v-card v-if="f103">
    <v-card-title class="text-h6">{{ $t('reporting.f103.title') }}</v-card-title>
    <v-card-text>
      <v-data-table :headers="conceptHeaders" :items="concepts" :items-per-page="-1" hide-default-footer>
        <template #item.porcentajes="{ item }">{{ item.porcentajes.map(rate).join(' / ') }}</template>
        <template #item.baseCents="{ item }">{{ money(item.baseCents) }}</template>
        <template #item.valorRetenidoCents="{ item }">{{ money(item.valorRetenidoCents) }}</template>
        <template #body.append>
          <tr v-if="concepts.length > 0" class="font-weight-bold">
            <td>{{ $t('reporting.f103.total') }}</td><td /><td /><td class="text-end">{{ money(conceptTotals.base) }}</td><td class="text-end">{{ money(conceptTotals.withheld) }}</td>
          </tr>
        </template>
        <template #no-data>{{ $t('reporting.f103.empty') }}</template>
      </v-data-table>
      <p class="text-body-2 text-medium-emphasis mt-4">{{ $t('reporting.f103.casilleroNote') }}</p>
      <p v-if="f103.retencionesIvaEIsdNoIncluidasCents > 0" class="text-body-2 text-medium-emphasis">
        {{ $t('reporting.f103.otherTaxes', { amount: money(f103.retencionesIvaEIsdNoIncluidasCents) }) }}
      </p>
    </v-card-text>
  </v-card>

  <!-- Formulario 104 -->
  <template v-else-if="f104">
    <v-row>
      <v-col cols="12" md="6">
        <v-card>
          <v-card-title class="text-h6">{{ $t('reporting.f104.sales') }}</v-card-title>
          <v-card-text>
            <v-data-table :headers="rateHeaders" :items="tariffs(f104.ventas.porTarifa)" :items-per-page="-1" hide-default-footer>
              <template #item.ratePercent="{ item }">{{ rate(item.ratePercent) }}</template>
              <template #item.baseCents="{ item }">{{ money(item.baseCents) }}</template>
              <template #item.ivaCents="{ item }">{{ money(item.ivaCents) }}</template>
              <template #no-data>{{ $t('reporting.f104.empty') }}</template>
            </v-data-table>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="6">
        <v-card>
          <v-card-title class="text-h6">{{ $t('reporting.f104.purchases') }}</v-card-title>
          <v-card-text>
            <v-data-table :headers="rateHeaders" :items="tariffs(f104.compras.porTarifa)" :items-per-page="-1" hide-default-footer>
              <template #item.ratePercent="{ item }">{{ rate(item.ratePercent) }}</template>
              <template #item.baseCents="{ item }">{{ money(item.baseCents) }}</template>
              <template #item.ivaCents="{ item }">{{ money(item.ivaCents) }}</template>
              <template #no-data>{{ $t('reporting.f104.empty') }}</template>
            </v-data-table>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
    <v-card class="mt-4">
      <v-card-title class="text-h6">{{ $t('reporting.f104.settlement') }}</v-card-title>
      <v-card-text>
        <v-table>
          <tbody>
            <tr><td>{{ $t('reporting.f104.rows.generated') }}</td><td class="text-end">{{ money(f104.liquidacion.ivaGeneradoCents) }}</td></tr>
            <tr><td>{{ $t('reporting.f104.rows.credit') }}</td><td class="text-end">{{ money(f104.liquidacion.creditoAplicableCents) }}</td></tr>
            <tr><td>{{ $t('reporting.f104.rows.previousCredit') }}</td><td class="text-end">{{ money(f104.liquidacion.creditoAnteriorCents) }}</td></tr>
            <tr><td>{{ $t('reporting.f104.rows.withheldByClients') }}</td><td class="text-end">{{ money(f104.liquidacion.ivaRetenidoSufridoCents) }}</td></tr>
            <tr><td>{{ $t('reporting.f104.rows.adjustments') }}</td><td class="text-end">{{ money(f104.liquidacion.ajustesCents) }}</td></tr>
            <tr class="font-weight-bold">
              <td>{{ $t(`reporting.result.${f104.liquidacion.resultado}`) }}</td>
              <td class="text-end">{{ money(Math.abs(f104.liquidacion.saldoCents)) }}</td>
            </tr>
          </tbody>
        </v-table>
        <p class="text-body-2 text-medium-emphasis mt-4">
          {{ $t('reporting.f104.withheldSuppliers') }}: <strong>{{ money(f104.ivaRetenidoPracticadoCents) }}</strong>
        </p>
      </v-card-text>
    </v-card>
  </template>

  <!-- ATS -->
  <template v-else-if="ats">
    <v-alert v-if="!ats.informante" type="warning" class="mb-4">{{ $t('reporting.ats.noInformant') }}</v-alert>
    <p v-else class="text-body-2 text-medium-emphasis mb-4">{{ $t('reporting.ats.informant') }}: {{ ats.informante.legalName }} · {{ ats.informante.ruc }}</p>

    <v-card class="mb-4">
      <v-card-title class="text-h6">{{ $t('reporting.ats.purchases') }}</v-card-title>
      <v-card-text>
        <v-data-table :headers="purchaseHeaders" :items="ats.compras" :items-per-page="10">
          <template #item.tipoComprobante="{ item }">{{ item.tipoComprobante }}</template>
          <template #item.numero="{ item }">{{ numberOf(item) }}</template>
          <template #item.base0Cents="{ item }">{{ money(item.base0Cents) }}</template>
          <template #item.baseGravadaCents="{ item }">{{ money(item.baseGravadaCents) }}</template>
          <template #item.ivaCents="{ item }">{{ money(item.ivaCents) }}</template>
          <template #item.retenciones="{ item }">{{ item.retenciones.map((r) => r.numero).join(', ') }}</template>
          <template #no-data>{{ $t('reporting.ats.emptyPurchases') }}</template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <v-card class="mb-4">
      <v-card-title class="text-h6">{{ $t('reporting.ats.salesByCustomer') }}</v-card-title>
      <v-card-text>
        <v-data-table :headers="salesHeaders" :items="ats.ventasPorCliente" :items-per-page="10">
          <template #item.base0Cents="{ item }">{{ money(item.base0Cents) }}</template>
          <template #item.baseGravadaCents="{ item }">{{ money(item.baseGravadaCents) }}</template>
          <template #item.ivaCents="{ item }">{{ money(item.ivaCents) }}</template>
          <template #no-data>{{ $t('reporting.ats.emptySales') }}</template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <v-card class="mb-4">
      <v-card-title class="text-h6">{{ $t('reporting.ats.voided') }}</v-card-title>
      <v-card-text>
        <v-data-table :headers="voidedHeaders" :items="ats.anulados" :items-per-page="10">
          <template #item.numero="{ item }">{{ numberOf(item) }}</template>
          <template #item.origen="{ item }">{{ $t(`reporting.documents.directions.${item.origen}`) }}</template>
          <template #no-data>{{ $t('reporting.ats.emptyVoided') }}</template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <v-card>
      <v-card-title class="text-h6">{{ $t('reporting.ats.withholdingsWithoutPurchase') }}</v-card-title>
      <v-card-text>
        <v-data-table :headers="orphanHeaders" :items="ats.retencionesSinCompra" :items-per-page="10">
          <template #no-data>{{ $t('reporting.ats.emptyWithholdings') }}</template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </template>
</template>
