import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/types/posTheme';
import { existsSync, readFileSync } from 'node:fs';
import { PRESET_THEMES, bestTextOn, builtinNameKey, configFromBase, contrastPairs, deriveThemeColors, isBuiltinRef, isUsableConfig, mix, presetRef, type AppThemeConfig } from './appTheme';
import es from '@/i18n/es.json';

const base = { primary: '#5D87FF', info: '#539BFF', background: '#F2F6FA', surface: '#FFFFFF', 'on-surface': '#2A3547', 'surface-variant': '#424242' };

const ocean: AppThemeConfig = {
  schemaVersion: 1,
  base: 'light',
  colors: { primary: '#0b6e99', secondary: '#14a3c7', background: '#f3f7f9', surface: '#ffffff', text: '#1d2b36', success: '#1a9d6b', warning: '#e0a100', error: '#d64545' },
};

describe('temas de la aplicación', () => {
  it('mezcla en sRGB', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#ffffff');
    expect(mix('#000000', '#ffffff', 1)).toBe('#000000');
    expect(mix('#ff0000', '#0000ff', 0.5)).toBe('#800080');
  });

  it('el texto sobre un color es blanco mientras se lea (3:1); negro solo sobre colores claros', () => {
    expect(bestTextOn('#0b6e99')).toBe('#ffffff');
    // El azul del tema claro: el negro contrasta más, pero el blanco se lee y es el que usa el tema integrado.
    expect(bestTextOn('#5d87ff')).toBe('#ffffff');
    expect(bestTextOn('#ffd54f')).toBe('#000000');
    expect(bestTextOn('#13deb9')).toBe('#000000');
  });

  it('un tema sin tocar (los colores del integrado) da exactamente la paleta del integrado', () => {
    const full = {
      ...base, secondary: '#49BEFF', success: '#13DEB9', warning: '#FFAE1F', error: '#FA896B',
      'on-primary': '#FFFFFF', 'on-secondary': '#FFFFFF', 'on-success': '#FFFFFF', 'on-warning': '#FFFFFF',
      lightprimary: '#ECF2FF', lightsecondary: '#E8F7FF', borderColor: '#E5EAEF', 'on-background': '#2A3547',
    };
    const c = deriveThemeColors(configFromBase('light', full, { separateBackground: false }), full);
    for (const [k, v] of Object.entries(full)) expect(c[k].toLowerCase(), k).toBe(v.toLowerCase());
  });

  it('abrir el editor con los colores del tema claro no cambia el texto sobre el primario', () => {
    const c = deriveThemeColors(configFromBase('light', base), base);
    expect(c['on-primary']).toBe('#ffffff');
  });

  it('deriva la paleta completa desde los ocho colores, sin tokens del integrado colados', () => {
    const c = deriveThemeColors(ocean, base);
    expect(c.primary).toBe('#0b6e99');
    expect(c['on-primary']).toBe('#ffffff');
    expect(c['on-surface']).toBe('#1d2b36');
    expect(c['on-background']).toBe('#1d2b36');
    expect(c['on-lightprimary']).toBe('#0b6e99');
    // El tono suave del primario es claro (casi la superficie) en un tema de base clara.
    expect(contrastRatio(c.lightprimary, '#ffffff')).toBeLessThan(1.4);
    // Lo que el tema no toca (p. ej. surface-variant) se hereda del integrado.
    expect(c['surface-variant']).toBe('#424242');
    // Ningún color quedó del primario del integrado.
    expect(Object.entries(c).filter(([, v]) => v.toLowerCase() === '#5d87ff')).toEqual([]);
  });

  it('en base oscura los tonos suaves llevan más color', () => {
    const dark: AppThemeConfig = { ...ocean, base: 'dark', colors: { ...ocean.colors, background: '#10161c', surface: '#18222b', text: '#e6edf3' } };
    const c = deriveThemeColors(dark, base);
    expect(contrastRatio(c.lightprimary, dark.colors.surface)).toBeGreaterThan(1.2);
    expect(c['on-surface']).toBe('#e6edf3');
  });

  it('un tema nuevo parte de los colores del integrado, en minúsculas', () => {
    const c = configFromBase('light', base);
    expect(c.colors.primary).toBe('#5d87ff');
    expect(c.colors.text).toBe('#2a3547');
    expect(isUsableConfig(c)).toBe(true);
  });

  it('un tema nuevo de base oscura no arranca con fondo y tarjetas iguales', () => {
    const c = configFromBase('dark', { surface: '#2A3447', background: '#2A3447', 'on-surface': '#EAEFF4' });
    expect(c.colors.background).not.toBe(c.colors.surface);
    expect(contrastRatio(c.colors.background, c.colors.surface)).toBeGreaterThan(1.1);
  });

  it('las parejas de contraste son las mismas que valida el servidor', () => {
    expect(contrastPairs(ocean).map((p) => `${p.a}/${p.b}`)).toEqual(['text/background', 'text/surface', 'on-primary/primary']);
    const unreadable = { ...ocean, colors: { ...ocean.colors, text: '#f0f0f0' } };
    expect(contrastPairs(unreadable).filter((p) => p.ratio < 3).map((p) => p.b)).toEqual(['background', 'surface']);
  });

  it('los predefinidos son válidos, se leen bien, tienen nombre en i18n y son integrados', () => {
    expect(PRESET_THEMES.length).toBeGreaterThanOrEqual(7);
    for (const p of PRESET_THEMES) {
      expect(isUsableConfig(p.config), p.id).toBe(true);
      expect(contrastPairs(p.config).filter((c) => c.ratio < 3), p.id).toEqual([]);
      expect(isBuiltinRef(presetRef(p.id))).toBe(true);
      expect((es as { themes: { preset: Record<string, string> } }).themes.preset[p.id], p.id).toBeTruthy();
      expect(builtinNameKey(presetRef(p.id))).toBe(`themes.preset.${p.id}`);
    }
    expect(isBuiltinRef('preset:inventado')).toBe(false);
  });

  // Solo en la carpeta del proyecto completa: el CI del frontend no tiene el repo de organization-service al lado.
  const serverFile = new URL('../../../backend/organization-service/src/domain/app-theme.ts', import.meta.url);
  it.skipIf(!existsSync(serverFile))('los nombres de los predefinidos coinciden con los que acepta el servidor', () => {
    const server = readFileSync(serverFile, 'utf8');
    for (const p of PRESET_THEMES) expect(server.includes(`'preset:${p.id}'`), p.id).toBe(true);
  });

  it('descarta un tema roto que llegue del servidor', () => {
    expect(isUsableConfig({ ...ocean, colors: { ...ocean.colors, primary: 'red' } })).toBe(false);
    expect(isUsableConfig({ ...ocean, base: 'sepia' })).toBe(false);
    expect(isUsableConfig(null)).toBe(false);
  });
});
