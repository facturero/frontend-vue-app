<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useProjectsStore } from '@/stores/projects';
import { displayName } from '@/utils/projects';
import type { ProjectRole } from '@/types/projects';
import UserAvatar from './UserAvatar.vue';

/**
 * «Compartir» de Asana: quién está en el proyecto y con qué rol. Solo el administrador del proyecto suma, cambia o quita gente;
 * cualquiera puede salirse. El servidor impide dejar el proyecto sin administrador.
 */
const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [boolean]; left: [] }>();

const { t } = useI18n();
const store = useProjectsStore();
const auth = useAuthStore();

const ROLES: ProjectRole[] = ['admin', 'editor', 'commenter', 'viewer'];
const roleItems = computed(() => ROLES.map((r) => ({ value: r, title: t(`projects.roles.${r}`), subtitle: t(`projects.roles.${r}Hint`) })));

const newUser = ref<string | null>(null);
const newRole = ref<ProjectRole>('editor');
const busy = ref(false);
const failure = ref<string | null>(null);

const members = computed(() => store.current?.members ?? []);
const candidates = computed(() => {
  const inside = new Set(members.value.map((m) => m.userId));
  return store.directory.filter((u) => !inside.has(u.id)).map((u) => ({ value: u.id, title: displayName(u), subtitle: u.email }));
});

async function run(work: () => Promise<void>): Promise<void> {
  busy.value = true;
  failure.value = null;
  try {
    await work();
  } catch {
    failure.value = store.notice;
  } finally {
    busy.value = false;
  }
}

const add = () =>
  run(async () => {
    if (!newUser.value) return;
    await store.addMember(newUser.value, newRole.value);
    newUser.value = null;
  });

const leave = () =>
  run(async () => {
    await store.removeMember(auth.user!.id);
    emit('update:modelValue', false);
    emit('left');
  });
</script>

<template>
  <v-dialog :model-value="props.modelValue" max-width="640" @update:model-value="emit('update:modelValue', $event)">
    <v-card>
      <v-card-title>{{ t('projects.share.title', { name: store.current?.name }) }}</v-card-title>
      <v-card-subtitle>
        {{ store.current?.visibility === 'members' ? t('projects.visibility.membersHint') : t('projects.visibility.organizationHint') }}
      </v-card-subtitle>
      <v-card-text class="d-flex flex-column ga-4">
        <v-alert v-if="failure" type="error">{{ failure }}</v-alert>

        <div v-if="store.canManage" class="d-flex flex-column flex-sm-row ga-2">
          <v-autocomplete
            v-model="newUser"
            :items="candidates"
            :label="t('projects.share.addPerson')"
            :no-data-text="t('projects.share.noCandidates')"
            class="flex-grow-1"
          />
          <v-select v-model="newRole" :items="roleItems" :label="t('projects.share.role')" class="flex-grow-0" min-width="150" />
          <v-btn color="primary" :disabled="!newUser" :loading="busy" @click="add">{{ t('common.add') }}</v-btn>
        </div>

        <v-list lines="two">
          <v-list-item v-for="m in members" :key="m.userId">
            <template #prepend>
              <UserAvatar :user-id="m.userId" :size="36" :tooltip="false" class="mr-4" />
            </template>
            <v-list-item-title>
              {{ displayName(store.users.get(m.userId)) || t('projects.share.unknownUser') }}
              <span v-if="m.userId === auth.user?.id" class="text-medium-emphasis">({{ t('projects.share.you') }})</span>
            </v-list-item-title>
            <v-list-item-subtitle>{{ store.users.get(m.userId)?.email }}</v-list-item-subtitle>
            <template #append>
              <div class="d-flex align-center ga-2">
                <v-select
                  v-if="store.canManage"
                  :model-value="m.role"
                  :items="roleItems"
                  min-width="150"
                  :disabled="busy"
                  @update:model-value="(r: ProjectRole) => run(() => store.updateMember(m.userId, r))"
                />
                <v-chip v-else size="small">{{ t(`projects.roles.${m.role}`) }}</v-chip>
                <v-btn
                  v-if="store.canManage && m.userId !== auth.user?.id"
                  icon="mdi-close"
                  variant="text"
                  size="small"
                  :aria-label="t('projects.share.remove')"
                  :disabled="busy"
                  @click="run(() => store.removeMember(m.userId))"
                />
              </div>
            </template>
          </v-list-item>
        </v-list>
      </v-card-text>
      <v-card-actions class="flex-wrap ga-2">
        <v-btn v-if="store.current?.isMember" variant="text" color="error" :disabled="busy" @click="leave">{{ t('projects.share.leave') }}</v-btn>
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">{{ t('common.close') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
