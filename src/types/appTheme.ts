import { contrastRatio, isValidHexColor } from '@/types/posTheme';

/**
 * Temas de la aplicación web (claro, oscuro y los que crea cada empresa). Ver docs/TEMAS.md.
 *
 * El contrato se COPIA de organization-service (`src/domain/app-theme.ts`), no se importa: el frontend se despliega aparte. Si
 * cambia un token, cámbialo en los dos sitios. Es solo datos: una base y ocho colores. El resto de la paleta de Vuetify (tonos
 * suaves, bordes, el color del texto encima de cada color) se deriva aquí con `deriveThemeColors`, para que un tema no pueda quedar
 * a medias con un token suelto sin tocar.
 */

export const APP_THEME_SCHEMA_VERSION = 1;
export const APP_THEME_MAX_PER_ORGANIZATION = 20;

export type AppThemeBase = 'light' | 'dark';
export const APP_THEME_COLOR_TOKENS = ['primary', 'secondary', 'background', 'surface', 'text', 'success', 'warning', 'error'] as const;
export type AppThemeColorToken = (typeof APP_THEME_COLOR_TOKENS)[number];
export type AppThemeColors = Record<AppThemeColorToken, string>;

export interface AppThemeConfig {
  schemaVersion: typeof APP_THEME_SCHEMA_VERSION;
  base: AppThemeBase;
  colors: AppThemeColors;
}

export interface AppThemeDTO {
  id: string;
  name: string;
  config: AppThemeConfig;
  createdBy: string | null;
  updatedAt: string;
}

/** `light`, `dark`, `system` (sigue al sistema operativo) o el id de un tema propio. */
export type ThemeRef = string;
export const BUILTIN_THEME_REFS = ['light', 'dark', 'system'] as const;

export interface ThemeSettings {
  defaultTheme: ThemeRef;
  /** Fijado para todos, salvo los administradores de la organización. */
  enforced: boolean;
}

export interface AppThemesState {
  themes: AppThemeDTO[];
  settings: ThemeSettings;
  myChoice: ThemeRef | null;
}

export function isBuiltinRef(ref: string): boolean {
  return (BUILTIN_THEME_REFS as readonly string[]).includes(ref);
}

/* ------------------------------------------------------------------ *
 * Color
 * ------------------------------------------------------------------ */

function toRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`;
}

/** `amount` de `a` y el resto de `b` (0 = todo `b`, 1 = todo `a`). */
export function mix(a: string, b: string, amount: number): string {
  const ca = toRgb(a);
  const cb = toRgb(b);
  return toHex([0, 1, 2].map((i) => ca[i] * amount + cb[i] * (1 - amount)) as [number, number, number]);
}

const WHITE = '#ffffff';
const BLACK = '#000000';

/** Blanco o negro, el que más se lea encima. El servidor hace la misma cuenta al validar el primario. */
export function bestTextOn(hex: string): string {
  return contrastRatio(WHITE, hex) >= contrastRatio(BLACK, hex) ? WHITE : BLACK;
}

/**
 * La paleta completa de Vuetify para un tema: parte de la del tema integrado de su base (claro u oscuro, `src/plugins/vuetify.ts`)
 * y la reescribe desde los ocho colores. Las proporciones de mezcla imitan las de los temas integrados: en claro, los tonos suaves
 * llevan poco color sobre la superficie; en oscuro, algo más, porque sobre fondo oscuro un 12 % no se distingue.
 */
export function deriveThemeColors(config: AppThemeConfig, baseColors: Record<string, string>): Record<string, string> {
  const { primary, secondary, background, surface, text, success, warning, error } = config.colors;
  const dark = config.base === 'dark';
  const tonal = (c: string) => mix(c, surface, dark ? 0.25 : 0.12);
  const info = baseColors.info ?? primary;
  const out: Record<string, string> = {
    ...baseColors,
    primary,
    'primary-darken-1': mix(primary, BLACK, 0.88),
    secondary,
    'secondary-darken-1': mix(secondary, BLACK, 0.88),
    success,
    info,
    warning,
    error,
    lightprimary: tonal(primary),
    lightsecondary: tonal(secondary),
    lightsuccess: tonal(success),
    lightinfo: tonal(info),
    lightwarning: tonal(warning),
    lighterror: tonal(error),
    borderColor: mix(text, surface, dark ? 0.2 : 0.1),
    inputBorder: mix(text, surface, dark ? 0.28 : 0.14),
    hoverColor: mix(text, surface, dark ? 0.1 : 0.04),
    grey100: background,
    grey200: mix(text, background, 0.06),
    background,
    surface,
    'surface-bright': surface,
    'surface-light': mix(text, surface, 0.07),
    'skin-bordered-background': background,
    'skin-bordered-surface': surface,
    'auth-panel': mix(primary, surface, 0.1),
    code: mix(text, surface, 0.05),
    kbd: mix(text, surface, 0.08),
  };
  for (const key of ['primary', 'primary-darken-1', 'secondary', 'secondary-darken-1', 'success', 'info', 'warning', 'error']) {
    out[`on-${key}`] = bestTextOn(out[key]);
  }
  for (const key of ['primary', 'secondary', 'success', 'info', 'warning', 'error']) {
    out[`on-light${key}`] = out[key];
  }
  for (const key of ['background', 'surface', 'surface-light', 'surface-bright', 'skin-bordered-background', 'skin-bordered-surface', 'code', 'kbd']) {
    out[`on-${key}`] = text;
  }
  return out;
}

/** Un tema nuevo empieza con los colores del tema integrado de su base: lo que la persona ve hoy. */
export function configFromBase(base: AppThemeBase, baseColors: Record<string, string>): AppThemeConfig {
  const pick = (k: string, fallback: string) => (isValidHexColor((baseColors[k] ?? '').toLowerCase()) ? baseColors[k].toLowerCase() : fallback);
  return {
    schemaVersion: APP_THEME_SCHEMA_VERSION,
    base,
    colors: {
      primary: pick('primary', '#5d87ff'),
      secondary: pick('secondary', '#49beff'),
      background: pick('background', base === 'dark' ? '#202936' : '#f2f6fa'),
      surface: pick('surface', base === 'dark' ? '#2a3447' : '#ffffff'),
      text: pick('on-surface', base === 'dark' ? '#eaeff4' : '#2a3547'),
      success: pick('success', '#13deb9'),
      warning: pick('warning', '#ffae1f'),
      error: pick('error', '#fa896b'),
    },
  };
}

/** Lo que llega del servidor se revisa antes de pintarlo: un tema roto no puede dejar la aplicación ilegible. */
export function isUsableConfig(config: unknown): config is AppThemeConfig {
  const c = config as AppThemeConfig | null;
  return (
    !!c &&
    (c.base === 'light' || c.base === 'dark') &&
    !!c.colors &&
    APP_THEME_COLOR_TOKENS.every((t) => typeof c.colors[t] === 'string' && isValidHexColor(c.colors[t]))
  );
}

/* ------------------------------------------------------------------ *
 * Contraste (mismas parejas y mínimo que el servidor)
 * ------------------------------------------------------------------ */

export const CONTRAST_MIN_BLOCKING = 3;
export const CONTRAST_MIN_ADVISORY = 4.5;

export interface AppThemeContrastPair {
  a: 'text' | 'on-primary';
  b: 'background' | 'surface' | 'primary';
  ratio: number;
}

export function contrastPairs(config: AppThemeConfig): AppThemeContrastPair[] {
  const { colors } = config;
  const round = (n: number) => Math.round(n * 100) / 100;
  return [
    { a: 'text', b: 'background', ratio: round(contrastRatio(colors.text, colors.background)) },
    { a: 'text', b: 'surface', ratio: round(contrastRatio(colors.text, colors.surface)) },
    { a: 'on-primary', b: 'primary', ratio: round(contrastRatio(bestTextOn(colors.primary), colors.primary)) },
  ];
}
