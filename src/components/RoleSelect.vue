<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoleStore } from '@/stores/roles';

const props = defineProps<{
  modelValue: string | string[] | null;
  multiple?: boolean;
  excludeSystem?: boolean;
  disabled?: boolean;
  label?: string;
  hideAdmin?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string | string[] | null];
}>();

const rolesStore = useRoleStore();

const items = computed(() => {
  let roles = rolesStore.list;
  if (props.excludeSystem) {
    roles = roles.filter((r) => !r.isSystem);
  }
  if (props.hideAdmin) {
    roles = roles.filter((r) => r.name !== 'Administrador');
  }
  return roles;
});

onMounted(() => {
  if (rolesStore.list.length === 0) {
    rolesStore.fetch();
  }
});
</script>

<template>
  <v-select
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :items="items"
    item-title="name"
    item-value="id"
    :item-disabled="(item: any) => item.name === 'Administrador'"
    :multiple="multiple ?? false"
    :disabled="disabled ?? false"
    :label="label ?? 'Roles'"
    variant="outlined"
    density="compact"
    hide-details="auto"
    chips
    closable-chips
    clearable
    no-data-text="No hay roles disponibles"
  />
</template>
