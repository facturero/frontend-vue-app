<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';
import RichImage from './RichImage.vue';

/** La imagen dentro del editor (TipTap NodeView): la misma que se ve al leer, marcada cuando está seleccionada para borrarla. */
const props = defineProps(nodeViewProps);
</script>

<template>
  <NodeViewWrapper>
    <RichImage :document-id="String(props.node.attrs.documentId ?? '')" :alt="String(props.node.attrs.alt ?? '')" :selected="props.selected" :clickable="false" />
  </NodeViewWrapper>
</template>
