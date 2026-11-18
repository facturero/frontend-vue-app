<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

defineOptions({ inheritAttrs: false });

/**
 * EL campo de color de la app (UI-UX.md §1): un `v-text-field` con el hexadecimal y, dentro, una muestra que abre `v-color-picker`.
 * Nunca `<input type="color">`: lo dibuja el sistema operativo (en Windows, el diálogo de colores de 1995), no sigue el tema y
 * obligaba a estilos en línea para que se pareciera a un campo.
 *
 * Habla `#rrggbb` en texto, igual que los contratos de temas (POS y aplicación). El selector solo ofrece hexadecimal. La muestra
 * no se pinta si el texto no es un color válido (mientras se escribe a medias), en vez de quedar negra.
 *
 * Todo lo demás (`label`, `error`, `@blur`, `maxlength`…) pasa tal cual al `v-text-field`.
 */
defineProps<{ modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const { t } = useI18n();
const picking = ref(false);

const HEX = /^#[0-9a-f]{6}$/i;
</script>

<template>
  <v-text-field v-bind="$attrs" :model-value="modelValue" maxlength="7" @update:model-value="emit('update:modelValue', String($event ?? ''))">
    <template #prepend-inner>
      <v-menu v-model="picking" :close-on-content-click="false" location="bottom start">
        <template #activator="{ props: menu }">
          <v-avatar
            v-bind="menu"
            :color="HEX.test(modelValue) ? modelValue : undefined"
            size="22"
            rounded="md"
            class="border cursor-pointer"
            role="button"
            tabindex="0"
            :aria-label="t('common.pickColor')"
          />
        </template>
        <v-color-picker
          :model-value="HEX.test(modelValue) ? modelValue : undefined"
          mode="hex"
          :modes="['hex']"
          elevation="8"
          @update:model-value="emit('update:modelValue', String($event).slice(0, 7).toLowerCase())"
        />
      </v-menu>
    </template>
  </v-text-field>
</template>
