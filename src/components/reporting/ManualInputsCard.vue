<script setup lang="ts">
/**
 * Los casilleros que completa el contador porque el sistema no puede deducirlos. Se escriben en las unidades de siempre (dólares y %) y
 * viajan en centavos y puntos básicos. Guardar uno NO crea una versión: hay que generar de nuevo, y la tarjeta lo dice.
 */
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { extractError } from '@/utils/error';
import { manualText, manualValue, MANUAL_KIND } from '@/utils/reporting';
import { useReportingStore } from '@/stores/reporting';
import type { AnnexType } from '@/types/reporting';

const props = defineProps<{ annex: AnnexType; period: string; editable: boolean }>();
const emit = defineEmits<{ (e: 'saved'): void }>();

const { t } = useI18n();
const store = useReportingStore();

const texts = reactive<Record<string, string>>({});
const messages = reactive<Record<string, { type: 'success' | 'error'; text: string }>>({});
const fields = computed(() => store.manual?.fields ?? []);
const saved = computed(() => new Map((store.manual?.items ?? []).map((i) => [i.fieldCode, i.amountCents])));
const pending = ref<string | null>(null);

// Cada vez que llegan los valores guardados se rellenan los campos: lo que no se guardó queda vacío (se usa el predeterminado).
watch(
  () => store.manual,
  () => {
    for (const code of fields.value) {
      const value = saved.value.get(code);
      texts[code] = value === undefined ? '' : manualText(code, value);
    }
  },
  { immediate: true },
);

async function save(code: string): Promise<void> {
  const value = manualValue(code, texts[code] ?? '');
  delete messages[code];
  if (value === null) {
    messages[code] = { type: 'error', text: t('reporting.manual.invalid') };
    return;
  }
  pending.value = code;
  try {
    await store.saveManual(props.annex, props.period, code, value);
    messages[code] = { type: 'success', text: t('reporting.manual.saved') };
    emit('saved');
  } catch (err) {
    messages[code] = { type: 'error', text: extractError(err) };
  } finally {
    pending.value = null;
  }
}
</script>

<template>
  <v-card v-if="fields.length > 0">
    <v-card-title class="text-h6">{{ $t('reporting.manual.title') }}</v-card-title>
    <v-card-text>
      <p class="text-body-2 text-medium-emphasis mb-4">{{ $t('reporting.manual.intro') }}</p>
      <v-row v-for="code in fields" :key="code" align="start">
        <v-col cols="12" md="7">
          <v-text-field
            v-model="texts[code]"
            :label="$t(`reporting.manual.fields.${code}`)"
            :hint="saved.has(code) ? $t(`reporting.manual.hints.${code}`) : `${$t(`reporting.manual.hints.${code}`)} ${$t('reporting.manual.pending')}`"
            persistent-hint
            :readonly="!editable"
            :suffix="MANUAL_KIND[code] === 'percent' ? '%' : 'USD'"
            inputmode="decimal"
            :data-testid="`manual-${code}`"
          />
        </v-col>
        <v-col cols="12" md="5">
          <v-btn v-if="editable" variant="tonal" :loading="pending === code" :data-testid="`manual-save-${code}`" @click="save(code)">{{ $t('reporting.manual.save') }}</v-btn>
          <v-alert v-if="messages[code]" :type="messages[code]!.type" class="mt-2">{{ messages[code]!.text }}</v-alert>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>
