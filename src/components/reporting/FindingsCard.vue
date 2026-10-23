<script setup lang="ts">
/**
 * Lo que hay que revisar antes de declarar: errores (pueden hacer que el SRI rechace el anexo) y advertencias (conviene confirmarlas).
 * El texto de cada hallazgo lo escribe el servidor; aquí solo se agrupan y se ordenan los errores primero.
 */
import { computed } from 'vue';
import { severityColor, severityIcon } from '@/utils/reporting';
import type { Finding } from '@/types/reporting';

const props = defineProps<{ findings: Finding[] }>();
defineEmits<{ (e: 'show-document', documentId: string): void }>();

const sorted = computed(() => [...props.findings].sort((a, b) => (a.severity === b.severity ? a.code.localeCompare(b.code) : a.severity === 'error' ? -1 : 1)));
const errors = computed(() => props.findings.filter((f) => f.severity === 'error').length);
const warnings = computed(() => props.findings.length - errors.value);
</script>

<template>
  <v-card>
    <v-card-title class="text-h6">
      {{ $t('reporting.findings.title') }}
      <v-chip v-if="errors > 0" color="error" size="small" class="ml-2">{{ $t('reporting.findings.errors', { n: errors }, errors) }}</v-chip>
      <v-chip v-if="warnings > 0" color="warning" size="small" class="ml-2">{{ $t('reporting.findings.warnings', { n: warnings }, warnings) }}</v-chip>
    </v-card-title>
    <v-card-text>
      <v-alert v-if="findings.length === 0" type="success">{{ $t('reporting.findings.none') }}</v-alert>
      <template v-else>
        <p class="text-body-2 text-medium-emphasis mb-4">{{ $t('reporting.findings.intro') }}</p>
        <v-list>
          <v-list-item v-for="f in sorted" :key="f.id" :prepend-icon="severityIcon(f.severity)" :base-color="severityColor(f.severity)">
            <v-list-item-title class="text-wrap">{{ f.message }}</v-list-item-title>
            <v-list-item-subtitle>{{ $t(`reporting.findings.severity.${f.severity}`) }} · {{ f.code }}</v-list-item-subtitle>
            <template v-if="f.documentId" #append>
              <v-btn variant="text" size="small" @click="$emit('show-document', f.documentId)">{{ $t('reporting.findings.seeDocument') }}</v-btn>
            </template>
          </v-list-item>
        </v-list>
      </template>
    </v-card-text>
  </v-card>
</template>
