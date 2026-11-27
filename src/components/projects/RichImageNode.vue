<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';
import RichImage from './RichImage.vue';

/** La imagen dentro del editor (TipTap NodeView): la misma que se ve al leer, marcada cuando está seleccionada y con la «×» para quitarla. */
const props = defineProps(nodeViewProps);
</script>

<template>
  <NodeViewWrapper class="rich-image-node">
    <RichImage
      :document-id="String(props.node.attrs.documentId ?? '')"
      :alt="String(props.node.attrs.alt ?? '')"
      :selected="props.selected"
      :removable="props.editor.isEditable"
      @remove="props.deleteNode()"
    />
  </NodeViewWrapper>
</template>

<style scoped>
/* La imagen es un bloque del documento, pero se pinta en línea: así varias seguidas quedan en fila, igual que al leer. */
.rich-image-node {
  display: inline-block;
  vertical-align: top;
  max-width: 100%;
}
</style>
