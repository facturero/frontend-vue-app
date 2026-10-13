<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useOrganizationStore } from '@/stores/organization';
import { usePosStore } from '@/stores/pos';

/**
 * Con qué punto de emisión factura este equipo. Cada punto tiene su propia numeración (001-002-…), así que lo ideal es un punto
 * de tipo `web` por laptop: dos equipos sobre el mismo punto funcionan, pero se pelean por la secuencia. Los puntos tipo `pos`
 * son de las cajas de escritorio emparejadas y no se ofrecen aquí.
 */
const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const org = useOrganizationStore();
const pos = usePosStore();

const establishmentId = ref('');
const emissionPointId = ref('');
const loading = ref(false);

const establishments = computed(() => org.establishments.filter((e) => e.status === 'active'));
const points = computed(() => org.emissionPoints.filter((p) => p.status === 'active' && p.type === 'web'));
const canSave = computed(() => !!establishmentId.value && !!emissionPointId.value);

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return;
    loading.value = true;
    await org.fetchEstablishments();
    establishmentId.value =
      pos.point?.establishmentId ?? establishments.value.find((e) => e.isMain)?.id ?? establishments.value[0]?.id ?? '';
    loading.value = false;
  },
  { immediate: true },
);

watch(establishmentId, async (id) => {
  emissionPointId.value = '';
  if (!id) return;
  loading.value = true;
  await org.fetchEmissionPoints(id);
  const saved = pos.point?.emissionPointId;
  if (saved && points.value.some((p) => p.id === saved)) emissionPointId.value = saved;
  else if (points.value.length === 1) emissionPointId.value = points.value[0].id;
  loading.value = false;
});

function save(): void {
  if (!canSave.value) return;
  pos.selectPoint(establishmentId.value, emissionPointId.value);
  emit('update:modelValue', false);
}
</script>

<template>
  <!-- Sin punto elegido la caja no puede facturar: el diálogo no se cierra con un clic afuera. -->
  <v-dialog :model-value="modelValue" :persistent="!pos.point" @update:model-value="(v) => emit('update:modelValue', v)">
    <v-card>
      <v-card-title>{{ $t('pos.setup.title') }}</v-card-title>
      <v-progress-linear v-if="loading" indeterminate />
      <v-card-text>
        <p class="text-body-2 text-medium-emphasis mb-4">{{ $t('pos.setup.intro') }}</p>

        <v-select
          v-model="establishmentId"
          :items="establishments.map((e) => ({ title: `${e.code} — ${e.name}`, value: e.id }))"
          :label="$t('pos.setup.establishment')"
          class="mb-4"
        />
        <v-select
          v-model="emissionPointId"
          :items="points.map((p) => ({ title: `${p.code} — ${p.name || $t('pos.setup.point')}`, value: p.id }))"
          :label="$t('pos.setup.point')"
          :disabled="!establishmentId"
        />
        <v-alert v-if="establishmentId && !loading && points.length === 0" type="warning" class="mt-4">
          {{ $t('pos.setup.noPoints') }}
        </v-alert>
      </v-card-text>
      <v-card-actions class="flex-wrap ga-2">
        <v-spacer />
        <v-btn v-if="pos.point" variant="text" @click="emit('update:modelValue', false)">{{ $t('common.cancel') }}</v-btn>
        <v-btn color="primary" variant="tonal" :disabled="!canSave" @click="save">{{ $t('pos.setup.save') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
