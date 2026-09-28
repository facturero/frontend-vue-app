import { describe, expect, it } from 'vitest';
import {
  CONTRAST_MIN_ADVISORY,
  CONTRAST_MIN_BLOCKING,
  POS_THEME_BORDER_WIDTHS,
  POS_THEME_CART_POSITIONS,
  POS_THEME_CART_WIDTHS,
  POS_THEME_CATEGORIES_PLACEMENTS,
  POS_THEME_CONFIG_MAX_BYTES,
  POS_THEME_DENSITIES,
  POS_THEME_FONT_FAMILIES,
  POS_THEME_HEADING_WEIGHTS,
  POS_THEME_LOGO_POSITIONS,
  POS_THEME_LOGO_SIZES,
  POS_THEME_MODES,
  POS_THEME_PRESETS,
  POS_THEME_PRODUCT_CARDS,
  POS_THEME_RADII,
  POS_THEME_SCHEMA_VERSION,
  POS_THEME_STATUS_BAR_POSITIONS,
  checkContrast,
  contrastRatio,
  defaultPosThemeConfig,
  isValidHexColor,
  isValidTimeHHMM,
  normalizeHexColor,
  pickOnPrimary,
  relativeLuminance,
  type PosThemeConfig,
} from '@/types/posTheme';

/* ------------------------------------------------------------------ *
 * Normalización de colores
 *
 * El servidor acepta `/^#[0-9a-f]{6}$/`: minúsculas y sin alfa. Es lo que
 * impide que un `#5D87FF` o un `#5d87ff80` lleguen al alta y se coman un 422
 * con un mensaje que no explica qué se hacer.
 * ------------------------------------------------------------------ */

describe('normalizeHexColor', () => {
  it('baja a minúsculas', () => {
    expect(normalizeHexColor('#5D87FF')).toBe('#5d87ff');
  });

  it('descarta el alfa', () => {
    expect(normalizeHexColor('#5d87ff80')).toBe('#5d87ff');
  });

  it('expande la forma corta', () => {
    expect(normalizeHexColor('#fff')).toBe('#ffffff');
    expect(normalizeHexColor('#ABC')).toBe('#aabbcc');
  });

  it('recorta espacios', () => {
    expect(normalizeHexColor('  #5D87FF  ')).toBe('#5d87ff');
  });

  it('deja intacto lo que ya es válido', () => {
    expect(normalizeHexColor('#2f6feb')).toBe('#2f6feb');
  });

  it('normaliza a algo que el servidor acepta', () => {
    // El caso que de verdad importa: lo que sale del selector o de un pegado.
    for (const input of ['#5D87FF', '#5d87ff80', '#FFF', '#AbCdEf']) {
      expect(isValidHexColor(normalizeHexColor(input))).toBe(true);
    }
  });
});

describe('isValidHexColor', () => {
  it('rechaza lo que el contrato no admite', () => {
    expect(isValidHexColor('#FFF')).toBe(false); // corta
    expect(isValidHexColor('#5d87ff80')).toBe(false); // con alfa
    expect(isValidHexColor('#5D87FF')).toBe(false); // mayúsculas
    expect(isValidHexColor('5d87ff')).toBe(false); // sin almohadilla
  });
});

/* ------------------------------------------------------------------ *
 * Contraste
 * ------------------------------------------------------------------ */

describe('luminancia y ratio', () => {
  it('la luminancia de blanco es 1 y la de negro 0', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 6);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 6);
  });

  it('blanco sobre negro es 21', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 2);
  });

  it('un color consigo mismo da 1', () => {
    expect(contrastRatio('#2f6feb', '#2f6feb')).toBeCloseTo(1, 6);
  });
});

describe('pickOnPrimary', () => {
  it('elige el color que se lee sobre el primario', () => {
    expect(pickOnPrimary('#000000')).toBe('#ffffff');
    expect(pickOnPrimary('#ffffff')).toBe('#000000');
  });
});

describe('checkContrast', () => {
  it('el config por defecto no falla el corte bloqueante', () => {
    expect(checkContrast(defaultPosThemeConfig(), CONTRAST_MIN_BLOCKING)).toEqual([]);
  });

  it('el config por defecto tampoco falla el aviso de la WCAG', () => {
    expect(checkContrast(defaultPosThemeConfig(), CONTRAST_MIN_ADVISORY)).toEqual([]);
  });

  it('reporta el par cuando el texto no se lee sobre el fondo', () => {
    const config = defaultPosThemeConfig();
    config.colors.light.background = '#ffffff';
    config.colors.light.text = '#fefefe';

    const pairs = checkContrast(config, CONTRAST_MIN_BLOCKING);
    const lightTextOnBackground = pairs.find((p) => p.a === 'light.text' && p.b === 'light.background');
    expect(lightTextOnBackground).toBeDefined();
  });

  it('evalúa los dos modos por separado', () => {
    // Un tema puede leerse de día y ser ilegible de noche: la caja cambia sola
    // de paleta, así que revisar solo la clara dejaría un agujero.
    const config = defaultPosThemeConfig();
    config.colors.dark.background = '#111111';
    config.colors.dark.text = '#121212';

    const pairs = checkContrast(config, CONTRAST_MIN_BLOCKING);
    expect(pairs.some((p) => p.a.startsWith('dark.'))).toBe(true);
  });

  it('el par on-primary no puede disparar con el texto derivado', () => {
    // Eligiendo blanco o negro, el peor caso es el primario donde ambos empatan,
    // y ahí el ratio es sqrt(21) ≈ 4.58. Con corte 3 no puede llegar a fallar.
    // Se deja la pareja como red de seguridad, no como filtro real.
    for (const primary of ['#808080', '#777777', '#7f7f7f']) {
      const config = defaultPosThemeConfig();
      config.colors.light.primary = primary;
      config.colors.dark.primary = primary;
      const pairs = checkContrast(config, CONTRAST_MIN_BLOCKING);
      expect(pairs.filter((p) => p.a.endsWith('on-primary'))).toEqual([]);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Conformidad con el contrato del servidor
 *
 * Estas aserciones reproducen, por otro lado, las reglas del Zod de
 * `backend/organization-service/src/interface/http/validators.ts`. Este fichero
 * es una copia del contrato, no el contrato: si el servidor cambia un límite,
 * el aviso tiene que salir aquí y no en la caja.
 * ------------------------------------------------------------------ */

const COLOR_KEYS = [
  'primary',
  'background',
  'surface',
  'surfaceAlt',
  'text',
  'textMuted',
  'border',
  'success',
  'warning',
  'danger',
] as const;

function everyConfig(): Array<{ label: string; config: PosThemeConfig }> {
  return [
    { label: 'default', config: defaultPosThemeConfig() },
    ...POS_THEME_PRESETS.map((p) => ({ label: `preset:${p.key}`, config: p.build() })),
  ];
}

describe.each(everyConfig())('el contrato se sostiene en $label', ({ config }) => {
  it('declara la versión de esquema esperada', () => {
    expect(config.schemaVersion).toBe(POS_THEME_SCHEMA_VERSION);
  });

  it('los diez colores de los dos modos son #rrggbb en minúsculas', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const key of COLOR_KEYS) {
        expect(isValidHexColor(config.colors[mode][key])).toBe(true);
      }
    }
  });

  it('el tamaño base es un entero entre 14 y 20', () => {
    expect(Number.isInteger(config.typography.baseSize)).toBe(true);
    expect(config.typography.baseSize).toBeGreaterThanOrEqual(14);
    expect(config.typography.baseSize).toBeLessThanOrEqual(20);
  });

  it('el grosor de títulos está en la lista cerrada', () => {
    expect(POS_THEME_HEADING_WEIGHTS).toContain(config.typography.headingWeight);
  });

  it('el grosor de borde es 0, 1 o 2', () => {
    expect(POS_THEME_BORDER_WIDTHS).toContain(config.shape.borderWidth);
  });

  it('las columnas son "auto" o un entero de 2 a 6', () => {
    const cols = config.layout.catalogColumns;
    if (cols !== 'auto') {
      expect(Number.isInteger(cols)).toBe(true);
      expect(cols).toBeGreaterThanOrEqual(2);
      expect(cols).toBeLessThanOrEqual(6);
    }
  });

  it('el horario está en HH:MM', () => {
    expect(isValidTimeHHMM(config.schedule.darkFrom)).toBe(true);
    expect(isValidTimeHHMM(config.schedule.darkTo)).toBe(true);
  });

  it('el mensaje de bienvenida no pasa de 80 caracteres', () => {
    expect(config.branding.welcomeMessage?.length ?? 0).toBeLessThanOrEqual(80);
  });

  it('el fondo de acceso es una de las dos variantes de la unión', () => {
    const bg = config.branding.loginBackground;
    if (bg.type === 'color') {
      expect(bg.imageFileId).toBeNull();
      if (bg.color !== null) expect(isValidHexColor(bg.color)).toBe(true);
    } else {
      expect(bg.color).toBeNull();
      expect(bg.imageFileId).toMatch(/^[0-9a-f-]{36}$/i);
    }
  });

  it('todos los enums salen de su lista cerrada', () => {
    expect(POS_THEME_MODES).toContain(config.mode);
    expect(POS_THEME_FONT_FAMILIES).toContain(config.typography.fontFamily);
    expect(POS_THEME_RADII).toContain(config.shape.radius);
    expect(POS_THEME_DENSITIES).toContain(config.shape.density);
    expect(POS_THEME_CART_POSITIONS).toContain(config.layout.cartPosition);
    expect(POS_THEME_CART_WIDTHS).toContain(config.layout.cartWidth);
    expect(POS_THEME_PRODUCT_CARDS).toContain(config.layout.productCard);
    expect(POS_THEME_CATEGORIES_PLACEMENTS).toContain(config.layout.categoriesPlacement);
    expect(POS_THEME_STATUS_BAR_POSITIONS).toContain(config.layout.statusBarPosition);
    expect(POS_THEME_LOGO_POSITIONS).toContain(config.branding.logoPosition);
    expect(POS_THEME_LOGO_SIZES).toContain(config.branding.logoSize);
  });

  it('cabe en el tope de tamaño del contrato', () => {
    const bytes = new TextEncoder().encode(JSON.stringify(config)).length;
    expect(bytes).toBeLessThan(POS_THEME_CONFIG_MAX_BYTES);
  });

  it('no tiene claves que el servidor no conozca', () => {
    // Lista cerrada en el servidor: un campo de más es un 422. Se comprueba
    // contra las claves que se escriben a mano, que es donde se colaría uno.
    expect(Object.keys(config).sort()).toEqual(
      [
        'schemaVersion',
        'mode',
        'allowCashierToggle',
        'schedule',
        'colors',
        'typography',
        'shape',
        'layout',
        'branding',
      ].sort(),
    );
    expect(Object.keys(config.colors.light).sort()).toEqual([...COLOR_KEYS].sort());
  });
});

describe('los presets son puntos de partida distinguibles', () => {
  it('el oscuro arranca en modo oscuro', () => {
    const dark = POS_THEME_PRESETS.find((p) => p.key === 'dark');
    expect(dark?.build().mode).toBe('dark');
  });

  it('el de alto contraste agranda la tipografía', () => {
    const hc = POS_THEME_PRESETS.find((p) => p.key === 'highContrast');
    const config = hc!.build();
    expect(config.typography.baseSize).toBeGreaterThan(defaultPosThemeConfig().typography.baseSize);
    expect(config.shape.borderWidth).toBe(2);
  });
});
