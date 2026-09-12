<script setup lang="ts">
/**
 * Bodegas.
 *
 * El modelo aguanta N bodegas por organización, pero al onboarding se
 * aprovisiona una sola y cada establecimiento nuevo recibe la suya
 * automáticamente. Por eso esta pantalla es de configuración y no de uso
 * diario: el menú solo la ofrece cuando hay más de una.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useInventoryStore } from '@/stores/inventory';
import { useOrganizationStore } from '@/stores/organization';
import PageHeader from '@/components/ui/PageHeader.vue';
import type { Warehouse } from '@/types/inventory';

const { t } = useI18n();
const auth = useAuthStore();
const store = useInventoryStore();
const organization = useOrganizationStore();

const canManage = computed(() => auth.can('inventory:manage'));

const dialog = ref(false);
const editing = ref<Warehouse | null>(null);
const form = ref({ code: '', name: '', address: '', establishmentId: null as string | null, isDefault: false });
const formError = ref<string | null>(null);
/** Desactivar es destructivo de cara al usuario aunque el kardex se conserve, y
 *  el resto del proyecto confirma estas acciones con un dialogo (ver clientes).
 *  Disparar al primer clic rompia ese patron. */
const deactivateTarget = ref<Warehouse | null>(null);

const establishmentOptions = computed(() => [
  { title: t('inventory.noEstablishment'), value: null },
  ...organization.establishments.map((e) => ({ title: `${e.code} — ${e.name}`, value: e.id })),
]);

const headers = computed(() => [
  { title: t('inventory.code'), key: 'code', sortable: true, align: 'start' as const },
  { title: t('common.name'), key: 'name', sortable: true, align: 'start' as const },
  { title: t('organization.establishment'), key: 'establishmentId', sortable: false, align: 'start' as const },
  { title: t('common.status'), key: 'status', sortable: false, align: 'start' as const },
  { title: t('common.actions'), key: 'actions', sortable: false, align: 'end' as const },
]);

function establishmentLabel(id: string | null): string {
  if (!id) return '—';
  const e = organization.establishments.find((x) => x.id === id);
  return e ? `${e.code} — ${e.name}` : '—';
}

function openCreate(): void {
  editing.value = null;
  form.value = { code: '', name: '', address: '', establishmentId: null, isDefault: false };
  formError.value = null;
  dialog.value = true;
}

function openEdit(w: Warehouse): void {
  editing.value = w;
  form.value = {
    code: w.code,
    name: w.name,
    address: w.address ?? '',
    establishmentId: w.establishmentId,
    isDefault: w.isDefault,
  };
  formError.value = null;
  dialog.value = true;
}

async function save(): Promise<void> {
  formError.value = null;
  if (!form.value.name.trim()) {
    formError.value = t('inventory.warehouseDialog.nameRequired');
    return;
  }
  if (!editing.value && !form.value.code.trim()) {
    formError.value = t('inventory.warehouseDialog.codeRequired');
    return;
  }

  try {
    if (editing.value) {
      // El código no se edita: es la referencia estable de la bodega y ya está
      // escrito en cada fila del kardex.
      await store.updateWarehouse(editing.value.id, {
        name: form.value.name,
        address: form.value.address || null,
        establishmentId: form.value.establishmentId,
        isDefault: form.value.isDefault,
      });
    } else {
      await store.createWarehouse({
        code: form.value.code,
        name: form.value.name,
        address: form.value.address || null,
        establishmentId: form.value.establishmentId,
        isDefault: form.value.isDefault,
      });
    }
    dialog.value = false;
  } catch {
    // store.error ya tiene el mensaje del backend.
  }
}

async function confirmDeactivate(): Promise<void> {
  if (!deactivateTarget.value) return;
  // El backend rechaza con 422 si queda existencia; no se comprueba aquí para
  // no duplicar la regla ni arriesgarse a que las dos versiones discrepen.
  try {
    await store.deactivateWarehouse(deactivateTarget.value.id);
    deactivateTarget.value = null;
  } catch {
    // store.error ya tiene el mensaje; el dialogo se queda abierto para que
    // se lea el motivo (tipicamente: la bodega todavia tiene existencia).
  }
}

onMounted(async () => {
  await Promise.all([store.fetchWarehouses(), organization.fetchEstablishments()]);
});
</script>

<template>
  <v-container>
    <PageHeader :title="$t('inventory.warehouses')" :subtitle="$t('inventory.warehousesIntro')">
      <template #actions>
        <v-btn variant="text" prepend-icon="mdi-arrow-left" :to="{ name: 'inventory-stock' }">
          {{ $t('common.back') }}
        </v-btn>
        <v-btn v-if="canManage" color="primary" prepend-icon="mdi-plus" @click="openCreate">
          {{ $t('inventory.newWarehouse') }}
        </v-btn>
      </template>
    </PageHeader>

    <v-alert v-if="store.error" type="error" closable class="mb-4" @click:close="store.error = null">
      {{ store.error }}
    </v-alert>

    <v-card>
      <v-data-table
        :headers="headers"
        :items="store.warehouses"
        :loading="store.loading"
        item-value="id"
        :items-per-page="25"
      >
        <template #item.code="{ item }">
          <span class="font-weight-medium">{{ item.code }}</span>
          <v-chip v-if="item.isDefault" size="x-small" variant="flat" color="lightprimary" class="ml-2">
            {{ $t('inventory.defaultWarehouse') }}
          </v-chip>
        </template>

        <template #item.establishmentId="{ item }">
          {{ establishmentLabel(item.establishmentId) }}
        </template>

        <template #item.status="{ item }">
          <v-chip
            size="x-small"
            variant="flat"
            :color="item.status === 'active' ? 'lightsuccess' : 'lightwarning'"
          >
            {{ item.status === 'active' ? $t('common.active') : $t('common.inactive') }}
          </v-chip>
        </template>

        <template #item.actions="{ item }">
          <v-btn
            v-if="canManage"
            size="small"
            variant="text"
            icon="mdi-pencil"
            :title="$t('common.edit')"
            @click="openEdit(item)"
          />
          <v-btn
            v-if="canManage && item.status === 'active' && !item.isDefault"
            size="small"
            variant="text"
            icon="mdi-archive-off-outline"
            :title="$t('inventory.deactivate')"
            @click="deactivateTarget = item"
          />
        </template>

        <template #no-data>
          <div class="text-center text-medium-emphasis pa-6">
            {{ $t('inventory.noWarehouses') }}
          </div>
        </template>
      </v-data-table>
    </v-card>

    <v-dialog
      :model-value="deactivateTarget !== null"
      max-width="480"
      @update:model-value="deactivateTarget = null"
    >
      <v-card v-if="deactivateTarget">
        <v-card-title>{{ $t('inventory.deactivateTitle') }}</v-card-title>
        <v-card-text>
          {{ $t('inventory.deactivateBody', { name: deactivateTarget.code }) }}
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deactivateTarget = null">{{ $t('common.cancel') }}</v-btn>
          <v-btn
            color="error"
            variant="flat"
            :loading="store.saving"
            data-testid="warehouse-deactivate-confirm"
            @click="confirmDeactivate"
          >
            {{ $t('inventory.deactivate') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialog" max-width="520" persistent>
      <v-card>
        <v-card-title>
          {{ editing ? $t('inventory.warehouseDialog.editTitle') : $t('inventory.warehouseDialog.createTitle') }}
        </v-card-title>
        <v-card-text>
          <v-alert v-if="formError" type="error" class="mb-4">
            {{ formError }}
          </v-alert>

          <v-text-field
            v-if="!editing"
            v-model="form.code"
            :label="$t('inventory.code')"
            :hint="$t('inventory.warehouseDialog.codeHint')"
            persistent-hint
            class="mb-4"
            data-testid="warehouse-code"
          />

          <v-text-field v-model="form.name" :label="$t('common.name')" class="mb-4" data-testid="warehouse-name" />

          <v-text-field v-model="form.address" :label="$t('common.address')" class="mb-4" />

          <v-select
            v-model="form.establishmentId"
            :items="establishmentOptions"
            :label="$t('organization.establishment')"
            :hint="$t('inventory.warehouseDialog.establishmentHint')"
            persistent-hint
            class="mb-4"
          />

          <v-switch
            v-model="form.isDefault"
            :label="$t('inventory.warehouseDialog.isDefault')"
            :hint="$t('inventory.warehouseDialog.isDefaultHint')"
            persistent-hint
            color="primary"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="flat" :loading="store.saving" @click="save">
            {{ $t('common.save') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
