/**
 * Guardián del sistema de UI (docs/UI-UX.md).
 *
 * Falla si una vista vuelve a decidir por su cuenta algo que ya está definido
 * de forma central. Es una red de seguridad barata: no valida diseño, valida
 * que nadie se salte la fuente de verdad.
 *
 *   npm run lint:ui
 */
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// También los archivos nuevos que aún no están en git (antes no se revisaban hasta añadirlos) y sin los ya borrados del disco
// (antes un componente borrado y sin confirmar hacía fallar al guardián con ENOENT).
const files = execSync('git ls-files --cached --others --exclude-standard src', { encoding: 'utf8' })
  .trim().split('\n').filter((f) => f.endsWith('.vue') && existsSync(f));

/**
 * Props que ya son default global: repetirlas es cómo empieza la divergencia.
 *
 * Se atribuye cada prop a su etiqueta recorriendo hacia atrás hasta la etiqueta
 * de apertura, en vez de con un regex `<tag[^>]*prop`: en este proyecto hay
 * atributos que contienen ">" (funciones flecha, comparaciones) y ese regex se
 * corta antes de tiempo, dejando pasar props redundantes sin avisar.
 */
const FIELD_TAGS = /^v-(text-field|textarea|select|autocomplete|combobox|file-input|date-input|number-input)$/;

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
  'src/views/AuthView.vue': ['titulo', 'ancho'],
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
    if (isView && /<h[12]\b[^>]*class="[^"]*text-(?:h[1-6]|display-|headline-|title-)/.test(line)) {
      add(file, n, 'titulo', 'título de página a mano: usa <PageHeader :title="…" />');
    }

    // 2b. Tipografía de Vuetify 3. En la 4 (Material Design 3) esas clases ya no existen: el texto sale sin estilo y nadie se entera.
    const md2 = line.match(/\btext-(?:(?:sm|md|lg|xl|xxl)-)?(h[1-6]|subtitle-[12]|body-[12]|caption|overline|button)\b/);
    if (md2) {
      const MD3 = {
        h5: 'headline-small', h6: 'title-large', 'subtitle-1': 'body-large', 'body-1': 'body-large', 'subtitle-2': 'title-small',
        'body-2': 'body-medium', caption: 'body-small', button: 'label-large', overline: 'label-medium',
      };
      const hint = MD3[md2[1]] ? `, usa text-${MD3[md2[1]]}` : '';
      add(file, n, 'tipografia', `clase de Vuetify 3 text-${md2[1]}: no existe en Vuetify 4${hint} (docs/UI-UX.md §5)`);
    }

    // 2c. Fecha con el control del navegador: su idioma y sus colores son los del sistema operativo, no los del CRM.
    //     Desde el 2026-11-06 ninguna pantalla lo usa: sin excepciones.
    if (/\btype="date"/.test(line) && !/^\s*(\*|\/\/|<!--)/.test(line)) {
      add(file, n, 'fecha', 'type="date" dibuja el calendario del navegador: usa <DateField> (components/ui/DateField.vue, UI-UX.md §1)');
    }

    // 2d. Avisos: un solo snackbar, el de App.vue (useNotify). Desde el 2026-11-06 no queda ninguno más: sin excepciones.
    if (/<v-snackbar\b(?!-queue)/.test(line) && file !== 'src/App.vue') {
      add(file, n, 'aviso', '<v-snackbar> propio: usa notify.success/error/undoable (composable/useNotify.ts, REGLAS-FRONT.md R-31)');
    }

    // 2e. Confirmaciones: nunca window.confirm (no sigue tema ni idioma). Un `confirm(` suelto es el del navegador salvo que el
    //     archivo tenga el suyo: el de useConfirm, o una función propia que se llama así (la caja: «confirmar el cobro»).
    const ownConfirm = src.includes('useConfirm') || /function confirm\(|const confirm\s*=/.test(src);
    if (/window\.confirm\(/.test(line) || (/(^|[^.\w])confirm\(/.test(line) && !ownConfirm)) {
      add(file, n, 'confirmar', 'confirm() del navegador: usa useConfirm() (composable/useConfirm.ts, REGLAS-FRONT.md R-22)');
    }

    // 2f. Botones con borde (REGLAS-FRONT R-10): compiten con los campos, que son `outlined`. `v-btn-toggle` sí puede: es un grupo.
    if (/<v-btn(?!-)[^>]*variant="outlined"/.test(line)) {
      add(file, n, 'boton', 'v-btn variant="outlined": usa tonal (alternar, navegar: «Hoy») o text (secundaria) — REGLAS-FRONT R-10');
    }

    // 3. Colores fijos
    if (/(?:color|background|border)[^:\n]*:\s*#[0-9a-fA-F]{3,8}\b/.test(line)
      || /\b(?:color|bg-color)="#[0-9a-fA-F]{3,8}"/.test(line)) {
      add(file, n, 'color', 'color fijo: usa un token del tema en src/plugins/vuetify.ts');
    }

    // 5. Tope de ancho de página. La app ocupa el 100 % del ancho (el único tope, para monitores grandes, vive en App.vue):
    //    una vista que se limita a 960 px, o que mete su contenido en una columna `md="8" lg="6"`, deja franjas vacías en una laptop.
    //    Se miran valores de 500 px o más (los diálogos y campos sueltos son más angostos) y se salta `v-dialog`.
    const cap = line.match(/max-width(?:="|=|:)\s*:?['"]?\s*(\d+)/);
    // Un párrafo con tope es la medida de lectura del texto (no del ancho de la página): no cuenta.
    if (isView && cap && Number(cap[1]) >= 500 && tag !== 'v-dialog' && !/<p[\s>]/.test(line)) {
      add(file, n, 'ancho', `max-width de ${cap[1]} px en una vista: la página va al 100 % (el tope está en App.vue, APP_MAX_WIDTH)`);
    }
    if (isView && /<v-col[^>]*md="(?:7|8|9|10|11)"[^>]*(?:lg|xl)="\d+"/.test(line)) {
      add(file, n, 'ancho', 'columna que se angosta en pantallas grandes (md + lg): usa cols="12" para que ocupe todo el ancho');
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

  // 6. Acción principal de un pie de tarjeta o diálogo. `v-card-actions` pone a sus botones en `variant="text"` POR ENCIMA de los
  //    defaults globales (no se puede cambiar en vuetify.ts), así que el botón con color —la acción principal— debe decir
  //    `variant="flat"` o saldría como un enlace (REGLAS-FRONT.md R-10, R-21). Se recorre la etiqueta entera: suele ocupar varias líneas.
  for (let a = src.indexOf('<v-card-actions'); a >= 0; a = src.indexOf('<v-card-actions', a + 1)) {
    const end = src.indexOf('</v-card-actions>', a);
    if (end < 0) break;
    for (let k = src.indexOf('<v-btn', a); k >= 0 && k < end; k = src.indexOf('<v-btn', k + 1)) {
      let q = null;
      let e = k + 6;
      for (; e < end; e++) {
        const c = src[e];
        if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '>') break;
      }
      const tag = src.slice(k, e + 1);
      if (/\s:?color=/.test(tag) && !/\svariant=/.test(tag)) {
        add(file, src.slice(0, k).split('\n').length, 'dialogo',
          'botón con color en v-card-actions sin variant: v-card-actions lo pinta como texto; la acción principal lleva variant="flat"');
      }
    }
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
