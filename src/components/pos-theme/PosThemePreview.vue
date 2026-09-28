<script setup lang="ts">
/**
 * Vista previa del tema tal como lo verá la caja.
 *
 * El guardián de UI (`npm run lint:ui`) no revisa este componente por dos motivos
 * y no es una excepción suya, sino del propio diseño:
 *
 * 1. Los colores de aquí NO son decisiones de diseño del CRM, son DATOS que
 *    escribió el usuario. Van en `:style` porque el componente no puede saberlos
 *    al compilar. Por eso aquí no puede haber ni un hexadecimal escrito a mano.
 * 2. El preview tiene que dibujar una pantalla que no es la del CRM (columnas,
 *    carrito, barra de estado). Se construye con `div` y estilos en línea, no con
 *    `v-card`: los defaults globales de `src/plugins/vuetify.ts` (radio, sombra,
 *    `card-surface`) son de la app y falsearían la única vista que tiene que ser
 *    honesta al 100%.
 *
 * Como no hay hojas de estilo, el responsive sale de las utilidades de Vuetify.
 */
import { computed, ref, watch } from 'vue';
import { fileUrl } from '@/composable/useFileUrl';
import PosBrandMark from '@/components/pos-theme/PosBrandMark.vue';
import {
  POS_THEME_LOGO_HEIGHT_PX,
  pickOnPrimary,
  type PosThemeConfig,
  type PosThemeDensity,
  type PosThemeRadius,
} from '@/types/posTheme';

const props = defineProps<{
  config: PosThemeConfig;
  /** El editor tiene pestañas claro/oscuro: esto fija cuál se dibuja. */
  mode: 'light' | 'dark';
}>();

const c = computed(() => props.config.colors[props.mode]);
const shape = computed(() => props.config.shape);
const layout = computed(() => props.config.layout);
const branding = computed(() => props.config.branding);

/** El tema guarda la clave de la familia, no la pila de fuentes: el POS resuelve
 * la pila en su cliente y así el config no lleva texto que un tercero pueda
 * inyectar. Aquí se resuelve la misma clave para faithfully pintar la vista. */
const FONT_STACKS: Record<string, string> = {
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  inter: '"Inter", system-ui, sans-serif',
  roboto: '"Roboto", system-ui, sans-serif',
  poppins: '"Poppins", system-ui, sans-serif',
  nunito: '"Nunito", system-ui, sans-serif',
  montserrat: '"Montserrat", system-ui, sans-serif',
  'source-sans': '"Source Sans 3", system-ui, sans-serif',
  'jetbrains-mono': '"JetBrains Mono", ui-monospace, monospace',
};

const RADIUS_PX: Record<PosThemeRadius, string> = {
  none: '0px',
  sm: '2px',
  md: '6px',
  lg: '10px',
  xl: '16px',
};

const DENSITY_PX: Record<PosThemeDensity, { gap: string; pad: string; row: string }> = {
  compact: { gap: '6px', pad: '8px', row: '4px' },
  comfortable: { gap: '10px', pad: '12px', row: '6px' },
  spacious: { gap: '14px', pad: '16px', row: '8px' },
};

const CART_WIDTH_PX: Record<string, string> = {
  narrow: '210px',
  normal: '270px',
  wide: '340px',
};

const fontStack = computed(
  () => FONT_STACKS[props.config.typography.fontFamily] ?? FONT_STACKS.system,
);
const radius = computed(() => RADIUS_PX[shape.value.radius]);
const spacing = computed(() => DENSITY_PX[shape.value.density]);
const baseSize = computed(() => `${props.config.typography.baseSize}px`);
const borderWidth = computed(() => `${shape.value.borderWidth}px`);

const cartOnLeft = computed(() => layout.value.cartPosition === 'left');
const showCategories = computed(() => layout.value.categoriesPlacement !== 'hidden');
const categoriesOnTop = computed(() => layout.value.categoriesPlacement === 'top');
const statusOnTop = computed(() => layout.value.statusBarPosition === 'top');
const cartWidth = computed(() => CART_WIDTH_PX[layout.value.cartWidth] ?? CART_WIDTH_PX.normal);

/** 'auto' deja que la rejilla decida; un número fijo la fuerza. Es lo que el
 * contrato permite, y el kiosko a 800x480 no agradece un 'auto' con productos de
 * nombre largo. */
const catalogColumns = computed(() => {
  const cols = layout.value.catalogColumns;
  return typeof cols === 'number' ? `repeat(${cols}, minmax(0, 1fr))` : 'repeat(auto-fill, minmax(120px, 1fr))';
});

const cardTextOnly = computed(() => layout.value.productCard === 'text-only');
const cardCompact = computed(() => layout.value.productCard === 'compact');
const cardImageLeft = computed(() => layout.value.productCard === 'image-left');

/** El texto del botón primario no lo guarda el config: el POS lo deriva
 * eligiendo blanco o negro. Aquí se deriva igual (y con la misma función que el
 * servidor) para que el preview no prometa un contraste que luego no se cumple. */
const onPrimary = computed(() => pickOnPrimary(c.value.primary));

/** Sombra como `box-shadow`: `shadows: false` tiene que verse aquí, no solo en
 * los datos. */
const shadow = computed(() =>
  shape.value.shadows
    ? '0 1px 3px rgba(0, 0, 0, 0.18)'
    : 'none',
);

const DEMO_PRODUCTS = [
  { name: 'Café con leche', price: '2,50' },
  { name: 'Empanada de verde', price: '3,20' },
  { name: 'Agua mineral', price: '1,00' },
  { name: 'Pan de queso', price: '1,80' },
  { name: 'Jugo natural', price: '2,90' },
  { name: 'Croissant', price: '2,20' },
];

const DEMO_CATEGORIES = ['Bebidas', 'Comidas', 'Panadería', 'Aseo'];

const rootStyle = computed(() => ({
  background: c.value.background,
  color: c.value.text,
  fontFamily: fontStack.value,
  fontSize: baseSize.value,
  borderRadius: radius.value,
  border: `${borderWidth.value} solid ${c.value.border}`,
  padding: spacing.value.pad,
  boxShadow: shadow.value,
}));

const surfaceStyle = computed(() => ({
  background: c.value.surface,
  border: `${borderWidth.value} solid ${c.value.border}`,
  borderRadius: radius.value,
  padding: spacing.value.pad,
  boxShadow: shadow.value,
}));

const altSurfaceStyle = computed(() => ({
  background: c.value.surfaceAlt,
  borderRadius: radius.value,
  padding: spacing.value.pad,
}));

const mutedStyle = computed(() => ({
  color: c.value.textMuted,
  fontSize: `calc(${baseSize.value} * 0.8)`,
}));

const headingStyle = computed(() => ({
  color: c.value.text,
  fontWeight: props.config.typography.headingWeight,
  fontSize: `calc(${baseSize.value} * 1.15)`,
  lineHeight: '1.2',
}));

const primaryButtonStyle = computed(() => ({
  background: c.value.primary,
  color: onPrimary.value,
  borderRadius: radius.value,
  padding: `${spacing.value.row} ${spacing.value.pad}`,
  fontWeight: 600,
  fontSize: baseSize.value,
}));

const totalStyle = computed(() => ({
  color: c.value.text,
  fontWeight: 700,
  fontSize: `calc(${baseSize.value} * 1.3)`,
}));

/** La imagen de la empresa que tocaría en este modo: la de modo oscuro si la hay,
 * si no la misma de siempre. Sin ninguna, la caja dibuja el logotipo POS KIOSKO. */
const logoFileId = computed(() =>
  props.mode === 'dark' && branding.value.logoDarkFileId
    ? branding.value.logoDarkFileId
    : branding.value.logoFileId,
);
const logoSrc = computed(() => fileUrl(logoFileId.value));
const logoHeight = computed(() => POS_THEME_LOGO_HEIGHT_PX[branding.value.logoSize]);
/** Igual que la caja: si la imagen no carga, el encabezado no queda vacío. */
const logoFailed = ref(false);
watch(logoFileId, () => {
  logoFailed.value = false;
});
const showLogoImage = computed(() => !!logoFileId.value && !logoFailed.value);

const logoInvert = computed(() =>
  branding.value.logoPosition === 'right' ? 'row-reverse' : 'row',
);
</script>

<template>
  <!--
    El mock se construye con div: los defaults de v-card/v-sheet meterían el radio
    y la sombra del CRM y falsearían la preview (ver la nota de arriba).
  -->
  <div :style="rootStyle">
    <!-- Barra de estado -->
    <div
      v-if="statusOnTop"
      :style="{ ...altSurfaceStyle, marginBottom: spacing.gap, display: 'flex', justifyContent: 'space-between' }"
    >
      <span :style="mutedStyle">{{ $t('posThemes.preview.online') }}</span>
      <span :style="mutedStyle">{{ $t('posThemes.preview.clock', { time: '14:32' }) }}</span>
    </div>

    <!-- Cabecera: logotipo + mensaje de bienvenida -->
    <div
      :style="{
        ...surfaceStyle,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexDirection: logoInvert,
        gap: spacing.gap,
        marginBottom: spacing.gap,
      }"
    >
      <div :style="{ display: 'flex', alignItems: 'center', gap: spacing.gap }">
        <!-- Con imagen de empresa se dibuja SIEMPRE con <img>: un SVG así no ejecuta
             scripts. Sin imagen (o si falla), el logotipo POS KIOSKO con los tokens del tema. -->
        <img
          v-if="showLogoImage && logoSrc"
          :src="logoSrc"
          alt=""
          :style="{ height: `${logoHeight}px`, maxWidth: '200px', objectFit: 'contain' }"
          @error="logoFailed = true"
        />
        <PosBrandMark
          v-else
          :chip-color="c.primary"
          :chip-text-color="onPrimary"
          :word-color="c.text"
          :radius="radius"
          :font-size="`${Math.round(logoHeight * 0.75)}px`"
        />
      </div>
      <div v-if="branding.welcomeMessage" :style="headingStyle">
        {{ branding.welcomeMessage }}
      </div>
    </div>

    <!-- Categorías -->
    <div
      v-if="showCategories && categoriesOnTop"
      :style="{ display: 'flex', gap: spacing.gap, marginBottom: spacing.gap, flexWrap: 'wrap' }"
    >
      <div
        v-for="(cat, i) in DEMO_CATEGORIES"
        :key="cat"
        :style="{
          ...(i === 0 ? { background: c.primary, color: onPrimary } : altSurfaceStyle),
          borderRadius: radius,
          padding: `${spacing.row} ${spacing.pad}`,
          fontSize: `calc(${baseSize} * 0.9)`,
        }"
      >
        {{ cat }}
      </div>
    </div>

    <div :style="{ display: 'flex', gap: spacing.gap, alignItems: 'stretch' }">
      <!-- Categorías laterales -->
      <div
        v-if="showCategories && !categoriesOnTop"
        :style="{ ...surfaceStyle, width: '150px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: spacing.row }"
      >
        <div
          v-for="(cat, i) in DEMO_CATEGORIES"
          :key="cat"
          :style="{
            ...(i === 0 ? { background: c.primary, color: onPrimary } : {}),
            borderRadius: radius,
            padding: spacing.row,
            fontSize: `calc(${baseSize} * 0.9)`,
          }"
        >
          {{ cat }}
        </div>
      </div>

      <!-- Catálogo -->
      <div :style="{ flex: 1, display: 'flex', flexDirection: 'column', gap: spacing.gap }">
        <div
          :style="{
            display: 'grid',
            gridTemplateColumns: catalogColumns,
            gap: spacing.gap,
          }"
        >
          <div
            v-for="p in DEMO_PRODUCTS"
            :key="p.name"
            :style="{
              ...surfaceStyle,
              display: 'flex',
              gap: spacing.gap,
              flexDirection: cardImageLeft ? 'row' : 'column',
              alignItems: cardImageLeft ? 'center' : 'stretch',
              padding: cardCompact ? spacing.row : spacing.pad,
            }"
          >
            <div
              v-if="layout.showProductImages && !cardTextOnly"
              :style="{
                background: c.surfaceAlt,
                borderRadius: radius,
                height: cardCompact ? '32px' : '52px',
                width: cardImageLeft ? '44px' : '100%',
                flexShrink: 0,
              }"
            />
            <div :style="{ display: 'flex', flexDirection: 'column', gap: '2px' }">
              <span
                :style="{
                  color: c.text,
                  fontSize: `calc(${baseSize} * 0.9)`,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }"
              >
                {{ p.name }}
              </span>
              <span :style="totalStyle">{{ p.price }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Carrito -->
      <div
        v-if="cartOnLeft"
        :style="{ ...surfaceStyle, width: cartWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: spacing.gap }"
      >
        <div :style="headingStyle">{{ $t('posThemes.preview.cart') }}</div>
        <div :style="altSurfaceStyle">{{ $t('posThemes.preview.line', { name: 'Café con leche', price: '2,50' }) }}</div>
        <div :style="altSurfaceStyle">{{ $t('posThemes.preview.line', { name: 'Empanada', price: '3,20' }) }}</div>
        <div :style="{ ...totalStyle, marginTop: spacing.gap }">
          {{ $t('posThemes.preview.total', { total: '5,70' }) }}
        </div>
        <div :style="primaryButtonStyle">{{ $t('posThemes.preview.pay') }}</div>
      </div>
    </div>

    <!-- Carrito a la derecha -->
    <div
      v-if="!cartOnLeft"
      :style="{ ...surfaceStyle, marginTop: spacing.gap, display: 'flex', gap: spacing.gap, alignItems: 'center', justifyContent: 'space-between' }"
    >
      <div :style="{ display: 'flex', gap: spacing.gap, alignItems: 'center' }">
        <span :style="headingStyle">{{ $t('posThemes.preview.cart') }}</span>
        <span :style="mutedStyle">{{ $t('posThemes.preview.items', { count: 2 }) }}</span>
      </div>
      <div :style="{ display: 'flex', gap: spacing.gap, alignItems: 'center' }">
        <span :style="totalStyle">{{ $t('posThemes.preview.total', { total: '5,70' }) }}</span>
        <span :style="primaryButtonStyle">{{ $t('posThemes.preview.pay') }}</span>
      </div>
    </div>

    <!-- Barra de estado abajo -->
    <div
      v-if="!statusOnTop"
      :style="{ ...altSurfaceStyle, marginTop: spacing.gap, display: 'flex', justifyContent: 'space-between' }"
    >
      <span :style="mutedStyle">{{ $t('posThemes.preview.cashier', { name: 'Ana' }) }}</span>
      <span :style="mutedStyle">{{ $t('posThemes.preview.clock', { time: '14:32' }) }}</span>
    </div>
  </div>
</template>
