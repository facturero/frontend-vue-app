/**
 * Compara dos tandas de capturas de e2e/visual (p. ej. v3 contra v4) y las ordena de más a menos cambio.
 *
 *   node e2e/visual/compare.mjs v3 v4
 *
 * Por cada captura con el mismo nombre: porcentaje de píxeles distintos (con tolerancia, para no contar el suavizado de fuentes),
 * si cambió el alto de la página, y una imagen `<antes>-vs-<después>/<combinación>/<archivo>` con la v4 atenuada y lo distinto en
 * rojo. Deja `informe.json` y `informe.md` en esa carpeta. Usa el lector PNG que trae Playwright (`pngjs` dentro de
 * playwright-core): es una API interna, si una versión futura lo mueve, este script es lo único que hay que tocar.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { PNG } = require('playwright-core/lib/utilsBundle');

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env.VISUAL_OUT ?? resolve(here, '../../../.visual'));
const [before = 'v3', after = 'v4'] = process.argv.slice(2);
const OUT = resolve(ROOT, `${before}-vs-${after}`);
/** Diferencia por canal por debajo de la cual dos píxeles cuentan como iguales (antialias, subpíxel). */
const TOLERANCE = 24;

function diff(a, b) {
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const out = new PNG({ width, height });
  let changed = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const inA = x < a.width && y < a.height;
      const inB = x < b.width && y < b.height;
      const ia = (y * a.width + x) * 4;
      const ib = (y * b.width + x) * 4;
      let same = inA && inB;
      if (same) {
        for (let c = 0; c < 3; c++) if (Math.abs(a.data[ia + c] - b.data[ib + c]) > TOLERANCE) same = false;
      }
      if (same) {
        // La v4, atenuada a gris claro: sirve de contexto sin tapar lo rojo.
        const g = 255 - Math.round((255 - (b.data[ib] * 0.3 + b.data[ib + 1] * 0.59 + b.data[ib + 2] * 0.11)) * 0.25);
        out.data[o] = g; out.data[o + 1] = g; out.data[o + 2] = g; out.data[o + 3] = 255;
      } else {
        changed++;
        out.data[o] = 230; out.data[o + 1] = 30; out.data[o + 2] = 30; out.data[o + 3] = 255;
      }
    }
  }
  return { out, ratio: changed / (width * height) };
}

const report = [];
for (const combo of readdirSync(resolve(ROOT, before), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
  const dirA = resolve(ROOT, before, combo);
  const dirB = resolve(ROOT, after, combo);
  if (!existsSync(dirB)) continue;
  mkdirSync(resolve(OUT, combo), { recursive: true });
  for (const file of readdirSync(dirA).filter((f) => f.endsWith('.png'))) {
    if (!existsSync(resolve(dirB, file))) {
      report.push({ combo, file, missing: after });
      continue;
    }
    const a = PNG.sync.read(readFileSync(resolve(dirA, file)));
    const b = PNG.sync.read(readFileSync(resolve(dirB, file)));
    const { out, ratio } = diff(a, b);
    if (ratio > 0) writeFileSync(resolve(OUT, combo, file), PNG.sync.write(out));
    report.push({ combo, file, changedPct: Math.round(ratio * 10000) / 100, heightBefore: a.height, heightAfter: b.height });
  }
}

report.sort((x, y) => (y.changedPct ?? 101) - (x.changedPct ?? 101));
writeFileSync(resolve(OUT, 'informe.json'), JSON.stringify(report, null, 2));
const rows = report.map((r) =>
  r.missing
    ? `| ${r.combo} | ${r.file} | falta en ${r.missing} | |`
    : `| ${r.combo} | ${r.file} | ${r.changedPct} % | ${r.heightBefore === r.heightAfter ? '' : `${r.heightBefore} → ${r.heightAfter} px`} |`,
);
writeFileSync(resolve(OUT, 'informe.md'), `# ${before} contra ${after}\n\n| Combinación | Pantalla | Cambio | Alto |\n|---|---|---|---|\n${rows.join('\n')}\n`);
const same = report.filter((r) => r.changedPct === 0).length;
const small = report.filter((r) => r.changedPct > 0 && r.changedPct < 1).length;
const big = report.filter((r) => r.changedPct >= 1).length;
console.log(`${report.length} comparadas: ${same} idénticas, ${small} con cambio < 1 %, ${big} con cambio ≥ 1 %. Informe: ${OUT}`);
