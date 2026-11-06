<script setup lang="ts">
import { computed, ref } from 'vue';
import { localIsoDate, parseIsoDate } from '@/utils/isoDate';

/**
 * EL campo de fecha de la app (UI-UX.md §1, «Solo componentes de Vuetify»): nunca `<input type="date">`, que dibuja el navegador
 * con su idioma y sus colores, no los del CRM.
 *
 * Envuelve `v-date-input` (estable desde Vuetify 4.1) y habla el mismo idioma que la API y el estado: `YYYY-MM-DD` o `null`
 * (REGLAS-FRONT.md R-43). `v-date-input` trabaja con `Date`; la conversión va por `utils/isoDate`, siempre con la fecha LOCAL: una
 * cadena `YYYY-MM-DD` leída como UTC sería el día anterior en Ecuador.
 *
 * Todo lo demás (`label`, `clearable`, `readonly`, `disabled`, `hint`, `variant`…) pasa tal cual a `v-date-input`, y su aspecto
 * por defecto sale de `VDateInput` en `plugins/vuetify.ts`. Para un rango inicio–fin se usan dos, con el `min` del fin = inicio.
 */
const props = withDefaults(
  defineProps<{
    modelValue: string | null | undefined;
    min?: string | null;
    max?: string | null;
    /** La fecha no puede quedar vacía (el «al» de un balance, el día de la agenda): si se borra, vuelve la que había. */
    required?: boolean;
  }>(),
  { min: null, max: null, required: false },
);
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>();

const date = computed(() => parseIsoDate(props.modelValue));
const minDate = computed(() => parseIsoDate(props.min) ?? undefined);
const maxDate = computed(() => parseIsoDate(props.max) ?? undefined);

function update(value: unknown): void {
  const iso = value instanceof Date && !Number.isNaN(value.getTime()) ? localIsoDate(value) : null;
  // Obligatoria: vaciarla no cambia nada; al salir del campo, `v-date-input` vuelve a mostrar la fecha que sigue en el modelo.
  if (iso === null && props.required) return;
  // `v-date-input` también emite al salir del campo sin cambios: solo se avisa si la fecha cambió de verdad.
  if (iso !== (props.modelValue || null)) emit('update:modelValue', iso);
}

const input = ref<{ focus: () => void } | null>(null);
defineExpose({ focus: () => input.value?.focus() });
</script>

<template>
  <v-date-input ref="input" :model-value="date" :min="minDate" :max="maxDate" @update:model-value="update" />
</template>
