<script setup lang="ts">
defineProps<{ name: string }>();
</script>

<template>
  <v-chip size="small" color="primary">{{ name }}</v-chip>
</template>
