import { describe, expect, it } from 'vitest';
import { renderInlineMarkdown, renderMarkdownLite } from './markdown-lite';

const links = (href: string) => (href.startsWith('/') && !href.startsWith('//') ? href : null);

describe('renderMarkdownLite — lo que escribe Qwen', () => {
  it('negrita, cursiva, tachado y código en línea', () => {
    expect(renderInlineMarkdown('**Total**: *aprox.* ~~viejo~~ `OFF-A`')).toBe(
      '<strong>Total</strong>: <em>aprox.</em> <del>viejo</del> <code>OFF-A</code>',
    );
    expect(renderInlineMarkdown('***muy***')).toBe('<strong><em>muy</em></strong>');
    expect(renderInlineMarkdown('__fuerte__ y _suave_')).toBe('<strong>fuerte</strong> y <em>suave</em>');
  });

  it('no inventa cursivas: multiplicaciones, guiones bajos de códigos ni lo que hay dentro de código', () => {
    expect(renderInlineMarkdown('2 * 3 * 4')).toBe('2 * 3 * 4');
    expect(renderInlineMarkdown('codigo_de_producto')).toBe('codigo_de_producto');
    expect(renderInlineMarkdown('`a*b*c`')).toBe('<code>a*b*c</code>');
  });

  it('títulos ## y ### en dos tamaños, con negrita dentro', () => {
    const html = renderMarkdownLite('## Análisis de Cobranza\n### 1. **Priorizar**');
    expect(html).toBe(
      '<p class="md-heading text-title-small">Análisis de Cobranza</p>' +
        '<p class="md-heading md-heading--minor text-body-medium">1. <strong>Priorizar</strong></p>',
    );
  });

  it('separador ---', () => {
    expect(renderMarkdownLite('Uno\n\n---\n\nDos')).toBe('<p>Uno</p><hr class="md-rule"><p>Dos</p>');
  });

  it('párrafos: líneas seguidas en uno, sin huecos por las líneas en blanco de más', () => {
    expect(renderMarkdownLite('**1. Verifica**\nPrimero consulta.\n\n\n\nLuego invita.')).toBe(
      '<p><strong>1. Verifica</strong><br>Primero consulta.</p><p>Luego invita.</p>',
    );
  });

  it('listas con viñetas y anidadas', () => {
    expect(renderMarkdownLite('- Usa:\n  - `email`: el correo\n  - `roleIds`: el rol\n- Fin')).toBe(
      '<ul><li>Usa:<ul><li><code>email</code>: el correo</li><li><code>roleIds</code>: el rol</li></ul></li><li>Fin</li></ul>',
    );
  });

  it('listas numeradas, también con líneas en blanco entre los puntos', () => {
    expect(renderMarkdownLite('1. Administrador\n\n2. Contador')).toBe('<ol><li>Administrador</li><li>Contador</li></ol>');
    expect(renderMarkdownLite('3. Tercero\n4. Cuarto')).toBe('<ol start="3"><li>Tercero</li><li>Cuarto</li></ol>');
  });

  it('cita y bloque de código', () => {
    expect(renderMarkdownLite('> Ojo\n> con esto')).toBe('<blockquote>Ojo<br>con esto</blockquote>');
    expect(renderMarkdownLite('```\na **b**\n```')).toBe('<pre><code>a **b**</code></pre>');
  });

  it('enlaces: solo los que acepta el resolutor', () => {
    expect(renderMarkdownLite('[facturación](/invoices)', links)).toContain('<a href="/invoices"');
    expect(renderMarkdownLite('[malo](https://evil.example)', links)).toBe('<p>malo</p>');
    expect(renderMarkdownLite('[malo](javascript:alert(1))', links)).not.toContain('<a');
  });

  it('nunca deja pasar HTML del modelo ni de los datos', () => {
    const html = renderMarkdownLite('<img src=x onerror=alert(1)> **<b>hola</b>**\n- <script>x</script>');
    expect(html).not.toMatch(/<img|<script|<b>/);
    expect(html).toContain('&lt;img');
  });

  it('una respuesta real de «¿qué puedes hacer?» se pinta entera, sin asteriscos sueltos', () => {
    const real = [
      'Puedo ayudarte con las siguientes tareas:',
      '',
      '**Consultar datos:**',
      '- Clientes, productos, facturas',
      '- Ventas y estados de cuenta',
      '',
      '*Ventas:*',
      '- "¿Cuánto vendimos en octubre?"',
      '',
      '¿En qué te puedo ayudar hoy?',
    ].join('\n');
    const html = renderMarkdownLite(real);
    expect(html).not.toContain('*');
    expect(html).toContain('<em>Ventas:</em>');
    expect(html).toContain('<strong>Consultar datos:</strong>');
  });
});
