<script setup lang="ts">
import { computed } from 'vue';

/**
 * Roles conocidos de la organización -> tonalidad light*.
 * Desconocido/custom cae en `lightsecondary`: es la única decisión aquí y la
 * verás convertida en un chip `variant="flat"` (ver docs/UI-UX.md: los chips
 * sobre tokens light* van flat, no tonal, o el texto quedaría ilegible).
 */
const ROLE_COLORS: Record<string, string> = {
  Administrador: 'lightprimary',
  Supervisor: 'lightinfo',
  Contador: 'lightsuccess',
  Vendedor: 'lightwarning',
  'Solo lectura': 'lightsecondary',
};

const props = defineProps<{ name: string }>();

const color = computed(() => ROLE_COLORS[props.name] ?? 'lightsecondary');
</script>

<template>
  <v-chip size="small" :color="color" variant="flat">{{ name }}</v-chip>
</template>