// Guardián: todo `mdi-*` escrito en el código debe existir en @mdi/font. Un nombre inventado (p. ej. `mdi-tray-arrow-down-outline`)
// no da error: el icono simplemente no se pinta, y nadie lo nota hasta que alguien lo ve en pantalla.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'node_modules/@mdi/font/css/materialdesignicons.css'), 'utf8');
const valid = new Set([...css.matchAll(/\.mdi-([a-z0-9-]+)::before/g)].map((m) => m[1]));
// Modificadores de tamaño/giro de la propia fuente: no son iconos.
const MODIFIER = /^(spin|flip-h|flip-v|(18|24|36|48)px|rotate-\d+)$/;

const bad = new Map();
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(vue|ts)$/.test(e.name)) {
      for (const m of fs.readFileSync(p, 'utf8').matchAll(/mdi-([a-z0-9-]+)/g)) {
        // `mdi-` + variable (p. ej. `mdi-${x}`) termina en guion: se valida a mano, no aquí.
        if (m[1].endsWith('-') || MODIFIER.test(m[1]) || valid.has(m[1])) continue;
        bad.set(`mdi-${m[1]}`, [...(bad.get(`mdi-${m[1]}`) ?? []), path.relative(root, p)]);
      }
    }
  }
})(path.join(root, 'src'));

if (bad.size) {
  console.error('Iconos que NO existen en @mdi/font (no se pintarían):');
  for (const [name, files] of bad) console.error(`  ${name}  ←  ${[...new Set(files)].join(', ')}`);
  process.exit(1);
}
console.log(`OK — todos los iconos mdi-* del código existen (${valid.size} disponibles).`);
