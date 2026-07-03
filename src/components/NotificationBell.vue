<template>
  <v-menu min-width="280" transition="slide-y-transition" location="bottom center" :offset="[0, 8]">
    <template #activator="{ props }">
      <v-btn icon v-bind="props">
        <v-badge dot color="error" offset="-2">
          <v-icon icon="mdi-bell-outline" />
        </v-badge>
      </v-btn>
    </template>
    <v-card>
      <v-card-text class="text-center text-medium-emphasis pa-8">
        <v-icon icon="mdi-bell-off-outline" size="48" class="mb-4" />
        <p class="text-body-2">Sin notificaciones</p>
      </v-card-text>
    </v-card>
  </v-menu>
</template>
