<script setup lang="ts">
/**
 * Ayuda de un campo: un "?" pequeño junto a la etiqueta que se explica al pasar
 * el ratón por encima (y al llegar con el tabulador, que el ratón no es la
 * única forma de rellenar un formulario).
 *
 * Existe para no tener que elegir entre un párrafo debajo de cada campo y dejar
 * al usuario a ciegas: el detalle está, pero solo cuando se pide. Los tours del
 * alta se apoyan en esto — cuentan el para qué de la pantalla y dejan el qué va
 * en cada campo a estos iconos.
 *
 *   <FieldHelp :text="$t('organization.help.taxId')" />
 */
defineProps<{ text: string }>();
</script>

<template>
  <v-tooltip :text="text" location="top" max-width="280" open-on-focus>
    <template #activator="{ props }">
      <v-icon
        v-bind="props"
        icon="mdi-help-circle-outline"
        size="15"
        class="ms-1 text-medium-emphasis"
        tabindex="0"
        :aria-label="text"
      />
    </template>
  </v-tooltip>
</template>
