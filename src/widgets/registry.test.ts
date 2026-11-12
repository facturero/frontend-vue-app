import { describe, expect, it } from 'vitest';
import es from '@/i18n/es.json';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import { clampSize, GRID_COLUMNS, WIDGETS } from './registry';

/** Busca una clave con puntos («widgets.myTasks») en un JSON de traducciones. */
function has(dict: Record<string, unknown>, key: string): boolean {
  let cur: unknown = dict;
  for (const part of key.split('.')) {
    if (!cur || typeof cur !== 'object' || !(part in cur)) return false;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string';
}

describe('catálogo de widgets del tablero', () => {
  it('cada código es único y tiene la forma que acepta el servidor', () => {
    const codes = WIDGETS.map((w) => w.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c).toMatch(/^[a-z0-9_.]{1,60}$/);
  });

  it.each(WIDGETS.map((w) => [w.code, w] as const))('%s: el tamaño inicial está entre su mínimo y su máximo, dentro de la rejilla', (_c, w) => {
    const s = w.size;
    expect(s.minW).toBeGreaterThanOrEqual(1);
    expect(s.minW).toBeLessThanOrEqual(s.w);
    expect(s.w).toBeLessThanOrEqual(s.maxW);
    expect(s.maxW).toBeLessThanOrEqual(GRID_COLUMNS);
    expect(s.minH).toBeGreaterThanOrEqual(1);
    expect(s.minH).toBeLessThanOrEqual(s.h);
    expect(s.h).toBeLessThanOrEqual(s.maxH);
    expect(s.maxH).toBeLessThanOrEqual(20);
  });

  it('cada título (y el texto de lista vacía) existe en es, en y fr', () => {
    const missing: string[] = [];
    for (const w of WIDGETS) {
      for (const key of [w.titleKey, ...(w.kind === 'list' ? [w.emptyKey] : [])]) {
        for (const [lang, dict] of Object.entries({ es, en, fr })) if (!has(dict as Record<string, unknown>, key)) missing.push(`${lang}:${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('un tamaño guardado fuera de los límites se acota al cargar', () => {
    const tasks = WIDGETS.find((w) => w.code === 'projects.my_tasks')!;
    expect(clampSize(tasks, 99, 0)).toEqual({ w: tasks.size.maxW, h: tasks.size.minH });
    expect(clampSize(tasks, 1, 99)).toEqual({ w: tasks.size.minW, h: tasks.size.maxH });
  });
});
