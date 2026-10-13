<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { customerApi } from '@/api/customers';
import { usePosStore } from '@/stores/pos';
import type { PosCustomer } from '@/types/pos';

/**
 * Cliente de la venta. Vacío = CONSUMIDOR FINAL: no se manda `customerId` y billing-service factura a ese cliente de la
 * organización. Se busca en el servidor al escribir (mínimo 2 letras), igual que en el formulario de facturas del CRM.
 */
const pos = usePosStore();

const found = ref<PosCustomer[]>([]);
const loading = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

// El cliente ya elegido tiene que estar entre las opciones, o el campo no sabe cómo mostrarlo al cerrarse la lista.
const options = computed(() => (pos.customer && !found.value.some((c) => c.id === pos.customer?.id) ? [pos.customer, ...found.value] : found.value));

function label(c: PosCustomer): string {
  return c.identification ? `${c.name} (${c.identification})` : c.name;
}

function onSearch(text: string | null): void {
  clearTimeout(timer);
  if (!text || text.length < 2 || (pos.customer && text === label(pos.customer))) return;
  timer = setTimeout(async () => {
    loading.value = true;
    try {
      const list = await customerApi.list({ search: text, status: 'active' });
      found.value = list.map((c) => ({ id: c.id, name: c.businessName, identification: c.identification }));
    } catch {
      found.value = [];
    } finally {
      loading.value = false;
    }
  }, 250);
}

onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <v-autocomplete
    :model-value="pos.customer"
    :items="options"
    :item-title="label"
    item-value="id"
    return-object
    no-filter
    clearable
    :loading="loading"
    :label="$t('pos.customer.label')"
    :placeholder="$t('pos.customer.final')"
    prepend-inner-icon="mdi-account-outline"
    :no-data-text="$t('pos.customer.hint')"
    @update:search="onSearch"
    @update:model-value="(v: PosCustomer | null) => pos.setCustomer(v)"
  />
</template>
