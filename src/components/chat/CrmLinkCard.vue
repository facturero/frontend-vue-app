<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { usePluginsStore } from '@/stores/plugins';
import { availableCrmEntities, CRM_SOURCES, resolveCrmCard, type CrmCardData, type CrmEntity } from '@/utils/crm-links';

/**
 * Tarjeta de un registro del CRM dentro de un mensaje (o en el editor, antes de enviar). Se completa con los permisos de quien la ve:
 * sin módulo o sin permiso no se pide nada y queda la etiqueta guardada con «Sin acceso» (ver `utils/crm-links.ts`). Un clic abre el
 * registro; en el editor, la ✕ la quita del texto.
 */
const props = withDefaults(defineProps<{ entityType: CrmEntity; entityId: string; label: string; removable?: boolean; selected?: boolean }>(), {
  removable: false,
  selected: false,
});
const emit = defineEmits<{ remove: [] }>();
const { t } = useI18n();
const auth = useAuthStore();
const plugins = usePluginsStore();

const source = computed(() => CRM_SOURCES[props.entityType]);
const allowed = computed(() => availableCrmEntities((p) => plugins.isActive(p), (p) => auth.can(p)).includes(props.entityType));
const data = ref<CrmCardData | null>(null);
const loading = ref(false);

watch(
  () => [props.entityType, props.entityId, allowed.value] as const,
  async ([type, id, ok]) => {
    data.value = null;
    if (!ok || !CRM_SOURCES[type]) return;
    loading.value = true;
    data.value = await resolveCrmCard(type, id);
    loading.value = false;
  },
  { immediate: true },
);
const noAccess = computed(() => !loading.value && !data.value);
</script>

<template>
  <v-card
    variant="flat"
    class="my-1 d-inline-flex align-center ga-2 pa-2 pe-3 border"
    :class="{ 'border-primary': selected }"
    :to="noAccess || removable ? undefined : source.route(entityId)"
    :style="{ maxWidth: '100%' }"
    :data-crm-link="`${entityType}:${entityId}`"
  >
    <v-avatar size="32" rounded color="lightprimary">
      <v-icon :icon="source.icon" size="18" color="primary" />
    </v-avatar>
    <div :style="{ minWidth: 0 }">
      <div class="text-body-medium font-weight-medium text-truncate" :class="{ 'text-decoration-line-through': data?.done }">
        {{ data?.title ?? label }}
      </div>
      <div class="text-body-small text-medium-emphasis text-truncate">
        {{ t(`chat.crm.type.${entityType}`) }}<template v-if="noAccess"> · {{ t('chat.crm.noAccess') }}</template><template v-else-if="data?.subtitle"> · {{ data.subtitle }}</template>
      </div>
    </div>
    <v-progress-circular v-if="loading" indeterminate size="14" width="2" color="primary" />
    <v-btn
      v-if="removable"
      icon="mdi-close"
      variant="text"
      size="x-small"
      :aria-label="t('chat.crm.remove')"
      @mousedown.prevent.stop
      @click.prevent.stop="emit('remove')"
    />
  </v-card>
</template>
