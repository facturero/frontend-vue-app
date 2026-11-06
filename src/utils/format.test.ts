import { afterEach, describe, expect, it, vi } from 'vitest';

// plugins/i18n lee el idioma guardado al cargarse; en las pruebas no hay navegador: localStorage en memoria ANTES de los imports.
vi.hoisted(() => {
  const m = new Map<string, string>();
  Object.assign(globalThis, {
    localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v), removeItem: (k: string) => m.delete(k) },
  });
});

import i18n from '@/plugins/i18n';
import { formatDate, formatDateTime, formatMoney, formatNumber } from './format';

const setLocale = (l: string) => {
  const g = i18n.global.locale as unknown as string | { value: string };
  if (typeof g === 'string') (i18n.global as unknown as { locale: string }).locale = l;
  else g.value = l;
};

afterEach(() => setLocale('es'));

describe('formatDate / formatDateTime', () => {
  it('dd/mm/yyyy en cualquier idioma', () => {
    for (const l of ['es', 'en', 'fr']) {
      setLocale(l);
      expect(formatDate('2026-11-06')).toBe('06/11/2026');
    }
  });

  it('una fecha sin hora es el día local, no el anterior (UTC)', () => {
    expect(formatDate('2026-01-01')).toBe('01/01/2026');
  });

  it('una fecha-hora ISO es un instante: se muestra en hora local', () => {
    const local = new Date(2026, 10, 6, 14, 5);
    expect(formatDateTime(local.toISOString())).toBe('06/11/2026 14:05');
    expect(formatDate(local)).toBe('06/11/2026');
  });

  it('vacío o inválido → cadena vacía', () => {
    for (const v of [null, undefined, '', 'mañana', '2026-02-31']) expect(formatDate(v)).toBe('');
  });
});

describe('formatMoney / formatNumber', () => {
  it('centavos con el separador del idioma', () => {
    setLocale('es');
    expect(formatMoney(123450)).toMatch(/1\.?234,50/);
    setLocale('en');
    expect(formatMoney(123450)).toBe('$1,234.50');
  });

  it('sin ceros de relleno en números', () => {
    setLocale('en');
    expect(formatNumber(2.5)).toBe('2.5');
    expect(formatNumber(1234.567)).toBe('1,234.57');
    expect(formatNumber(null)).toBe('');
  });
});
