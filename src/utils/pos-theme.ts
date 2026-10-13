import { defaultPosThemeConfig, type PosThemeColors, type PosThemeConfig } from '@/types/posTheme';

/**
 * El tema de la caja web, calculado igual que en la caja de escritorio (`pos/frontend/src/theme/theme.ts`): las mismas escalas de
 * radio y densidad, la misma derivación de los tonos «suaves» y de «hover», el mismo texto blanco/negro sobre el primario. Es lo que
 * hace que la caja del navegador se vea idéntica a la instalada con el tema de la organización.
 *
 * El tema es solo DATOS: nunca se inyecta CSS ni HTML que venga del CRM. A `style` solo llegan números y colores que pasaron por
 * `parseHex`.
 */

export type PosMode = 'light' | 'dark';
type Rgb = [number, number, number];

export function parseHex(hex: string): Rgb | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [0, 1, 2].map((i) => Math.round(a[i] * (1 - t) + b[i] * t)) as Rgb;
}

// Luminancia relativa (WCAG 2.1) para decidir si el texto sobre un color va en blanco o negro.
function luminance([r, g, b]: Rgb): number {
  const lin = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function pickOn(bg: Rgb): Rgb {
  const l = luminance(bg);
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? WHITE : BLACK;
}

const triplet = ([r, g, b]: Rgb): string => `${r} ${g} ${b}`;

const RADIUS_FACTOR = { none: 0, sm: 0.4, md: 0.75, lg: 1, xl: 1.75 } as const;
const RADIUS_BASE_REM = { sm: 0.125, base: 0.25, md: 0.375, lg: 0.5, xl: 0.75, '2xl': 1 } as const;
const DENSITY_FACTOR = { compact: 0.85, comfortable: 1, spacious: 1.2 } as const;

const FONT_STACKS: Record<PosThemeConfig['typography']['fontFamily'], string> = {
  system: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  inter: '"Inter Variable", "Inter", ui-sans-serif, system-ui, sans-serif',
  roboto: '"Roboto Variable", "Roboto", ui-sans-serif, system-ui, sans-serif',
  poppins: '"Poppins", ui-sans-serif, system-ui, sans-serif',
  nunito: '"Nunito Variable", "Nunito", ui-sans-serif, system-ui, sans-serif',
  montserrat: '"Montserrat Variable", "Montserrat", ui-sans-serif, system-ui, sans-serif',
  'source-sans': '"Source Sans 3 Variable", "Source Sans 3", ui-sans-serif, system-ui, sans-serif',
  'jetbrains-mono': '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
};

const SHADOWS_ON = {
  '--sh-sm': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  '--sh': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  '--sh-md': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  '--sh-lg': '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
} as const;

export type PosThemeVars = Record<string, string>;

/** El tema que manda el CRM, con lo que falte o esté mal formado reemplazado por el integrado («Clásico»). Nunca lanza. */
export function sanitizePosTheme(remote: unknown): PosThemeConfig {
  const base = defaultPosThemeConfig();
  if (!remote || typeof remote !== 'object') return base;
  const r = remote as Partial<PosThemeConfig>;
  const colors = (from: Partial<PosThemeColors> | undefined, fallback: PosThemeColors): PosThemeColors => {
    const out = { ...fallback };
    for (const key of Object.keys(fallback) as Array<keyof PosThemeColors>) {
      const v = from?.[key];
      if (typeof v === 'string' && parseHex(v)) out[key] = v;
    }
    return out;
  };
  return {
    ...base,
    mode: r.mode === 'dark' || r.mode === 'schedule' || r.mode === 'light' ? r.mode : base.mode,
    allowCashierToggle: typeof r.allowCashierToggle === 'boolean' ? r.allowCashierToggle : base.allowCashierToggle,
    schedule: {
      darkFrom: /^\d{2}:\d{2}$/.test(r.schedule?.darkFrom ?? '') ? r.schedule!.darkFrom : base.schedule.darkFrom,
      darkTo: /^\d{2}:\d{2}$/.test(r.schedule?.darkTo ?? '') ? r.schedule!.darkTo : base.schedule.darkTo,
    },
    colors: { light: colors(r.colors?.light, base.colors.light), dark: colors(r.colors?.dark, base.colors.dark) },
    typography: {
      fontFamily: r.typography?.fontFamily && r.typography.fontFamily in FONT_STACKS ? r.typography.fontFamily : base.typography.fontFamily,
      baseSize: Number.isFinite(r.typography?.baseSize) ? Math.min(22, Math.max(12, r.typography!.baseSize)) : base.typography.baseSize,
      headingWeight: [500, 600, 700].includes(r.typography?.headingWeight as number) ? r.typography!.headingWeight : base.typography.headingWeight,
    },
    shape: {
      radius: r.shape?.radius && r.shape.radius in RADIUS_FACTOR ? r.shape.radius : base.shape.radius,
      density: r.shape?.density && r.shape.density in DENSITY_FACTOR ? r.shape.density : base.shape.density,
      shadows: typeof r.shape?.shadows === 'boolean' ? r.shape.shadows : base.shape.shadows,
      borderWidth: [0, 1, 2].includes(r.shape?.borderWidth as number) ? r.shape!.borderWidth : base.shape.borderWidth,
    },
    layout: {
      cartPosition: r.layout?.cartPosition === 'left' ? 'left' : 'right',
      cartWidth: r.layout?.cartWidth === 'narrow' || r.layout?.cartWidth === 'wide' ? r.layout.cartWidth : 'normal',
      catalogColumns:
        typeof r.layout?.catalogColumns === 'number' && r.layout.catalogColumns >= 1 && r.layout.catalogColumns <= 8
          ? Math.round(r.layout.catalogColumns)
          : 'auto',
      productCard:
        r.layout?.productCard === 'image-left' || r.layout?.productCard === 'text-only' || r.layout?.productCard === 'compact'
          ? r.layout.productCard
          : 'image-top',
      categoriesPlacement: r.layout?.categoriesPlacement === 'left' || r.layout?.categoriesPlacement === 'hidden' ? r.layout.categoriesPlacement : 'top',
      statusBarPosition: r.layout?.statusBarPosition === 'top' ? 'top' : 'bottom',
      showProductImages: typeof r.layout?.showProductImages === 'boolean' ? r.layout.showProductImages : base.layout.showProductImages,
    },
    branding: {
      ...base.branding,
      logoFileId: typeof r.branding?.logoFileId === 'string' ? r.branding.logoFileId : null,
      logoDarkFileId: typeof r.branding?.logoDarkFileId === 'string' ? r.branding.logoDarkFileId : null,
      logoPosition: r.branding?.logoPosition === 'right' ? 'right' : 'left',
      logoSize: r.branding?.logoSize === 'sm' || r.branding?.logoSize === 'lg' ? r.branding.logoSize : 'md',
      welcomeMessage: typeof r.branding?.welcomeMessage === 'string' && r.branding.welcomeMessage.trim() ? r.branding.welcomeMessage.slice(0, 120) : null,
    },
  };
}

/** Las variables CSS que consume la pantalla de caja para un modo. Pura (sin `document`). */
export function derivePosVars(config: PosThemeConfig, mode: PosMode): PosThemeVars {
  const c = config.colors[mode];
  const base = defaultPosThemeConfig().colors[mode];
  const rgb = (hex: string, fallback: string): Rgb => parseHex(hex) ?? (parseHex(fallback) as Rgb);

  const surface = rgb(c.surface, base.surface);
  const ink = rgb(c.text, base.text);
  const line = rgb(c.border, base.border);
  const primary = rgb(c.primary, base.primary);
  const success = rgb(c.success, base.success);
  const warning = rgb(c.warning, base.warning);
  const danger = rgb(c.danger, base.danger);
  // En oscuro el «hover» aclara (oscurecer un fondo oscuro no se nota); en claro oscurece.
  const hover = (x: Rgb): Rgb => (mode === 'dark' ? mix(x, WHITE, 0.12) : mix(x, BLACK, 0.12));

  const vars: PosThemeVars = {
    '--c-bg': triplet(rgb(c.background, base.background)),
    '--c-surface': triplet(surface),
    '--c-surface-alt': triplet(rgb(c.surfaceAlt, base.surfaceAlt)),
    '--c-ink': triplet(ink),
    '--c-muted': triplet(rgb(c.textMuted, base.textMuted)),
    '--c-line': triplet(line),
    '--c-line-strong': triplet(mix(line, ink, 0.12)),
    '--c-primary': triplet(primary),
    '--c-primary-hover': triplet(hover(primary)),
    '--c-primary-soft': triplet(mix(surface, primary, 0.1)),
    '--c-on-primary': triplet(pickOn(primary)),
    '--c-success': triplet(success),
    '--c-success-soft': triplet(mix(surface, success, 0.14)),
    '--c-warning': triplet(warning),
    '--c-warning-soft': triplet(mix(surface, warning, 0.14)),
    '--c-danger': triplet(danger),
    '--c-danger-hover': triplet(hover(danger)),
    '--c-danger-soft': triplet(mix(surface, danger, 0.14)),
    '--c-on-danger': triplet(pickOn(danger)),
    '--font-sans': FONT_STACKS[config.typography.fontFamily] ?? FONT_STACKS.system,
    '--font-size': `${config.typography.baseSize}px`,
    '--heading-weight': String(config.typography.headingWeight),
    '--bw': `${config.shape.borderWidth}px`,
    '--dens': String(DENSITY_FACTOR[config.shape.density] ?? 1),
  };

  const k = RADIUS_FACTOR[config.shape.radius] ?? 1;
  for (const [name, rem] of Object.entries(RADIUS_BASE_REM)) vars[`--r-${name}`] = `${(rem * k).toFixed(4)}rem`;

  if (config.shape.shadows) Object.assign(vars, SHADOWS_ON);
  else for (const key of Object.keys(SHADOWS_ON)) vars[key] = '0 0 #0000';

  return vars;
}

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** ¿Toca modo oscuro a esta hora? El tramo puede cruzar la medianoche (19:00 → 07:00). */
export function isDarkBySchedule(schedule: { darkFrom: string; darkTo: string }, now: Date): boolean {
  const from = toMinutes(schedule.darkFrom);
  const to = toMinutes(schedule.darkTo);
  const t = now.getHours() * 60 + now.getMinutes();
  if (from === to) return false;
  return from < to ? t >= from && t < to : t >= from || t < to;
}

/** El modo que se pinta: lo que eligió el cajero (si el tema se lo permite), si no lo que manda el tema (fijo o por horario). */
export function resolvePosMode(config: PosThemeConfig, cashierMode: PosMode | null, now: Date): PosMode {
  if (config.allowCashierToggle && cashierMode) return cashierMode;
  if (config.mode === 'schedule') return isDarkBySchedule(config.schedule, now) ? 'dark' : 'light';
  return config.mode;
}
