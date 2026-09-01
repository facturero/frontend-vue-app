/**
 * Guardián del sistema de UI (docs/UI-UX.md).
 *
 * Falla si una vista vuelve a decidir por su cuenta algo que ya está definido
 * de forma central. Es una red de seguridad barata: no valida diseño, valida
 * que nadie se salte la fuente de verdad.
 *
 *   npm run lint:ui
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const files = execSync('git ls-files src', { encoding: 'utf8' })
  .trim().split('\n').filter((f) => f.endsWith('.vue'));

/**
 * Props que ya son default global: repetirlas es cómo empieza la divergencia.
 *
 * Se atribuye cada prop a su etiqueta recorriendo hacia atrás hasta la etiqueta
 * de apertura, en vez de con un regex `<tag[^>]*prop`: en este proyecto hay
 * atributos que contienen ">" (funciones flecha, comparaciones) y ese regex se
 * corta antes de tiempo, dejando pasar props redundantes sin avisar.
 */
const FIELD_TAGS = /^v-(text-field|textarea|select|autocomplete|combobox|file-input)$/;

const REDUNDANT_BY_TAG = {
  __fields__: {
    'variant="outlined"': 'variant="outlined" ya es el default de los campos',
    'density="compact"': 'density="compact" ya es el default de los campos',
    'hide-details="auto"': 'hide-details="auto" ya es el default de los campos',
  },
  'v-alert': {
    'variant="tonal"': 'variant="tonal" ya es el default de v-alert',
    'density="compact"': 'density="compact" ya es el default de v-alert',
  },
  'v-card': {
    'elevation="2"': 'elevation="2" ya es el default de v-card',
    'rounded="lg"': 'rounded="lg" ya es el default de v-card',
  },
  'v-chip': { 'variant="tonal"': 'variant="tonal" ya es el default de v-chip' },
};

/** Etiqueta de apertura que contiene la línea `i`. */
function owningTag(lines, i) {
  for (let j = i; j >= 0; j--) {
    const m = lines[j].match(/<(v-[a-z-]+)/);
    if (m) return m[1];
  }
  return null;
}

/**
 * Excepciones conocidas y aceptadas. Cada una lleva su motivo: la idea es que
 * una excepción sea una decisión visible, no algo que se cuela sin que nadie
 * lo note. Si una entra aquí "temporalmente", que quede dicho.
 */
const EXCEPTIONS = {
  // Las pantallas de autenticación no viven dentro del shell de la app: no
  // tienen encabezado de página, sino una portada con su propio título.
  'src/views/AuthView.vue': ['titulo'],
  'src/views/AcceptInviteView.vue': ['titulo'],
  'src/views/ResetPasswordView.vue': ['titulo'],

  // PENDIENTE DE DECISIÓN: el formulario de factura es un diseño propio
  // (tipografía, rejilla y paleta a medida) hecho a mano. Convertirlo al
  // sistema cambiaría cómo se ve una pantalla clave, así que hay que decidirlo
  // antes de tocarlo. Mientras tanto queda documentado aquí y no en silencio.
  'src/views/invoices/InvoiceFormView.vue': ['titulo', 'estilo', 'color', 'media'],
};

const problems = [];

function add(file, line, kind, msg) {
  if (EXCEPTIONS[file]?.includes(kind)) return;
  problems.push(`${file}:${line}  ${msg}`);
}

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const isView = file.startsWith('src/views/');

  lines.forEach((line, i) => {
    const n = i + 1;

    // 1. Props que ya son default global
    const tag = owningTag(lines, i);
    if (tag) {
      const rules = {
        ...(FIELD_TAGS.test(tag) ? REDUNDANT_BY_TAG.__fields__ : {}),
        ...(REDUNDANT_BY_TAG[tag] ?? {}),
      };
      for (const [prop, msg] of Object.entries(rules)) {
        if (line.includes(prop)) add(file, n, 'prop', msg);
      }
    }

    // 2. Título de página escrito a mano en lugar de <PageHeader>
    if (isView && /<h[12]\b[^>]*class="[^"]*text-h[1-6]/.test(line)) {
      add(file, n, 'titulo', 'título de página a mano: usa <PageHeader :title="…" />');
    }

    // 3. Colores fijos
    if (/(?:color|background|border)[^:\n]*:\s*#[0-9a-fA-F]{3,8}\b/.test(line)
      || /\b(?:color|bg-color)="#[0-9a-fA-F]{3,8}"/.test(line)) {
      add(file, n, 'color', 'color fijo: usa un token del tema en src/plugins/vuetify.ts');
    }

    // 4. Media queries propias
    if (/@media\b/.test(line)) {
      add(file, n, 'media', 'media query propia: usa las variantes responsivas de Vuetify (d-lg-flex, h-lg-screen…)');
    }
  });

  // 5. <style> en una vista
  if (isView && /<style\b/.test(src)) {
    add(file, src.split('\n').findIndex((l) => /<style\b/.test(l)) + 1, 'estilo',
      '<style> en una vista: casi siempre hay una utilidad o prop de Vuetify que lo cubre');
  }
}

if (problems.length === 0) {
  console.log(`OK — ${files.length} componentes respetan el sistema de UI.`);
  process.exit(0);
}

console.error(`\nDesviaciones del sistema de UI (docs/UI-UX.md): ${problems.length}\n`);
console.error(problems.join('\n'));
console.error('\nCada una es una vista decidiendo por su cuenta algo que ya está definido de forma central.\n');
process.exit(1);
