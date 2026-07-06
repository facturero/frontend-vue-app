<script setup lang="ts">
defineProps<{ name: string }>();
</script>

<template>
  <v-chip size="small" color="primary" variant="tonal">{{ name }}</v-chip>
</template>
