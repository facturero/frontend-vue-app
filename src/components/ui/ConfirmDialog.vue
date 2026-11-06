<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePendingConfirm } from '@/composable/useConfirm';

/**
 * El diálogo de TODAS las confirmaciones (se monta una vez, en App.vue). Quien pregunta usa `useConfirm()`; ver ese archivo.
 * Anatomía de REGLAS-FRONT.md R-21/R-22: la pregunta como título, la consecuencia como texto, «Cancelar» y el verbo.
 */
const { t } = useI18n();
const { pending, answer } = usePendingConfirm();

const cancelBtn = ref<{ $el: HTMLElement } | null>(null);
const confirmBtn = ref<{ $el: HTMLElement } | null>(null);

/**
 * Al abrir, Vuetify 4 lleva el foco a la caja del diálogo e ignora `autofocus`. Se coloca al terminar de abrirse: en lo
 * destructivo, en «Cancelar» (un Enter por inercia no debe borrar nada); en lo demás, en el botón de confirmar.
 */
function placeFocus(): void {
  (pending.value?.destructive ? cancelBtn : confirmBtn).value?.$el.focus();
}
</script>

<template>
  <v-dialog :model-value="!!pending" @update:model-value="(open) => !open && answer(false)" @after-enter="placeFocus">
    <v-card v-if="pending">
      <v-card-title>{{ pending.title }}</v-card-title>
      <v-card-text v-if="pending.text">{{ pending.text }}</v-card-text>
      <v-card-actions class="flex-wrap ga-2">
        <v-spacer />
        <v-btn ref="cancelBtn" variant="text" @click="answer(false)">{{ t('common.cancel') }}</v-btn>
        <!-- `variant="flat"` a propósito: dentro de `v-card-actions` Vuetify 4 pone los botones en `text`, y la acción principal
             debe ser sólida (REGLAS-FRONT.md R-10, R-21). -->
        <v-btn ref="confirmBtn" variant="flat" :color="pending.destructive ? 'error' : 'primary'" @click="answer(true)">
          {{ pending.confirmText ?? t('common.confirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
