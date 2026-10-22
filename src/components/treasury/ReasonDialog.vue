<script setup lang="ts">
/**
 * Un diálogo que pide un MOTIVO escrito (mínimo 5 caracteres, igual que el servidor) antes de una acción que deja huella: marcar un renglón
 * «ya contabilizado fuera de tesorería», anular un ajuste bancario, reabrir una conciliación. El motivo viaja a la bitácora.
 */
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  modelValue: boolean;
  title: string;
  hint: string;
  label: string;
  confirmLabel: string;
  confirmColor?: string;
  saving: boolean;
  serverError: string | null;
}>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'confirm', reason: string): void }>();

const reason = ref('');
watch(() => props.modelValue, (open) => { if (open) reason.value = ''; });
const ok = computed(() => reason.value.trim().length >= 5);
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="520" @update:model-value="emit('update:modelValue', $event)">
    <v-card>
      <v-card-title>{{ title }}</v-card-title>
      <v-card-text>
        <v-alert v-if="serverError" type="error" class="mb-4">{{ serverError }}</v-alert>
        <div class="text-body-2 text-medium-emphasis mb-3">{{ hint }}</div>
        <v-textarea v-model="reason" :label="label" :hint="$t('treasury.banking.reasonHint')" persistent-hint rows="2" auto-grow maxlength="300" />
      </v-card-text>
      <v-card-actions class="flex-wrap ga-2">
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">{{ $t('common.cancel') }}</v-btn>
        <v-btn :color="confirmColor ?? 'primary'" :loading="saving" :disabled="!ok" @click="emit('confirm', reason.trim())">{{ confirmLabel }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
