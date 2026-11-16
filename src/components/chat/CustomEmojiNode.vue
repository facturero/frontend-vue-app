<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';
import CustomEmoji from './CustomEmoji.vue';

/** Un emoji personalizado dentro del editor (TipTap NodeView): se ve la imagen mientras se escribe, como quedará en el mensaje. */
const props = defineProps(nodeViewProps);
</script>

<template>
  <NodeViewWrapper as="span">
    <CustomEmoji :name="String(props.node.attrs.name ?? '')" />
  </NodeViewWrapper>
</template>
