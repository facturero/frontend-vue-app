<script setup lang="ts">
/**
 * Selector de establecimiento de las pantallas del restaurante. Una organización
 * suele tener uno solo: la vista lo oculta en ese caso y no se menciona.
 */
import { computed } from 'vue';
import { useOrganizationStore } from '@/stores/organization';

defineProps<{ modelValue: string | null }>();
const emit = defineEmits<{ 'update:modelValue': [string] }>();

const organization = useOrganizationStore();

const items = computed(() =>
  organization.establishments
    .filter((e) => e.status === 'active')
    .map((e) => ({ title: `${e.code} — ${e.name}`, value: e.id })),
);
</script>

<template>
  <v-select
    :model-value="modelValue"
    :items="items"
    :label="$t('restaurant.establishment')"
    class="mb-4"
    style="max-width: 360px"
    data-testid="restaurant-establishment"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
