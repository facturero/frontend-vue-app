<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useDisplay } from 'vuetify';
import { useUiStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import { usePluginsStore } from '@/stores/plugins';
import { getNavigationTree, isNavGroup, isNavItemActive, type NavItem } from '@/menus/navigation';
import NavLeaf from './AppNavLeaf.vue';

const ui = useUiStore();
const auth = useAuthStore();
const plugins = usePluginsStore();
const { mobile } = useDisplay();
const route = useRoute();

const allowedWhenBlocked = ['/profile', '/organization/settings'];

type Item = NavItem & { blocked: boolean };
type Entry = { kind: 'item'; item: Item } | { kind: 'group'; id: string; titleKey: string; icon: string; items: Item[] };

const visible = (item: NavItem): boolean => (!item.permission || auth.can(item.permission)) && plugins.isActive(item.plugin);
const withBlock = (item: NavItem): Item => ({ ...item, blocked: auth.needsOrgSetup && !allowedWhenBlocked.includes(item.to ?? '') });

/**
 * El menú agrupado (menus/navigation.ts), con lo que esta persona puede abrir. Un grupo sin pantallas visibles no sale, y uno con una
 * sola se pinta como esa pantalla: un desplegable para un único destino es un clic de más.
 */
const entries = computed<Entry[]>(() =>
  getNavigationTree().flatMap((entry): Entry[] => {
    if (!isNavGroup(entry)) return visible(entry) ? [{ kind: 'item', item: withBlock(entry) }] : [];
    const items = entry.items.filter(visible).map(withBlock);
    if (items.length === 0) return [];
    if (items.length === 1) return [{ kind: 'item', item: items[0]! }];
    return [{ kind: 'group', id: entry.id, titleKey: entry.titleKey, icon: entry.icon, items }];
  }),
);

/** Administración va al final, separada del trabajo diario. */
const mainEntries = computed(() => entries.value.filter((e) => !(e.kind === 'group' && e.id === 'admin')));
const adminEntry = computed(() => entries.value.find((e) => e.kind === 'group' && e.id === 'admin'));

const activeGroupId = computed(() => {
  const g = entries.value.find((e) => e.kind === 'group' && e.items.some((i) => isNavItemActive(i, route.path)));
  return g?.kind === 'group' ? g.id : null;
});

// ── Grupos abiertos ─────────────────────────────────────────────────────────
// Colapsado (rail sin el ratón encima) se ve un icono por grupo y ninguno abierto: si no, las pantallas del grupo abierto volvían a
// llenar la columna de iconos. Expandido, queda abierto el grupo de la pantalla actual o el que la persona abrió.
// Lo abierto a mano no se guarda entre recargas: se guardaba en localStorage y, al recargar o volver a entrar, ganaba sobre el área
// de la pantalla (en Mis tareas se abría Administración y Proyectos quedaba cerrado). Con acordeón, recordarlo no aportaba nada.
const userOpened = ref<string[]>([]);

// Al llegar a una pantalla de otra área, se abre esa área: lo que se abrió a mano era para buscar, no para quedarse.
watch(activeGroupId, (id, previous) => {
  if (id !== previous) userOpened.value = [];
});

const hovering = ref(false);
const collapsed = computed(() => !mobile.value && ui.rail && !hovering.value);

/**
 * Acordeón: un grupo abierto a la vez. Con todos abiertos el menú volvía a medir lo mismo que la lista de 22 pantallas que se quería
 * evitar. Al abrir uno se cierra el anterior; si no hay ninguno elegido, queda abierto el de la pantalla actual.
 */
const opened = computed<string[]>({
  get: () => {
    if (collapsed.value) return [];
    const chosen = userOpened.value[0] ?? activeGroupId.value;
    return chosen ? [chosen] : [];
  },
  set: (value) => {
    if (collapsed.value) return;
    const current = userOpened.value[0] ?? activeGroupId.value;
    const added = value.filter((id) => id !== current);
    // Lo recién abierto manda; si solo se cerró el abierto, no queda ninguno (ni siquiera el de la pantalla actual).
    userOpened.value = added.length ? [added.at(-1)!] : value.length ? [value[0]!] : ['none'];
  },
});
</script>

<template>
  <v-navigation-drawer v-model="ui.drawer" :rail="!mobile && ui.rail" :permanent="!mobile" :temporary="mobile"
    expand-on-hover @mouseenter="hovering = true" @mouseleave="hovering = false">
    <!-- La columna no se desplaza entera: se desplaza la parte principal (flex-grow-1 + overflow) y Administración queda fija al
         pie. Antes el contenedor tenía el scroll pero las listas se encogían para caber (v-list trae overflow: hidden), así que con
         varios grupos abiertos lo último quedaba debajo de la pantalla sin forma de llegar. -->
    <div class="d-flex flex-column h-100 overflow-hidden">
      <!-- Sin `color`: el ítem activo se pinta como píldora sólida (ver <style>). -->
      <v-list v-model:opened="opened" nav density="compact" class="flex-grow-1 overflow-y-auto overflow-x-hidden nav-scroll">
        <v-list-item prepend-icon="mdi-alpha-c-circle" :title="$t('nav.brand')" :subtitle="$t('nav.brandSubtitle')"
          class="drawer-brand" />
        <v-divider class="mb-2" />

        <template v-for="entry in mainEntries" :key="entry.kind === 'item' ? entry.item.titleKey : entry.id">
          <NavLeaf v-if="entry.kind === 'item'" :item="entry.item" />
          <v-list-group v-else :value="entry.id">
            <template #activator="{ props: activator }">
              <!-- Colapsado, el grupo de la pantalla actual se marca entero (sus pantallas no se ven); expandido, solo su nombre en color. -->
              <v-list-item v-bind="activator" :prepend-icon="entry.icon" :title="$t(entry.titleKey)" rounded="lg"
                :active="collapsed && activeGroupId === entry.id"
                :class="{ 'text-primary': !collapsed && activeGroupId === entry.id }" />
            </template>
            <NavLeaf v-for="item in entry.items" :key="item.titleKey" :item="item" />
          </v-list-group>
        </template>
      </v-list>

      <v-list v-if="adminEntry && adminEntry.kind === 'group'" v-model:opened="opened" nav density="compact" class="flex-shrink-0">
        <v-divider class="mb-2" />
        <v-list-group :value="adminEntry.id">
          <template #activator="{ props: activator }">
            <v-list-item v-bind="activator" :prepend-icon="adminEntry.icon" :title="$t(adminEntry.titleKey)" rounded="lg"
              :active="collapsed && activeGroupId === adminEntry.id"
              :class="{ 'text-primary': !collapsed && activeGroupId === adminEntry.id }" />
          </template>
          <NavLeaf v-for="item in adminEntry.items" :key="item.titleKey" :item="item" />
        </v-list-group>
      </v-list>
    </div>
  </v-navigation-drawer>
</template>

<style scoped>
.drawer-brand {
  min-height: 64px;
}

/* Sin `min-height: 0` un hijo flex no baja de la altura de su contenido y el `overflow` nunca entra en juego. */
.nav-scroll {
  min-height: 0;
}

/*
 * Ítem activo como píldora sólida en vez del resaltado tenue de Vuetify.
 * `!important` es necesario: Vuetify aplica el suyo con mayor especificidad
 * mediante la capa de overlay del propio v-list-item.
 */
.v-list-item--active {
  background-color: rgb(var(--v-theme-primary)) !important;
  color: rgb(var(--v-theme-on-primary)) !important;
}

.v-list-item--active :deep(.v-list-item__overlay) {
  opacity: 0;
}
</style>
