<script setup lang="ts">
import { computed } from 'vue';
import { useProjectsStore } from '@/stores/projects';
import { fileUrl } from '@/composable/useFileUrl';
import { avatarColor, displayName, initials } from '@/utils/projects';

/** Avatar de una persona del directorio: su foto si la tiene, si no sus iniciales en un color estable. Sin persona: «sin asignar». */
const props = withDefaults(defineProps<{ userId: string | null; size?: number | string; tooltip?: boolean }>(), { size: 28, tooltip: true });

const store = useProjectsStore();
const user = computed(() => (props.userId ? store.users.get(props.userId) : undefined));
const photo = computed(() => (user.value?.avatarFileId ? fileUrl(user.value.avatarFileId) : undefined));
const name = computed(() => displayName(user.value));
</script>

<template>
  <v-tooltip :text="name" :disabled="!tooltip || !name" location="top">
    <template #activator="{ props: tip }">
      <v-avatar v-if="userId" v-bind="tip" :size="size" :color="photo ? undefined : avatarColor(userId)" class="text-body-small font-weight-bold">
        <v-img v-if="photo" :src="photo" :alt="name" cover />
        <span v-else>{{ initials(user) }}</span>
      </v-avatar>
      <v-avatar v-else v-bind="tip" :size="size" class="border-dashed border-sm">
        <v-icon icon="mdi-account-outline" size="small" class="text-medium-emphasis" />
      </v-avatar>
    </template>
  </v-tooltip>
</template>
