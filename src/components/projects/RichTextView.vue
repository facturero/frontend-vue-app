<script lang="ts">
import { defineComponent, h, type PropType, type VNodeChild } from 'vue';
import type { RichDoc } from '@/types/projects';
import RichImage from './RichImage.vue';

/**
 * Muestra un documento de TipTap ya guardado SIN `v-html` ni el editor: recorre el documento y arma los elementos con Vue, así el
 * texto siempre se escapa y un nodo desconocido simplemente no se pinta. Pesa mucho menos que montar un editor por comentario.
 */
const SAFE_LINK = /^(https?:\/\/|mailto:)/i;
const LONG_LINK = 48;

/**
 * Un enlace pegado tal cual (el texto ES la URL) y largo se muestra corto, «dominio/…/final», para que no ocupe tres líneas; el
 * enlace completo sigue en el `href` y en el `title`. Si la persona le puso un texto, se respeta.
 */
function shortLink(text: string, href: string): string {
  if (text !== href || text.length <= LONG_LINK) return text;
  try {
    const u = new URL(href);
    const last = u.pathname.split('/').filter(Boolean).at(-1) ?? '';
    return `${u.hostname.replace(/^www\./, '')}/…${last ? `/${last.slice(0, 24)}` : ''}`;
  } catch {
    return `${text.slice(0, LONG_LINK)}…`;
  }
}

function marks(node: RichDoc, child: VNodeChild): VNodeChild {
  let out = child;
  const href = String(node.marks?.find((m) => m.type === 'link')?.attrs?.href ?? '');
  if (href && typeof child === 'string') out = shortLink(child, href);
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') out = h('strong', null, [out]);
    else if (mark.type === 'italic') out = h('em', null, [out]);
    else if (mark.type === 'strike') out = h('s', null, [out]);
    else if (mark.type === 'code') out = h('code', null, [out]);
    else if (mark.type === 'link') {
      out = SAFE_LINK.test(href) ? h('a', { href, title: href, target: '_blank', rel: 'noopener noreferrer', class: 'text-primary' }, [out]) : out;
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
    case 'table':
      return h('table', { key, class: 'rich-table mb-2' }, [h('tbody', null, kids())]);
    case 'tableRow':
      return h('tr', { key }, kids());
    case 'tableHeader':
    case 'tableCell': {
      const attrs = node.attrs ?? {};
      const span = (v: unknown) => (typeof v === 'number' && v > 1 ? v : undefined);
      return h(node.type === 'tableHeader' ? 'th' : 'td', { key, colspan: span(attrs.colspan), rowspan: span(attrs.rowspan) }, kids());
    }
    case 'image':
      return typeof node.attrs?.documentId === 'string' ? h(RichImage, { key, documentId: node.attrs.documentId, alt: String(node.attrs.alt ?? '') }) : null;
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

<style>
/* Tablas de descripciones y comentarios: sin estilo propio el navegador las pinta sin bordes y no se leen como tabla. */
.rich-table {
  border-collapse: collapse;
  width: 100%;
  table-layout: fixed;
}
.rich-table th,
.rich-table td {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding: 4px 8px;
  vertical-align: top;
  text-align: left;
}
.rich-table th {
  background: rgb(var(--v-theme-lightprimary));
  font-weight: 500;
}
.rich-table p {
  margin: 0 !important;
}
</style>
