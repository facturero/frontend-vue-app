<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { usePosThemeStore } from '@/stores/posTheme';
import { organizationApi } from '@/api/organization';
import { getSocket } from '@/utils/realtime';
import type { EmissionPointDTO } from '@/types/organization';
import type { PosThemeSummaryDTO } from '@/types/posTheme';
import PageHeader from '@/components/ui/PageHeader.vue';

const { t } = useI18n();
const auth = useAuthStore();
const store = usePosThemeStore();
const router = useRouter();

// `embedded`: la vista vive dentro de Ajustes (arquetipo F) como pestaña, sin
// container ni PageHeader propios.
const props = defineProps<{ embedded?: boolean }>();

const canManage = computed(() => auth.can('organization:admin'));

function openEditor(themeId: string): void {
  void router.push(`/organization/pos-themes/${themeId}`);
}

/* ------------------------------------------------------------------ *
 * Asignar a puntos de emisión
 * ------------------------------------------------------------------ */

const showAssignDialog = ref(false);
const assignLoading = ref(false);
const assignTarget = ref<PosThemeSummaryDTO | null>(null);
const assignPoints = ref<EmissionPointDTO[]>([]);
const assignSelection = ref<Record<string, string>>({});

/** Solo los puntos de tipo POS: un punto web no dibuja la pantalla del tema. */
const posPoints = computed(() => assignPoints.value.filter((p) => p.type === 'pos'));

async function openAssignDialog(theme: PosThemeSummaryDTO): Promise<void> {
  assignTarget.value = theme;
  showAssignDialog.value = true;
  assignLoading.value = true;
  try {
    const establishments = await organizationApi.getEstablishments();
    // Se pide punto a punto y se acumulan aquí en vez de usar el store de
    // organización: `emissionPoints` de ese store es un único ref que se
    // sobreescribe en cada fetch, y esta lista necesita todos a la vez.
    const all: EmissionPointDTO[] = [];
    for (const est of establishments) {
      const points = await organizationApi.getEmissionPoints(est.id);
      all.push(...points);
    }
    assignPoints.value = all;
    // Prellena con lo que hay puesto hoy, para poder ver y cambiar sin abrir
    // cada desplegable.
    assignSelection.value = Object.fromEntries(
      all.map((p) => [p.id, p.posThemeId ?? '']),
    );
  } catch {
    assignPoints.value = [];
  } finally {
    assignLoading.value = false;
  }
}

function closeAssignDialog(): void {
  showAssignDialog.value = false;
  assignTarget.value = null;
}

/** Solo lo que el usuario tocó: mandar los 200 puntos en cada guardado sería
 * escribir en lo que no se ha cambiado. */
const assignmentChanges = computed(() =>
  posPoints.value
    .filter((p) => assignSelection.value[p.id] !== (p.posThemeId ?? ''))
    .map((p) => ({ point: p, themeId: assignSelection.value[p.id] || null })),
);

async function saveAssignments(): Promise<void> {
  for (const change of assignmentChanges.value) {
    const ok = await store.assignToPoint(
      change.point.establishmentId,
      change.point.id,
      change.themeId,
    );
    // Para en el primer rechazo: si el usuario no tiene permiso o el punto no
    // existe, seguir intentando solo genera más errores iguales.
    if (!ok) return;
  }
  closeAssignDialog();
}

/* ------------------------------------------------------------------ *
 * Borrar
 * ------------------------------------------------------------------ */

async function handleDelete(theme: PosThemeSummaryDTO): Promise<void> {
  if (
    !confirm(
      t('posThemes.deleteConfirm', {
        name: theme.name,
        count: theme.assignedPointsCount,
      }),
    )
  ) {
    return;
  }
  await store.deleteTheme(theme.id);
}

/** El tema por defecto no se borra: los puntos sin override se quedarían sin
 * tema. El backend lo rechaza con POS_THEME_IS_DEFAULT; aquí ni se ofrece. */
function canDelete(theme: PosThemeSummaryDTO): boolean {
  return !theme.isDefault;
}

/* El POS avisa por el socket cuando un tema cambia (lo publica el gateway en la
 * sala de la organización). Recargar la lista es lo único que hace falta: el
 * editor se abre aparte. */
function refresh(): void {
  void store.fetchThemes();
}

onMounted(async () => {
  await store.fetchThemes();
  getSocket()?.on('organization.pos_theme.changed', refresh);
});

onUnmounted(() => {
  getSocket()?.off('organization.pos_theme.changed', refresh);
});
</script>

<template>
  <component :is="props.embedded ? 'div' : 'v-container'">
    <PageHeader
      v-if="!props.embedded"
      :title="$t('posThemes.title')"
      :subtitle="$t('posThemes.intro')"
    >
      <template #actions>
        <v-btn
          v-if="canManage"
          color="primary"
          prepend-icon="mdi-plus"
          :to="'/organization/pos-themes/new'"
        >
          {{ $t('posThemes.new') }}
        </v-btn>
      </template>
    </PageHeader>

    <v-alert
      v-if="store.error"
      type="error"
      closable
      class="mb-4"
      @click:close="store.clearError()"
    >
      {{ store.error }}
      <template v-if="store.errorCode === 'POS_THEME_IN_USE' && store.errorAssignedPointsCount">
        {{ $t('posThemes.inUseHint', { count: store.errorAssignedPointsCount }) }}
      </template>
    </v-alert>

    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        <span class="text-body-1 font-weight-medium">{{ $t('posThemes.listTitle') }}</span>
        <v-btn
          v-if="canManage && props.embedded"
          size="small"
          variant="tonal"
          color="primary"
          prepend-icon="mdi-plus"
          :to="'/organization/pos-themes/new'"
        >
          {{ $t('posThemes.new') }}
        </v-btn>
      </v-card-title>

      <v-list v-if="store.themes.length > 0" density="compact">
        <v-list-item
          v-for="theme in store.themes"
          :key="theme.id"
          @click="openEditor(theme.id)"
        >
          <template #prepend>
            <v-avatar :color="theme.isDefault ? 'lightprimary' : 'grey100'" size="small">
              <span class="text-caption font-weight-bold">{{ theme.name.slice(0, 1).toUpperCase() }}</span>
            </v-avatar>
          </template>

          <v-list-item-title>{{ theme.name }}</v-list-item-title>
          <v-list-item-subtitle class="d-flex align-center ga-2">
            <span class="text-caption">{{ $t('posThemes.version', { version: theme.version }) }}</span>
            <v-chip
              v-if="theme.isDefault"
              size="x-small"
              variant="flat"
              color="lightprimary"
            >
              {{ $t('posThemes.isDefault') }}
            </v-chip>
            <v-chip
              v-else-if="theme.assignedPointsCount > 0"
              size="x-small"
              variant="flat"
              color="lightsuccess"
            >
              {{ $t('posThemes.assignedCount', { count: theme.assignedPointsCount }) }}
            </v-chip>
          </v-list-item-subtitle>

          <template #append>
            <div class="d-flex align-center ga-2" @click.stop>
              <v-btn
                v-if="canManage && !theme.isDefault"
                size="small"
                variant="text"
                prepend-icon="mdi-star-outline"
                @click="store.makeDefault(theme.id)"
              >
                {{ $t('posThemes.makeDefault') }}
              </v-btn>
              <v-btn
                v-if="canManage"
                size="small"
                variant="text"
                prepend-icon="mdi-lan-connect"
                @click="openAssignDialog(theme)"
              >
                {{ $t('posThemes.assign') }}
              </v-btn>
              <v-btn
                v-if="canManage && canDelete(theme)"
                size="small"
                variant="text"
                color="error"
                @click="handleDelete(theme)"
              >
                {{ $t('common.delete') }}
              </v-btn>
            </div>
          </template>
        </v-list-item>
      </v-list>

      <v-card-text v-else-if="store.loading" class="text-medium-emphasis">
        {{ $t('common.loading') }}
      </v-card-text>

      <v-card-text v-else class="text-medium-emphasis">
        {{ $t('posThemes.empty') }}
      </v-card-text>
    </v-card>

    <!-- Dialog: asignar el tema a los puntos POS -->
    <v-dialog v-model="showAssignDialog" max-width="560">
      <v-card>
        <v-card-title>
          {{ $t('posThemes.assignTitle', { name: assignTarget?.name ?? '' }) }}
        </v-card-title>
        <v-card-text>
          <p class="text-body-2 text-medium-emphasis mb-4">
            {{ $t('posThemes.assignHint') }}
          </p>

          <div v-if="assignLoading" class="text-medium-emphasis">
            {{ $t('common.loading') }}
          </div>

          <v-list v-else density="compact">
            <v-list-item v-for="point in posPoints" :key="point.id">
              <v-list-item-title>
                {{ point.name || $t('posThemes.pointFallback', { code: point.code }) }}
              </v-list-item-title>
              <v-list-item-subtitle>
                {{ $t('posThemes.currentTheme', {
                  name: point.posThemeName ?? $t('posThemes.organizationDefault'),
                }) }}
              </v-list-item-subtitle>
              <template #append>
                <v-select
                  v-model="assignSelection[point.id]"
                  :items="[
                    { title: $t('posThemes.useOrganizationDefault'), value: '' },
                    ...store.themes.map((th) => ({ title: th.name, value: th.id })),
                  ]"
                  style="max-width: 240px;"
                />
              </template>
            </v-list-item>
            <v-list-item v-if="posPoints.length === 0">
              <v-list-item-title class="text-medium-emphasis">
                {{ $t('posThemes.noPosPoints') }}
              </v-list-item-title>
            </v-list-item>
          </v-list>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="closeAssignDialog">{{ $t('common.cancel') }}</v-btn>
          <v-btn
            color="primary"
            :loading="store.saving"
            :disabled="assignmentChanges.length === 0"
            @click="saveAssignments"
          >
            {{ $t('common.save') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </component>
</template>
