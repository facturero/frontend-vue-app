<script lang="ts">
import { defineComponent, h, type PropType, type VNodeChild } from 'vue';
import type { RichDoc } from '@/types/projects';

/**
 * Muestra un documento de TipTap ya guardado SIN `v-html` ni el editor: recorre el documento y arma los elementos con Vue, así el
 * texto siempre se escapa y un nodo desconocido simplemente no se pinta. Pesa mucho menos que montar un editor por comentario.
 */
const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

function marks(node: RichDoc, child: VNodeChild): VNodeChild {
  let out = child;
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') out = h('strong', null, [out]);
    else if (mark.type === 'italic') out = h('em', null, [out]);
    else if (mark.type === 'strike') out = h('s', null, [out]);
    else if (mark.type === 'code') out = h('code', null, [out]);
    else if (mark.type === 'link') {
      const href = String(mark.attrs?.href ?? '');
      out = SAFE_LINK.test(href) ? h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, [out]) : out;
    }
  }
  return out;
}

function render(node: RichDoc, key: number): VNodeChild {
  const kids = () => (node.content ?? []).map((c, i) => render(c, i));
  switch (node.type) {
    case 'doc':
      return h('div', { key }, kids());
    case 'paragraph':
      return h('p', { key, class: 'mb-1' }, kids());
    case 'text':
      return marks(node, node.text ?? '');
    case 'hardBreak':
      return h('br', { key });
    case 'mention':
      return h('span', { key, class: 'text-primary font-weight-medium' }, `@${String(node.attrs?.label ?? '')}`);
    case 'bulletList':
      return h('ul', { key, class: 'pl-5 mb-1' }, kids());
    case 'orderedList':
      return h('ol', { key, class: 'pl-5 mb-1' }, kids());
    case 'listItem':
      return h('li', { key }, kids());
    case 'blockquote':
      return h('blockquote', { key, class: 'pl-3 border-s-md text-medium-emphasis mb-1' }, kids());
    case 'codeBlock':
      return h('pre', { key, class: 'bg-surface-variant pa-2 rounded mb-1 text-body-medium' }, kids());
    default:
      return null;
  }
}

export default defineComponent({
  name: 'RichTextView',
  props: { doc: { type: Object as PropType<RichDoc | null>, default: null } },
  setup(props) {
    return () => (props.doc ? render(props.doc, 0) : null);
  },
});
</script>
