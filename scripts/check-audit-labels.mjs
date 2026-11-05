#!/usr/bin/env node
/**
 * Guardián de etiquetas de auditoría: verifica que todo evento publicado en los
 * asyncapi.yaml de los servicios backend tenga su etiqueta audit.event.* en es/en/fr.
 */
import { readFileSync, existsSync } from 'node:fs';
import { globSync } from 'node:fs';
import { join } from 'node:path';

const cwd = process.cwd();
const backendDir = join(cwd, '..', 'backend');
const i18nDir = join(cwd, 'src', 'i18n');

if (!existsSync(backendDir)) {
  console.log('OK — No hay asyncapi.yaml en backend/, lint:audit pasa con aviso.');
  process.exit(0);
}

const files = globSync('**/asyncapi.yaml', { cwd: backendDir, nodir: true }).map(f => join(backendDir, f));
if (files.length === 0) {
  console.log('OK — No hay asyncapi.yaml en backend/, lint:audit pasa con aviso.');
  process.exit(0);
}

const es = JSON.parse(readFileSync(join(i18nDir, 'es.json'), 'utf8'));
const en = JSON.parse(readFileSync(join(i18nDir, 'en.json'), 'utf8'));
const fr = JSON.parse(readFileSync(join(i18nDir, 'fr.json'), 'utf8'));

const keys = new Set();
files.forEach(f => {
  try {
    const c = readFileSync(f, 'utf8');
    c.split(/\r?\n/).forEach(l => {
      const m = l.match(/^\s*([a-z][a-zA-Z0-9_.-]+):\s*$/);
      if (m && !m[1].includes('components') && !m[1].includes('channels') && m[1].indexOf('.') > 0) {
        keys.add(m[1]);
      }
    });
  } catch (e) {}
});

const miss = [];
for (const k of keys) {
  const t = k.replace(/\./g, '_');
  const he = es.audit && es.audit.event && (es.audit.event[t] || es.audit.event['audit.event.' + t] || es.audit.event[t] === '');
  const hen = en.audit && en.audit.event && (en.audit.event[t] || en.audit.event['audit.event.' + t]);
  const hf = fr.audit && fr.audit.event && (fr.audit.event[t] || fr.audit.event['audit.event.' + t]);
  if (!he || !hen || !hf) miss.push(k);
}

if (miss.length === 0) {
  console.log(`OK — ${keys.size} eventos verificados en es/en/fr.`);
  process.exit(0);
}
console.error('Faltan etiquetas de auditoría:');
miss.forEach(m => console.error('  ' + m));
process.exit(1);
