<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useOrganizationStore } from '@/stores/organization';
import { usePosStore } from '@/stores/pos';

/**
 * Con qué punto de emisión factura este equipo. Cada punto tiene su propia numeración (001-002-…), así que lo ideal es un punto
 * de tipo `web` por laptop: dos equipos sobre el mismo punto funcionan, pero se pelean por la secuencia. Los puntos tipo `pos`
 * son de las cajas de escritorio emparejadas y no se ofrecen aquí. Mismo estilo de modal que el cobro.
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

// Sin punto elegido la caja no puede facturar: el modal no se cierra con un clic afuera.
function dismiss(): void {
  if (pos.point) emit('update:modelValue', false);
}
</script>

<template>
  <div v-if="modelValue" class="pk-overlay" @click.self="dismiss">
    <div class="pk-modal" role="dialog" aria-modal="true" :aria-label="$t('pos.setup.title')">
      <h2 class="pk-modal__title">{{ $t('pos.setup.title') }}</h2>
      <p class="pk-hint" :style="{ marginTop: 0, marginBottom: '1rem' }">{{ $t('pos.setup.intro') }}</p>

      <label class="pk-label" for="pk-est">{{ $t('pos.setup.establishment') }}</label>
      <select id="pk-est" v-model="establishmentId" class="pk-select">
        <option v-for="e in establishments" :key="e.id" :value="e.id">{{ e.code }} — {{ e.name }}</option>
      </select>

      <label class="pk-label" for="pk-point">{{ $t('pos.setup.point') }}</label>
      <select id="pk-point" v-model="emissionPointId" class="pk-select" :disabled="!establishmentId">
        <option value="" disabled>—</option>
        <option v-for="p in points" :key="p.id" :value="p.id">{{ p.code }} — {{ p.name || $t('pos.setup.point') }}</option>
      </select>

      <p v-if="loading" class="pk-hint">{{ $t('pos.search.loading') }}</p>
      <div v-if="establishmentId && !loading && points.length === 0" class="pk-banner pk-banner--warn" :style="{ margin: '0 0 1rem' }">
        <div class="pk-grow">{{ $t('pos.setup.noPoints') }}</div>
      </div>

      <div class="pk-modal__actions">
        <button v-if="pos.point" type="button" class="pk-btn pk-btn--alt" @click="emit('update:modelValue', false)">{{ $t('common.cancel') }}</button>
        <button type="button" class="pk-btn pk-btn--primary" :disabled="!canSave" @click="save">{{ $t('pos.setup.save') }}</button>
      </div>
    </div>
  </div>
</template>
