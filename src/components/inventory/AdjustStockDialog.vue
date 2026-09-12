<script setup lang="ts">
/**
 * Ajuste manual de existencias.
 *
 * El motivo es un desplegable cerrado, NUNCA texto libre. De la combinación de
 * motivo y signo sale la naturaleza contable que el movimiento guarda en el
 * kardex, y de ahí saldrá el asiento cuando exista el libro mayor. Si esto se
 * convirtiera en un campo de texto, toda esa cadena quedaría inservible y no se
 * notaría hasta dentro de un año.
 *
 * El campo de nota libre sigue existiendo, pero es para el humano: no decide
 * nada contable.
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useInventoryStore } from '@/stores/inventory';
import type { AdjustmentReasonCode, StockPosition } from '@/types/inventory';

const props = defineProps<{
  modelValue: boolean;
  position: StockPosition | null;
  productName: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  adjusted: [];
}>();

const { t } = useI18n();
const store = useInventoryStore();

type Direction = 'in' | 'out';

const direction = ref<Direction>('in');
const quantity = ref('');
const unitCost = ref('');
const reasonCode = ref<AdjustmentReasonCode | null>(null);
const reason = ref('');
const formError = ref<string | null>(null);

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
});

/** Qué motivos tienen sentido en cada dirección. Un robo no suma existencias y
 *  una merma tampoco; ofrecerlos como entrada solo invita a errores. */
const reasonsByDirection: Record<Direction, AdjustmentReasonCode[]> = {
  in: ['physical_count', 'correction'],
  out: ['physical_count', 'damage', 'expiration', 'theft', 'internal_use', 'correction'],
};

/** Espejo de la tabla del backend. Se muestra para que quien ajusta vea, antes
 *  de guardar, en qué se va a convertir contablemente lo que está haciendo. */
function natureFor(code: AdjustmentReasonCode | null, dir: Direction): string | null {
  if (!code) return null;
  if (dir === 'in') return code === 'physical_count' || code === 'correction' ? 'inventory_gain' : null;
  if (code === 'internal_use') return 'expense';
  return 'shrinkage';
}

const reasonOptions = computed(() =>
  reasonsByDirection[direction.value].map((code) => ({
    title: t(`inventory.reason.${code}`),
    value: code,
  })),
);

const previewNature = computed(() => natureFor(reasonCode.value, direction.value));

/** El costo unitario solo aplica a entradas con costo real de fuera. Un sobrante
 *  de conteo físico no tiene factura detrás: entra al promedio vigente. */
const showUnitCost = computed(
  () => direction.value === 'in' && reasonCode.value === 'correction',
);

function reset(): void {
  direction.value = 'in';
  quantity.value = '';
  unitCost.value = '';
  reasonCode.value = null;
  reason.value = '';
  formError.value = null;
  // El store es compartido: sin esto, abrir el dialogo despues de un fallo
  // anterior (aunque fuera de otra pantalla) mostraba un error que ya no venia
  // a cuento.
  store.error = null;
}

watch(open, (isOpen) => {
  if (isOpen) reset();
});

// Cambiar de dirección puede dejar seleccionado un motivo que ya no aplica.
watch(direction, (dir) => {
  if (reasonCode.value && !reasonsByDirection[dir].includes(reasonCode.value)) {
    reasonCode.value = null;
  }
});

async function submit(): Promise<void> {
  formError.value = null;
  if (!props.position) return;

  if (!/^\d+(\.\d{1,4})?$/.test(quantity.value) || Number(quantity.value) === 0) {
    formError.value = t('inventory.adjustDialog.invalidQuantity');
    return;
  }
  if (!reasonCode.value) {
    formError.value = t('inventory.adjustDialog.reasonRequired');
    return;
  }

  // El backend recibe la cantidad CON signo; la dirección es cosa de la UI.
  const signed = direction.value === 'out' ? `-${quantity.value}` : quantity.value;

  try {
    await store.adjust({
      productId: props.position.productId,
      warehouseId: props.position.warehouseId,
      quantity: signed,
      ...(showUnitCost.value && unitCost.value ? { unitCost: unitCost.value } : {}),
      currencyCode: props.position.currencyCode,
      reasonCode: reasonCode.value,
      ...(reason.value ? { reason: reason.value } : {}),
    });
    emit('adjusted');
  } catch {
    // El store ya dejó el mensaje en store.error; aquí no hay nada que añadir.
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="560" persistent>
    <v-card v-if="position">
      <v-card-title>{{ $t('inventory.adjustDialog.title') }}</v-card-title>

      <v-card-subtitle class="pb-2">
        {{ productName }}
        <span v-if="!store.isSingleWarehouse"> · {{ position.warehouseCode }}</span>
      </v-card-subtitle>

      <v-card-text>
        <v-alert
          v-if="formError || store.error"
          type="error"
          class="mb-4"
        >
          {{ formError || store.error }}
        </v-alert>

        <v-btn-toggle v-model="direction" mandatory divided class="mb-4" density="comfortable">
          <v-btn value="in" prepend-icon="mdi-tray-arrow-down">
            {{ $t('inventory.adjustDialog.entry') }}
          </v-btn>
          <v-btn value="out" prepend-icon="mdi-tray-arrow-up">
            {{ $t('inventory.adjustDialog.exit') }}
          </v-btn>
        </v-btn-toggle>

        <v-text-field
          v-model="quantity"
          :label="$t('inventory.quantity')"
          :hint="$t('inventory.adjustDialog.quantityHint')"
          persistent-hint
          class="mb-4"
          data-testid="adjust-quantity"
        />

        <v-select
          v-model="reasonCode"
          :items="reasonOptions"
          :label="$t('inventory.adjustDialog.reasonCode')"
          :hint="$t('inventory.adjustDialog.reasonCodeHint')"
          persistent-hint
          class="mb-4"
          data-testid="adjust-reason-code"
        />

        <!-- Lo que este ajuste significará para la contabilidad. Se enseña antes
             de guardar porque es la consecuencia real de elegir un motivo. -->
        <v-alert
          v-if="previewNature"
          type="info"
          class="mb-4"
          data-testid="adjust-nature-preview"
        >
          {{ $t('inventory.adjustDialog.naturePreview') }}
          <strong>{{ $t(`inventory.nature.${previewNature}`) }}</strong>
        </v-alert>

        <v-text-field
          v-if="showUnitCost"
          v-model="unitCost"
          :label="$t('inventory.adjustDialog.unitCost')"
          :hint="$t('inventory.adjustDialog.unitCostHint')"
          persistent-hint
          class="mb-4"
        />

        <v-textarea
          v-model="reason"
          :label="$t('inventory.adjustDialog.note')"
          :hint="$t('inventory.adjustDialog.noteHint')"
          persistent-hint
          rows="2"
          auto-grow
        />
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">{{ $t('common.cancel') }}</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="store.saving"
          data-testid="adjust-submit"
          @click="submit"
        >
          {{ $t('common.save') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
