<script setup lang="ts">
import { computed } from 'vue';
import type { PermissionItem } from '@/types/roles';

const props = defineProps<{
  permissions: PermissionItem[];
  modelValue: string[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string[]];
}>();

const grouped = computed(() => {
  const map = new Map<string, PermissionItem[]>();
  for (const p of props.permissions) {
    const group = map.get(p.resource) ?? [];
    group.push(p);
    map.set(p.resource, group);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
});

function toggle(code: string): void {
  const current = [...props.modelValue];
  const idx = current.indexOf(code);
  if (idx >= 0) {
    current.splice(idx, 1);
  } else {
    current.push(code);
  }
  emit('update:modelValue', current);
}

function toggleResource(resource: string, items: PermissionItem[]): void {
  const codes = items.map((p) => p.code);
  const allSelected = codes.every((c) => props.modelValue.includes(c));
  const current = props.modelValue.filter((c) => !codes.includes(c));
  if (!allSelected) {
    current.push(...codes);
  }
  emit('update:modelValue', current);
}

function resourceSelected(resource: string, items: PermissionItem[]): boolean {
  return items.every((p) => props.modelValue.includes(p.code));
}

function resourceIndeterminate(resource: string, items: PermissionItem[]): boolean {
  const some = items.some((p) => props.modelValue.includes(p.code));
  return some && !resourceSelected(resource, items);
}
</script>

<template>
  <div class="permission-selector">
    <template v-for="[resource, items] in grouped" :key="resource">
      <v-list-item class="px-0" density="compact">
        <template #prepend>
          <v-checkbox-btn
            :model-value="resourceSelected(resource, items)"
            :indeterminate="resourceIndeterminate(resource, items)"
            density="compact"
            hide-details
            @change="toggleResource(resource, items)"
          />
        </template>
        <v-list-item-title class="text-uppercase text-caption font-weight-bold">
          {{ resource }}
        </v-list-item-title>
      </v-list-item>

      <v-list-item
        v-for="p in items"
        :key="p.code"
        class="pl-6 pr-0 py-0"
        density="compact"
      >
        <template #prepend>
          <v-checkbox-btn
            :model-value="modelValue.includes(p.code)"
            density="compact"
            hide-details
            @change="toggle(p.code)"
          />
        </template>
        <v-list-item-title class="text-body-2">
          {{ p.action }}
          <v-chip v-if="p.description" size="x-small" variant="text" class="ml-1 text-caption text-medium-emphasis">
            {{ p.description }}
          </v-chip>
        </v-list-item-title>
      </v-list-item>

      <v-divider v-if="resource !== grouped[grouped.length - 1][0]" class="my-1" />
    </template>
  </div>
</template>
