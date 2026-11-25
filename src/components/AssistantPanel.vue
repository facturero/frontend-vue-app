<script setup lang="ts">
/**
 * Dónde se ve el asistente: en un panel lateral que no se lleva por delante la pantalla en la que estás trabajando, o en un
 * diálogo grande para conversaciones largas (listas de stock, cobranza, informes). Los dos muestran el mismo chat
 * (`AssistantChat.vue`) sobre el mismo store: pasar de uno a otro no pierde la conversación ni lo que estabas escribiendo.
 */
import { computed, onBeforeUnmount, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { useAssistantStore } from '@/stores/assistant';
import AssistantChat from '@/components/AssistantChat.vue';

const store = useAssistantStore();
const { mobile } = useDisplay();

// Cerrar cualquiera de los dos cierra el asistente; el tamaño elegido se recuerda para la próxima vez que se abra.
const panelOpen = computed({
  get: () => store.open && !store.expanded,
  set: (value: boolean) => {
    if (!value) store.open = false;
  },
});
const dialogOpen = computed({
  get: () => store.open && store.expanded,
  set: (value: boolean) => {
    if (!value) store.open = false;
  },
});

// Mientras el asistente está abierto (panel o diálogo) se vigila si hay servidores de IA; cerrado, no se gasta nada.
watch(() => store.open, (open) => store.watchStatus(open), { immediate: true });
onBeforeUnmount(() => store.watchStatus(false));

function toggleSize(): void {
  store.expanded = !store.expanded;
}
</script>

<template>
  <v-navigation-drawer
    v-model="panelOpen"
    location="right"
    temporary
    width="420"
    :scrim="false"
    class="assistant-drawer"
  >
    <AssistantChat v-if="panelOpen" :expanded="false" @toggle-size="toggleSize" @close="store.open = false" />
  </v-navigation-drawer>

  <!-- R-20: «Extra» (880) es el tamaño más ancho permitido; en el teléfono, pantalla completa (R-96). -->
  <v-dialog v-model="dialogOpen" max-width="880" :fullscreen="mobile" scrollable>
    <v-card :height="mobile ? undefined : '85vh'" data-testid="assistant-dialog">
      <AssistantChat v-if="dialogOpen" expanded @toggle-size="toggleSize" @close="store.open = false" />
    </v-card>
  </v-dialog>
</template>
