<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';
import CrmLinkCard from './CrmLinkCard.vue';
import type { CrmEntity } from '@/utils/crm-links';

/** La tarjeta del CRM dentro del editor (TipTap NodeView): se ve como quedará en el mensaje y la ✕ la quita del texto. */
const props = defineProps(nodeViewProps);
</script>

<template>
  <NodeViewWrapper>
    <CrmLinkCard
      :entity-type="props.node.attrs.entityType as CrmEntity"
      :entity-id="String(props.node.attrs.entityId ?? '')"
      :label="String(props.node.attrs.label ?? '')"
      :selected="props.selected"
      :removable="props.editor.isEditable"
      @remove="props.deleteNode()"
    />
  </NodeViewWrapper>
</template>
