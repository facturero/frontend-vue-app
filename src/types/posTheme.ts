/**
 * Contrato del tema del POS en el cliente. Es una COPIA deliberada de
 * `backend/organization-service/src/domain/pos-theme.ts`: el CRM es un consumidor
 * más de ese contrato y no puede importarlo (el servicio es un repo aparte, sin
 * paquete compartido). Si cambia un token, hay que cambiarlo en los dos sitios;
 * el test de este fichero es el que avisa si se han desincronizado.
 *
 * El tema es solo datos: nunca CSS, HTML ni JS. La caja es un kiosko que puede
 * tener a un tercero escribiéndole en la pantalla, y el POS se actualiza por
 * separado del CRM, así que el cliente valida cada campo por su cuenta y nunca
 * confía en que el servidor le mande algo que ya conoce.
 */

export const POS_THEME_SCHEMA_VERSION = 1;

/** Tope de negocio. El servidor lo comprueba aparte, pero el editor avisa antes
 * de gastar un round-trip en un rechazo previsible. */
export const POS_THEME_CONFIG_MAX_BYTES = 8192;

/** Nombre que se muestra cuando el punto cae al tema integrado del POS. */
export const POS_THEME_BUILTIN_NAME = 'POS KIOSKO';

export const POS_THEME_MODES = ['light', 'dark', 'schedule'] as const;
export const POS_THEME_FONT_FAMILIES = [
  'system',
  'inter',
  'roboto',
  'poppins',
  'nunito',
  'montserrat',
  'source-sans',
  'jetbrains-mono',
] as const;
export const POS_THEME_RADII = ['none', 'sm', 'md', 'lg', 'xl'] as const;
export const POS_THEME_DENSITIES = ['compact', 'comfortable', 'spacious'] as const;
export const POS_THEME_HEADING_WEIGHTS = [500, 600, 700] as const;
export const POS_THEME_BORDER_WIDTHS = [0, 1, 2] as const;
export const POS_THEME_CART_POSITIONS = ['left', 'right'] as const;
export const POS_THEME_CART_WIDTHS = ['narrow', 'normal', 'wide'] as const;
export const POS_THEME_PRODUCT_CARDS = ['image-top', 'image-left', 'text-only', 'compact'] as const;
export const POS_THEME_CATEGORIES_PLACEMENTS = ['top', 'left', 'hidden'] as const;
export const POS_THEME_STATUS_BAR_POSITIONS = ['top', 'bottom'] as const;
export const POS_THEME_LOGO_POSITIONS = ['left', 'right'] as const;
export const POS_THEME_LOGO_SIZES = ['sm', 'md', 'lg'] as const;

/** Imágenes de marca (logotipo y fondo del acceso). Un SVG entra porque la caja
 * lo dibuja siempre con `<img>`, donde no ejecuta scripts. */
export const POS_THEME_IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;
export const POS_THEME_IMAGE_MAX_MB = 1;
export const POS_THEME_LOGIN_BACKGROUND_MAX_MB = 3;
/** Alto del logotipo en la caja, en px, según `logoSize`. */
export const POS_THEME_LOGO_HEIGHT_PX: Record<PosThemeLogoSize, number> = { sm: 24, md: 32, lg: 44 };

export type PosThemeMode = (typeof POS_THEME_MODES)[number];
export type PosThemeFontFamily = (typeof POS_THEME_FONT_FAMILIES)[number];
export type PosThemeRadius = (typeof POS_THEME_RADII)[number];
export type PosThemeDensity = (typeof POS_THEME_DENSITIES)[number];
export type PosThemeHeadingWeight = (typeof POS_THEME_HEADING_WEIGHTS)[number];
export type PosThemeBorderWidth = (typeof POS_THEME_BORDER_WIDTHS)[number];
export type PosThemeCartPosition = (typeof POS_THEME_CART_POSITIONS)[number];
export type PosThemeCartWidth = (typeof POS_THEME_CART_WIDTHS)[number];
export type PosThemeProductCard = (typeof POS_THEME_PRODUCT_CARDS)[number];
export type PosThemeCategoriesPlacement = (typeof POS_THEME_CATEGORIES_PLACEMENTS)[number];
export type PosThemeStatusBarPosition = (typeof POS_THEME_STATUS_BAR_POSITIONS)[number];
export type PosThemeLogoPosition = (typeof POS_THEME_LOGO_POSITIONS)[number];
export type PosThemeLogoSize = (typeof POS_THEME_LOGO_SIZES)[number];

export interface PosThemeColors {
  primary: string;
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
}

/** Unión y no un objeto con `type: string`: un fondo con `type: 'image'` y
 * `color` informado no tiene sentido, y con una unión el compilador obliga a que
 * `imageFileId` solo exista en la variante que lo usa. */
export type PosThemeLoginBackground =
  | { type: 'color'; color: string | null; imageFileId: null }
  | { type: 'image'; color: null; imageFileId: string };

export interface PosThemeBranding {
  logoFileId: string | null;
  logoDarkFileId: string | null;
  logoPosition: PosThemeLogoPosition;
  logoSize: PosThemeLogoSize;
  showLogoOnLogin: boolean;
  loginBackground: PosThemeLoginBackground;
  welcomeMessage: string | null;
}

export interface PosThemeConfig {
  schemaVersion: typeof POS_THEME_SCHEMA_VERSION;
  mode: PosThemeMode;
  allowCashierToggle: boolean;
  schedule: { darkFrom: string; darkTo: string };
  colors: { light: PosThemeColors; dark: PosThemeColors };
  typography: {
    fontFamily: PosThemeFontFamily;
    baseSize: number;
    headingWeight: PosThemeHeadingWeight;
  };
  shape: {
    radius: PosThemeRadius;
    density: PosThemeDensity;
    shadows: boolean;
    borderWidth: PosThemeBorderWidth;
  };
  layout: {
    cartPosition: PosThemeCartPosition;
    cartWidth: PosThemeCartWidth;
    catalogColumns: 'auto' | number;
    productCard: PosThemeProductCard;
    categoriesPlacement: PosThemeCategoriesPlacement;
    statusBarPosition: PosThemeStatusBarPosition;
    showProductImages: boolean;
  };
  branding: PosThemeBranding;
}

/* ------------------------------------------------------------------ *
 * DTOs
 * ------------------------------------------------------------------ */

/** Lo que devuelve la lista. Sin `config`: son ~10 KB de JSON por tema y la
 * lista solo enseña una miniatura. El detalle se pide aparte. */
export interface PosThemeSummaryDTO {
  id: string;
  name: string;
  isDefault: boolean;
  version: number;
  updatedAt: string;
  assignedPointsCount: number;
}

export interface PosThemeDTO {
  id: string;
  organizationId: string;
  name: string;
  isDefault: boolean;
  version: number;
  schemaVersion: number;
  config: PosThemeConfig;
  updatedAt: string;
}

export interface CreatePosThemeInput {
  name: string;
  config: PosThemeConfig;
}

/** El PUT es completo (no PATCH): el servidor valida el config entero con
 * lista cerrada, y un PUT parcial dejaría huecos que el POS no sabe rellenar. */
export type UpdatePosThemeInput = CreatePosThemeInput;

export interface AssignPosThemeInput {
  themeId: string | null;
}

/* ------------------------------------------------------------------ *
 * Errores con datos extra
 *
 * OJO: el `errorHandler` de organization-service hace spread de `extra` en la
 * RAÍZ del body (`{ code, message, ...extra }`), no dentro de un `extra`. Por eso
 * aquí se leen como `body.pairs` y no `body.extra.pairs`.
 * ------------------------------------------------------------------ */

export interface ContrastPair {
  /** Token del texto, o `on-primary` para el texto derivado sobre el primario. */
  a: string;
  b: string;
  ratio: number;
  min: number;
}

export interface PosThemeErrorBody {
  code?: string;
  message?: string;
  details?: Array<{ field: string; message: string }>;
  /** LOW_CONTRAST: en la RAÍZ del body, no dentro de un `extra`. */
  pairs?: ContrastPair[];
  /** POS_THEME_IN_USE: en la RAÍZ del body. */
  assignedPointsCount?: number;
}

export const CONTRAST_MIN_BLOCKING = 3;
/** El editor avisa por debajo de 4.5 (WCAG AA) pero no bloquea: entre 3 y 4.5 el
 * tema es usable, solo justo. */
export const CONTRAST_MIN_ADVISORY = 4.5;

/* ------------------------------------------------------------------ *
 * Validación de cliente
 * ------------------------------------------------------------------ */

const HEX_RE = /^#[0-9a-f]{6}$/;

/** El servidor solo acepta `#rrggbb` en MINÚSCAS y sin alfa
 * (`/^#[0-9a-f]{6}$/`). Un selector de color o un pegado de pantalla pueden
 * devolver `#5D87FF` o `#5d87ff80`, y ambos son un 422. Normalizar en el borde
 * evita tener que hacerlo en los diez campos. */
export function normalizeHexColor(value: string): string {
  const raw = value.trim().toLowerCase();
  if (!raw.startsWith('#')) return raw;
  const body = raw.slice(1);

  // #rrggbbaa: el alfa no existe en el contrato, se descarta.
  if (body.length === 8) return `#${body.slice(0, 6)}`;
  // #rgb y #rgba: forma corta, se despliega duplicando cada canal.
  if (body.length === 3) return `#${expandShortHex(body)}`;
  if (body.length === 4) return `#${expandShortHex(body.slice(0, 3))}`;
  return raw;
}

function expandShortHex(body: string): string {
  return body[0] + body[0] + body[1] + body[1] + body[2] + body[2];
}

export function isValidHexColor(value: string): boolean {
  return HEX_RE.test(value);
}

export function isValidTimeHHMM(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/* ------------------------------------------------------------------ *
 * Contraste (WCAG 2.1) — espejo de la función del servidor
 *
 * El servidor RECHAZA por debajo de 3. Este espejo solo pinta el aviso mientras se
 * edita, para no gastar un round-trip en cada tecla. Que los dos usen la misma
 * fórmula es lo que hace que el aviso y el rechazo no se contradigan.
 * ------------------------------------------------------------------ */

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  ];
}

/** Luminancia relativa WCAG 2.1. El peso por canal no es simétrico (el verde aporta
 * más que el azul a la percepción de brillo), por eso 0.2126/0.7152/0.0722 y no un
 * promedio plano. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Ratio de contraste entre dos colores, de 1 a 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Texto legible sobre `primary`. No se guarda en el config: el POS lo deriva
 * eligiendo blanco o negro, el que mejor contraste dé, y guardarlo duplicaría
 * un dato que el cliente sabe calcular mejor que el servidor. Mismo criterio que
 * el servidor, para que la vista previa no prometa un contraste distinto del que
 * acaba viendo la caja.
 */
export function pickOnPrimary(primary: string): string {
  return contrastRatio(WHITE, primary) >= contrastRatio(BLACK, primary) ? WHITE : BLACK;
}

const CONTRAST_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['text', 'background'],
  ['text', 'surface'],
  ['textMuted', 'surface'],
];

const WHITE = '#ffffff';
const BLACK = '#000000';

/**
 * Parejas que tienen que leerse, evaluadas en los DOS modos por separado: un tema
 * puede leerse bien de día y ser ilegible de noche, y la caja cambia sola a las
 * 19:00.
 *
 * La cuarta pareja (el texto del botón primario) no la guarda nadie: el POS la
 * deriva eligiendo blanco o negro. El peor caso es el primario en el punto donde
 * ambos empatan, y ahí el ratio es sqrt(21) ≈ 4.58 — con corte 3 nunca puede
 * disparar. Se comprueba igual por si algún día deja de ser blanco/negro.
 */
export function checkContrast(
  config: PosThemeConfig,
  min: number = CONTRAST_MIN_BLOCKING,
): ContrastPair[] {
  const failing: ContrastPair[] = [];

  for (const mode of ['light', 'dark'] as const) {
    const c = config.colors[mode];

    for (const [a, b] of CONTRAST_PAIRS) {
      const ratio = contrastRatio(c[a as keyof PosThemeColors], c[b as keyof PosThemeColors]);
      if (ratio < min) failing.push({ a: `${mode}.${a}`, b: `${mode}.${b}`, ratio, min });
    }

    const best = Math.max(contrastRatio(WHITE, c.primary), contrastRatio(BLACK, c.primary));
    if (best < min) {
      failing.push({ a: `${mode}.on-primary`, b: `${mode}.primary`, ratio: best, min });
    }
  }

  return failing;
}

/* ------------------------------------------------------------------ *
 * Base para el editor
 * ------------------------------------------------------------------ */

// "Clásico" es el aspecto que la caja tiene HOY (paleta gray/blue de Tailwind, la que
// está escrita en sus clases): un cliente que no toca nada ve exactamente lo mismo.
const LIGHT_COLORS: PosThemeColors = {
  primary: '#2563eb',
  background: '#f9fafb',
  surface: '#ffffff',
  surfaceAlt: '#f3f4f6',
  text: '#1f2937',
  textMuted: '#6b7280',
  border: '#e5e7eb',
  success: '#059669',
  warning: '#b45309',
  danger: '#dc2626',
};

const DARK_COLORS: PosThemeColors = {
  primary: '#3b82f6',
  background: '#0f172a',
  surface: '#1e293b',
  surfaceAlt: '#334155',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  border: '#334155',
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#f87171',
};

/** Colores de un tema nuevo y de la pestaña de modo claro. */
export const DEFAULT_LIGHT_COLORS: Readonly<PosThemeColors> = LIGHT_COLORS;

/** Colores de la pestaña de modo oscuro. */
export const DEFAULT_DARK_COLORS: Readonly<PosThemeColors> = DARK_COLORS;

export function defaultPosThemeConfig(): PosThemeConfig {
  return {
    schemaVersion: POS_THEME_SCHEMA_VERSION,
    mode: 'light',
    allowCashierToggle: true,
    schedule: { darkFrom: '19:00', darkTo: '07:00' },
    colors: { light: { ...LIGHT_COLORS }, dark: { ...DARK_COLORS } },
    typography: { fontFamily: 'system', baseSize: 16, headingWeight: 600 },
    shape: { radius: 'lg', density: 'comfortable', shadows: true, borderWidth: 1 },
    layout: {
      cartPosition: 'right',
      cartWidth: 'normal',
      catalogColumns: 'auto',
      productCard: 'image-top',
      categoriesPlacement: 'top',
      statusBarPosition: 'bottom',
      showProductImages: true,
    },
    branding: {
      logoFileId: null,
      logoDarkFileId: null,
      logoPosition: 'left',
      logoSize: 'md',
      showLogoOnLogin: true,
      loginBackground: { type: 'color', color: null, imageFileId: null },
      welcomeMessage: null,
    },
  };
}

export type PosThemePresetKey = 'classic' | 'dark' | 'highContrast' | 'warm';

export interface PosThemePreset {
  key: PosThemePresetKey;
  /** I18n key: la etiqueta vive en los ficheros de idioma, no aquí. */
  titleKey: string;
  build: () => PosThemeConfig;
}

/** Los cuatro puntos de partida. Un tema nuevo nace de uno de ellos en vez de
 * pedir diez colores a alguien que no sabe qué combinar para que se lea. */
export const POS_THEME_PRESETS: readonly PosThemePreset[] = [
  {
    key: 'classic',
    titleKey: 'posThemes.presets.classic',
    build: () => defaultPosThemeConfig(),
  },
  {
    key: 'dark',
    titleKey: 'posThemes.presets.dark',
    build: () => {
      const c = defaultPosThemeConfig();
      c.mode = 'dark';
      return c;
    },
  },
  {
    key: 'highContrast',
    titleKey: 'posThemes.presets.highContrast',
    build: () => {
      const c = defaultPosThemeConfig();
      // Negro sobre blanco es el único par que aguanta una caja a pleno sol con
      // la caja detrás: sube el texto a negro puro y engorda la tipografía.
      c.colors.light.text = '#000000';
      c.colors.light.textMuted = '#3d444e';
      c.typography.baseSize = 18;
      c.typography.headingWeight = 700;
      c.shape.borderWidth = 2;
      return c;
    },
  },
  {
    key: 'warm',
    titleKey: 'posThemes.presets.warm',
    build: () => {
      const c = defaultPosThemeConfig();
      c.colors.light = {
        primary: '#b45309',
        background: '#fffbeb',
        surface: '#ffffff',
        surfaceAlt: '#f5f5f4',
        text: '#292524',
        textMuted: '#78716c',
        border: '#e7e5e4',
        success: '#047857',
        warning: '#b45309',
        danger: '#b91c1c',
      };
      c.colors.dark = {
        primary: '#f59e0b',
        background: '#1c1917',
        surface: '#292524',
        surfaceAlt: '#44403c',
        text: '#fafaf9',
        textMuted: '#a8a29e',
        border: '#44403c',
        success: '#34d399',
        warning: '#fbbf24',
        danger: '#f87171',
      };
      c.typography.fontFamily = 'nunito';
      c.shape.radius = 'xl';
      return c;
    },
  },
];
