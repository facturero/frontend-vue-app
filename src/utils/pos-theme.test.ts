import { describe, expect, it } from 'vitest';
import { defaultPosThemeConfig } from '@/types/posTheme';
import { derivePosVars, isDarkBySchedule, resolvePosMode, sanitizePosTheme } from './pos-theme';

describe('tema de la caja web', () => {
  it('el tema integrado reproduce el aspecto «Clásico» de la caja de escritorio', () => {
    const v = derivePosVars(defaultPosThemeConfig(), 'light');
    expect(v['--c-primary']).toBe('37 99 235');
    expect(v['--c-on-primary']).toBe('255 255 255');
    expect(v['--c-bg']).toBe('249 250 251');
    expect(v['--r-lg']).toBe('0.5000rem');
    expect(v['--dens']).toBe('1');
  });

  it('densidad y radio escalan como en la caja de escritorio', () => {
    const cfg = defaultPosThemeConfig();
    cfg.shape.density = 'compact';
    cfg.shape.radius = 'none';
    const v = derivePosVars(cfg, 'light');
    expect(v['--dens']).toBe('0.85');
    expect(v['--r-lg']).toBe('0.0000rem');
  });

  it('sin sombras, las sombras quedan vacías', () => {
    const cfg = defaultPosThemeConfig();
    cfg.shape.shadows = false;
    expect(derivePosVars(cfg, 'dark')['--sh-md']).toBe('0 0 #0000');
  });

  it('el texto sobre un primario claro va en negro', () => {
    const cfg = defaultPosThemeConfig();
    cfg.colors.light.primary = '#fde047';
    expect(derivePosVars(cfg, 'light')['--c-on-primary']).toBe('0 0 0');
  });

  it('sanea un tema malo: colores, enums y números fuera de rango vuelven al integrado', () => {
    const bad = {
      mode: 'rojo',
      colors: { light: { primary: 'url(javascript:1)', background: '#123456' } },
      typography: { fontFamily: 'comic', baseSize: 900 },
      shape: { radius: 'huge', borderWidth: 9 },
      layout: { catalogColumns: 99, cartWidth: 'x', productCard: '<script>' },
      branding: { welcomeMessage: '   ' },
    };
    const t = sanitizePosTheme(bad);
    const base = defaultPosThemeConfig();
    expect(t.mode).toBe('light');
    expect(t.colors.light.primary).toBe(base.colors.light.primary);
    expect(t.colors.light.background).toBe('#123456');
    expect(t.typography.fontFamily).toBe('system');
    expect(t.typography.baseSize).toBe(22);
    expect(t.shape.radius).toBe('lg');
    expect(t.shape.borderWidth).toBe(1);
    expect(t.layout.catalogColumns).toBe('auto');
    expect(t.layout.cartWidth).toBe('normal');
    expect(t.layout.productCard).toBe('image-top');
    expect(t.branding.welcomeMessage).toBeNull();
  });

  it('sanear null o basura devuelve el tema integrado', () => {
    expect(sanitizePosTheme(null)).toEqual(defaultPosThemeConfig());
    expect(sanitizePosTheme('hola')).toEqual(defaultPosThemeConfig());
  });

  it('el horario oscuro cruza la medianoche', () => {
    const s = { darkFrom: '19:00', darkTo: '07:00' };
    expect(isDarkBySchedule(s, new Date(2026, 9, 12, 23, 30))).toBe(true);
    expect(isDarkBySchedule(s, new Date(2026, 9, 12, 3, 0))).toBe(true);
    expect(isDarkBySchedule(s, new Date(2026, 9, 12, 12, 0))).toBe(false);
  });

  it('lo que elige el cajero manda solo si el tema se lo permite', () => {
    const cfg = defaultPosThemeConfig();
    cfg.mode = 'dark';
    const noon = new Date(2026, 9, 12, 12, 0);
    expect(resolvePosMode(cfg, 'light', noon)).toBe('light');
    cfg.allowCashierToggle = false;
    expect(resolvePosMode(cfg, 'light', noon)).toBe('dark');
  });
});
