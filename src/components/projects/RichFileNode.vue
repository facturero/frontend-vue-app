<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';
import RichFile from './RichFile.vue';

/** La ficha de un documento dentro del editor (TipTap NodeView): abre el archivo con un clic y la ✕ la quita del texto. */
const props = defineProps(nodeViewProps);
</script>

<template>
  <NodeViewWrapper>
    <RichFile
      :document-id="String(props.node.attrs.documentId ?? '')"
      :name="String(props.node.attrs.name ?? '')"
      :mime-type="String(props.node.attrs.mimeType ?? '')"
      :selected="props.selected"
      :removable="props.editor.isEditable"
      @remove="props.deleteNode()"
    />
  </NodeViewWrapper>
</template>
