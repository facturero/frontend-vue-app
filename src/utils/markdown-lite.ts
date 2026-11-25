/**
 * Markdown del asistente a HTML, sin dependencias y sin abrir una vía de inyección.
 *
 * Cubre lo que Qwen escribe de verdad (medido el 2026-11-25 con el banco y con preguntas abiertas como «¿qué puedes
 * hacer?»): títulos `##`/`###`, separadores `---`, negrita, cursiva, tachado, código en línea y en bloque, listas con
 * viñetas, numeradas y anidadas, citas y enlaces. Las tablas y los gráficos los separa antes `parseAssistantBlocks`.
 *
 * Seguridad: el texto viene del modelo, y el modelo lee datos de clientes y productos. Todo se escapa ANTES de convertir
 * nada, y las únicas etiquetas que salen son las que escribe este archivo. Los enlaces solo se vuelven clicables si
 * `resolveLink` los acepta (rutas internas que existen en el router); si no, queda el texto.
 */

/** Devuelve el `href` (sin escapar) si la ruta es segura y existe; `null` para dejarla como texto. */
export type LinkResolver = (href: string) => string | null;

const noLinks: LinkResolver = () => null;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Formato en línea sobre texto YA escapado. El código va primero y se aparta en marcadores para que nada de dentro se
 * interprete (un `*` en `a*b` no es cursiva).
 */
function inline(escaped: string, resolveLink: LinkResolver): string {
  const codes: string[] = [];
  let s = escaped.replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });

  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
    // El texto ya viene escapado: `&` llega como `&amp;` (p. ej. en `?tab=x&y=z`).
    const target = resolveLink(href.replace(/&amp;/g, '&'));
    if (!target) return label;
    return `<a href="${escapeHtml(target)}" class="text-primary font-weight-medium text-decoration-underline" data-internal-link>${label}</a>`;
  });

  s = s
    .replace(/\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w])__(?=\S)(.+?)(?<=\S)__(?!\w)/g, '$1<strong>$2</strong>')
    // Cursiva con un asterisco: no puede pegarse a otro `*` ni ser una viñeta suelta («2 * 3»).
    .replace(/(^|[^*\w])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![*\w])/g, '$1<em>$2</em>')
    // Con guion bajo solo entre palabras completas: `codigo_producto` no es cursiva.
    .replace(/(^|[^\w])_(?=[^\s_])(.+?)(?<=[^\s_])_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '<del>$1</del>');

  return s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codes[Number(i)]!);
}

/** Formato en línea de una celda de tabla o de un texto suelto. */
export function renderInlineMarkdown(text: string, resolveLink: LinkResolver = noLinks): string {
  return inline(escapeHtml(text), resolveLink);
}

const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const FENCE = /^\s*```/;
const QUOTE = /^\s{0,3}&gt;\s?(.*)$/;
const ITEM = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;

interface ListFrame {
  tag: 'ul' | 'ol';
  indent: number;
}

export function renderMarkdownLite(text: string, resolveLink: LinkResolver = noLinks): string {
  const lines = escapeHtml(text.replace(/\r\n?/g, '\n')).split('\n');
  const html: string[] = [];
  let paragraph: string[] = [];
  const lists: ListFrame[] = [];

  const flushParagraph = () => {
    if (paragraph.length) html.push(`<p>${paragraph.map((l) => inline(l.trim(), resolveLink)).join('<br>')}</p>`);
    paragraph = [];
  };
  const closeListsTo = (depth: number) => {
    while (lists.length > depth) html.push(`</li></${lists.pop()!.tag}>`);
  };
  const closeAll = () => {
    flushParagraph();
    closeListsTo(0);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Código en bloque: va tal cual (ya escapado), sin formato dentro.
    if (FENCE.test(line)) {
      const end = lines.findIndex((l, j) => j > i && FENCE.test(l));
      if (end > i) {
        closeAll();
        html.push(`<pre><code>${lines.slice(i + 1, end).join('\n')}</code></pre>`);
        i = end;
        continue;
      }
    }

    if (line.trim() === '') {
      // Una línea en blanco cierra el párrafo; la lista sigue si lo que viene después es otro elemento (Qwen deja una
      // línea en blanco entre los puntos de una lista numerada).
      flushParagraph();
      const next = lines.slice(i + 1).find((l) => l.trim() !== '');
      if (!next || !ITEM.test(next)) closeListsTo(0);
      continue;
    }

    const item = line.match(ITEM);
    if (item) {
      flushParagraph();
      const indent = item[1]!.replace(/\t/g, '    ').length;
      const tag = /\d/.test(item[2]!) ? 'ol' : 'ul';
      // Sale de las listas más metidas que este elemento.
      while (lists.length && indent < lists[lists.length - 1]!.indent) html.push(`</li></${lists.pop()!.tag}>`);
      const top = lists[lists.length - 1];
      if (!top || indent > top.indent) {
        const start = tag === 'ol' ? parseInt(item[2]!, 10) : 1;
        html.push(tag === 'ol' && start !== 1 ? `<ol start="${start}">` : `<${tag}>`);
        lists.push({ tag, indent });
      } else if (top.tag !== tag) {
        // Mismo nivel, otro tipo de lista: se cierra una y se abre la otra.
        html.push(`</li></${lists.pop()!.tag}><${tag}>`);
        lists.push({ tag, indent });
      } else {
        html.push('</li>');
      }
      html.push(`<li>${inline(item[3]!, resolveLink)}`);
      continue;
    }

    // Una línea con sangría justo debajo de un elemento es la continuación de ese elemento.
    if (lists.length && /^\s{2,}\S/.test(line) && paragraph.length === 0) {
      html.push(`<br>${inline(line.trim(), resolveLink)}`);
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      closeAll();
      // En una burbuja de chat un título grande sobra: dos tamaños, el de `#`/`##` y el del resto.
      const cls = heading[1]!.length <= 2 ? 'md-heading text-title-small' : 'md-heading md-heading--minor text-body-medium';
      html.push(`<p class="${cls}">${inline(heading[2]!, resolveLink)}</p>`);
      continue;
    }

    if (RULE.test(line)) {
      closeAll();
      html.push('<hr class="md-rule">');
      continue;
    }

    const quote = line.match(QUOTE);
    if (quote) {
      closeAll();
      const body = [quote[1]!];
      while (i + 1 < lines.length && QUOTE.test(lines[i + 1]!)) body.push(lines[++i]!.match(QUOTE)![1]!);
      html.push(`<blockquote>${body.map((l) => inline(l, resolveLink)).join('<br>')}</blockquote>`);
      continue;
    }

    closeListsTo(0);
    paragraph.push(line);
  }
  closeAll();
  return html.join('');
}
