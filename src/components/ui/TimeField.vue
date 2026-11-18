<script setup lang="ts">
import { mergeProps, ref, watch } from 'vue';

defineOptions({ inheritAttrs: false });

/**
 * EL campo de hora de la app (UI-UX.md §1, «Solo componentes de Vuetify»): nunca `<input type="time">`, que dibuja el reloj del
 * navegador con el formato del sistema operativo (en un Windows en inglés, «08:00 PM» en un CRM en español) y sin el tema.
 *
 * Vuetify 4.3 no trae un campo de hora estable (`v-time-input` sigue en *labs*), así que este es el patrón que pide UI-UX §1:
 * un `v-text-field` con `v-time-picker` (núcleo) dentro de un `v-menu`. Habla `HH:mm` en 24 h, igual que la API.
 *
 * Se puede escribir la hora a mano (con el teclado no hace falta abrir el reloj): al salir del campo, «8:5» o «0805» se leen como
 * 08:05 y algo que no es una hora vuelve al valor que había. El reloj se cierra solo al elegir los minutos.
 *
 * Todo lo demás (`label`, `disabled`, `hint`, `clearable`…) pasa tal cual al `v-text-field`, con su aspecto por defecto de
 * `plugins/vuetify.ts`.
 */
const props = defineProps<{ modelValue: string | null | undefined }>();
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>();

const open = ref(false);
const text = ref(props.modelValue ?? '');
watch(() => props.modelValue, (v) => (text.value = v ?? ''));

/** «8:5», «08:05», «805», «0805» → «08:05»; cualquier otra cosa → null. */
function parse(raw: string): string | null {
  const s = raw.trim();
  const m = s.match(/^(\d{1,2}):(\d{1,2})$/) ?? s.match(/^(\d{1,2})(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function commit(): void {
  if (!text.value.trim()) {
    if (props.modelValue) emit('update:modelValue', null);
    return;
  }
  const value = parse(text.value);
  if (value === null) {
    text.value = props.modelValue ?? '';
    return;
  }
  text.value = value;
  if (value !== props.modelValue) emit('update:modelValue', value);
}

function pick(value: string | null): void {
  if (value && value !== props.modelValue) emit('update:modelValue', value);
}
</script>

<template>
  <v-menu v-model="open" :close-on-content-click="false" :disabled="$attrs.disabled === true || $attrs.disabled === ''">
    <template #activator="{ props: menu }">
      <v-text-field
        v-bind="mergeProps(menu, $attrs)"
        v-model="text"
        prepend-inner-icon="mdi-clock-outline"
        inputmode="numeric"
        @blur="commit"
        @keydown.enter="commit"
      />
    </template>
    <v-time-picker
      :model-value="modelValue ?? null"
      format="24hr"
      color="primary"
      @update:model-value="pick"
      @update:minute="open = false"
    />
  </v-menu>
</template>
