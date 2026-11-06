<script setup lang="ts">
import { useI18n } from 'vue-i18n';

/** Lista de atajos de teclado (se abre con «?»), los mismos que Asana. */
defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();
const { t } = useI18n();

/**
 * Sintaxis de `v-hotkey` (Vuetify 4, UI-UX.md §7 bis): `+` combina teclas. `v-hotkey` dibuja cada tecla con `v-kbd` y se adapta al
 * sistema (⌘ en Mac). `@` no es una combinación: se muestra tal cual con `v-kbd`.
 */
const SHORTCUTS: Array<[string, string]> = [
  ['tab+q', 'quickAdd'],
  ['tab+m', 'assignMe'],
  ['tab+c', 'complete'],
  ['tab+d', 'dueDate'],
  ['tab+l', 'like'],
  ['tab+k', 'comment'],
  ['ctrl+enter', 'send'],
  ['@', 'mention'],
  ['shift+slash', 'help'],
];
</script>

<template>
  <v-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <v-card>
      <v-card-title>{{ t('projects.shortcuts.title') }}</v-card-title>
      <v-card-text>
        <v-table density="compact">
          <tbody>
            <tr v-for="[keys, action] in SHORTCUTS" :key="action">
              <td class="text-no-wrap">
                <v-kbd v-if="keys === '@'">@</v-kbd>
                <v-hotkey v-else :keys="keys" />
              </td>
              <td>{{ t(`projects.shortcuts.${action}`) }}</td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">{{ t('common.close') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
