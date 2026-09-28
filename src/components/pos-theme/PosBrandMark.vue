<script setup lang="ts">
/**
 * Logotipo "POS KIOSKO": el que muestra la caja cuando el cliente no sube su
 * propia imagen. Es la misma composición de la pantalla de instalación
 * (`pos/os/installer-ui/index.html`, `.mark .chip` + `.mark .word`): un chip con
 * "POS" y la palabra "KIOSKO" al lado, en negrita.
 *
 * Los colores no se escriben aquí: llegan por props desde los tokens del tema del
 * cliente (ver la nota de `PosThemePreview.vue`), así que el logotipo se adapta a
 * su color primario y a su modo claro/oscuro igual que en la caja.
 */
defineProps<{
  /** Fondo del chip (token `primary`). */
  chipColor: string;
  /** Texto del chip (`pickOnPrimary(primary)`). */
  chipTextColor: string;
  /** Color de "KIOSKO" (token `text`). */
  wordColor: string;
  /** Radio del chip, ya resuelto (`shape.radius`). */
  radius: string;
  /** Tamaño de letra CSS, para que crezca con `logoSize`. */
  fontSize: string;
}>();
</script>

<template>
  <span
    role="img"
    aria-label="POS KIOSKO"
    :style="{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.28em',
      fontWeight: 800,
      lineHeight: 1,
      letterSpacing: '0.01em',
      fontSize,
    }"
  >
    <span
      :style="{
        background: chipColor,
        color: chipTextColor,
        borderRadius: radius,
        padding: '0.06em 0.22em 0.1em',
      }"
    >POS</span>
    <span :style="{ color: wordColor }">KIOSKO</span>
  </span>
</template>
