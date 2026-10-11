<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUiStore } from '@/stores/ui';
import { MAX_MESSAGE, submitProblemReport } from '@/telemetry/report';

const ui = useUiStore();
const { t } = useI18n();

const message = ref('');
const includeActivity = ref(true);
const sending = ref(false);
const error = ref<string | null>(null);
const result = ref<{ id: string; sent: boolean } | null>(null);
const copied = ref(false);

// Cada vez que se abre arranca limpio: un reporte anterior no debe reaparecer.
watch(
  () => ui.reportOpen,
  (open) => {
    if (!open) return;
    message.value = '';
    includeActivity.value = true;
    error.value = null;
    result.value = null;
    copied.value = false;
  },
);

async function send(): Promise<void> {
  if (!message.value.trim()) return;
  sending.value = true;
  error.value = null;
  try {
    result.value = await submitProblemReport({ message: message.value, includeActivity: includeActivity.value });
  } catch {
    error.value = t('report.error');
  } finally {
    sending.value = false;
  }
}

async function copyCode(): Promise<void> {
  if (!result.value) return;
  try {
    await navigator.clipboard.writeText(result.value.id);
    copied.value = true;
  } catch {
    // sin permiso de portapapeles: el código sigue visible para copiarlo a mano
  }
}
</script>

<template>
  <v-dialog v-model="ui.reportOpen" max-width="520">
    <v-card>
      <v-card-title>{{ $t('report.title') }}</v-card-title>

      <v-card-text v-if="!result">
        <p class="text-body-2 text-medium-emphasis mb-4">{{ $t('report.intro') }}</p>

        <v-textarea
          v-model="message"
          :label="$t('report.label')"
          :placeholder="$t('report.placeholder')"
          :maxlength="MAX_MESSAGE"
          counter
          rows="5"
          auto-grow
          autofocus
        />
        <p class="text-caption text-medium-emphasis mt-1 mb-3">{{ $t('report.privacy') }}</p>

        <v-checkbox v-model="includeActivity" :label="$t('report.includeActivity')" />
        <p class="text-caption text-medium-emphasis ml-8">{{ $t('report.includeActivityHint') }}</p>

        <v-alert v-if="error" type="error" class="mt-4">{{ error }}</v-alert>
      </v-card-text>

      <v-card-text v-else>
        <v-alert :type="result.sent ? 'success' : 'info'" :title="result.sent ? $t('report.sentTitle') : undefined">
          {{ result.sent ? $t('report.sentBody') : $t('report.notSent') }}
        </v-alert>
        <div v-if="result.sent" class="d-flex align-center ga-2 mt-4">
          <div class="flex-grow-1">
            <div class="text-caption text-medium-emphasis">{{ $t('report.code') }}</div>
            <code class="text-body-2 text-break">{{ result.id }}</code>
          </div>
          <v-btn
            variant="tonal"
            :prepend-icon="copied ? 'mdi-check' : 'mdi-content-copy'"
            @click="copyCode"
          >
            {{ copied ? $t('report.copied') : $t('report.copy') }}
          </v-btn>
        </div>
      </v-card-text>

      <v-card-actions class="flex-wrap ga-2">
        <v-spacer />
        <v-btn variant="text" @click="ui.reportOpen = false">
          {{ result ? $t('report.close') : $t('common.cancel') }}
        </v-btn>
        <v-btn
          v-if="!result"
          color="primary"
          variant="tonal"
          :disabled="!message.trim()"
          :loading="sending"
          @click="send"
        >
          {{ $t('report.send') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
