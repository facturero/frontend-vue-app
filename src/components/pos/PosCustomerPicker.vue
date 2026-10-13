<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { customerApi } from '@/api/customers';
import { usePosStore } from '@/stores/pos';
import type { PosCustomer } from '@/types/pos';

/**
 * Cliente de la venta, como el buscador del carrito de escritorio: se busca en el servidor al escribir (mínimo 2 letras) y el elegido
 * queda como una etiqueta que se puede quitar. Sin cliente = CONSUMIDOR FINAL: no se manda `customerId` y billing-service factura a
 * ese cliente de la organización.
 */
const pos = usePosStore();

const text = ref('');
const results = ref<PosCustomer[]>([]);
const searching = ref(false);
const open = ref(false);

let timer: ReturnType<typeof setTimeout> | undefined;
let sequence = 0;

watch(text, (value) => {
  clearTimeout(timer);
  const q = value.trim();
  if (q.length < 2) {
    results.value = [];
    open.value = false;
    return;
  }
  timer = setTimeout(async () => {
    const mine = ++sequence;
    searching.value = true;
    try {
      const list = await customerApi.list({ search: q, status: 'active' });
      if (mine !== sequence) return;
      results.value = list.map((c) => ({ id: c.id, name: c.businessName, identification: c.identification }));
      open.value = results.value.length > 0;
    } catch {
      if (mine === sequence) results.value = [];
    } finally {
      if (mine === sequence) searching.value = false;
    }
  }, 250);
});

function select(c: PosCustomer): void {
  pos.setCustomer(c);
  text.value = '';
  results.value = [];
  open.value = false;
}

// El @blur cierra la lista con un pequeño retraso para que el @mousedown de un resultado alcance a ejecutarse antes.
function closeLater(): void {
  window.setTimeout(() => (open.value = false), 200);
}

onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <div v-if="pos.customer" class="pk-customer">
    <div class="pk-customer__name">
      <i class="mdi mdi-account-outline" />
      <span class="pk-truncate">{{ pos.customer.name }}</span>
    </div>
    <button type="button" :aria-label="$t('pos.customer.remove')" @click="pos.setCustomer(null)"><i class="mdi mdi-close" /></button>
  </div>
  <div v-else class="pk-finder">
    <input
      v-model="text"
      type="text"
      class="pk-input pk-input--sm"
      autocomplete="off"
      :placeholder="$t('pos.customer.placeholder')"
      :aria-label="$t('pos.customer.label')"
      @focus="open = results.length > 0"
      @blur="closeLater"
    />
    <div v-if="open" class="pk-dropdown">
      <button v-for="c in results" :key="c.id" type="button" @mousedown.prevent="select(c)">
        <span :style="{ fontWeight: 500 }">{{ c.name }}</span>
        <span v-if="c.identification" class="pk-muted-70"> · {{ c.identification }}</span>
      </button>
    </div>
    <p v-if="searching" class="pk-hint">{{ $t('pos.customer.searching') }}</p>
    <p v-else class="pk-hint">{{ $t('pos.customer.final') }}</p>
  </div>
</template>
