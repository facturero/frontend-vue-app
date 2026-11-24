<script setup lang="ts">
/**
 * Un gráfico pedido al asistente. Usa las dos piezas de gráfico que ya aprobó UI-UX.md: `v-sparkline` (núcleo) para barras y
 * líneas, y `PieChart` (`v-pie` de labs, envuelto) para el anillo. Sin librerías nuevas.
 *
 * Debajo va siempre la lista con cada valor: un gráfico chico se mira, pero la cifra exacta se lee. Los números vienen tal cual
 * del modelo, que a su vez los copió de una herramienta (el prompt le prohíbe calcularlos).
 */
import { computed } from 'vue';
import PieChart, { type PieSlice } from '@/components/ui/PieChart.vue';
import { formatNumber } from '@/utils/format';
import type { ChartSpec } from '@/utils/assistant-blocks';

const props = defineProps<{ chart: ChartSpec }>();

// Colores por token del tema (nunca hexadecimal): el anillo cambia con el modo oscuro como todo lo demás.
const PALETTE = ['primary', 'secondary', 'success', 'warning', 'info', 'error'];

const slices = computed<PieSlice[]>(() =>
  props.chart.labels.map((title, i) => ({ key: `${i}`, title, value: props.chart.values[i] ?? 0, color: PALETTE[i % PALETTE.length]! })),
);

const value = (n: number) => (props.chart.unit ? `${formatNumber(n)} ${props.chart.unit}` : formatNumber(n));

const label = computed(() =>
  [props.chart.title, ...props.chart.labels.map((l, i) => `${l}: ${value(props.chart.values[i] ?? 0)}`)].filter(Boolean).join('. '),
);
</script>

<template>
  <div class="d-flex flex-column ga-2" data-testid="assistant-chart">
    <div v-if="chart.title" class="text-body-medium font-weight-medium">{{ chart.title }}</div>

    <PieChart v-if="chart.type === 'pie'" :items="slices" :size="150" :label="label" />
    <div v-else role="img" :aria-label="label">
      <v-sparkline
        :type="chart.type === 'bar' ? 'bar' : 'trend'"
        :model-value="chart.values"
        :labels="chart.labels"
        color="primary"
        :height="100"
        :padding="12"
        label-size="7"
        :line-width="chart.type === 'bar' ? 16 : 2"
        :smooth="chart.type === 'bar' ? 4 : 8"
        auto-draw
      />
    </div>

    <div class="d-flex flex-column">
      <div v-for="(l, i) in chart.labels" :key="i" class="d-flex justify-space-between ga-2 text-body-small">
        <span class="text-medium-emphasis">{{ l }}</span>
        <span class="font-weight-medium">{{ value(chart.values[i] ?? 0) }}</span>
      </div>
    </div>
  </div>
</template>
