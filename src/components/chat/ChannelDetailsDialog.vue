<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { chatApi } from '@/api/chat';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/chat';
import { useProjectsStore } from '@/stores/projects';
import { useConfirm } from '@/composable/useConfirm';
import { useNotify } from '@/composable/useNotify';
import { displayName } from '@/utils/projects';
import { extractError } from '@/utils/error';
import type { ChatMember } from '@/types/chat';
import PresenceAvatar from './PresenceAvatar.vue';

/**
 * Detalles de un canal, como en Slack: «Acerca de» (nombre, tema y descripción) y «Miembros» (quién está, con su presencia; sumar
 * gente y quitarla). Lo que se puede hacer lo decide chat-service (`domain/access.ts`); aquí solo se ofrece lo que tiene sentido:
 *   - editar nombre, tema y descripción, y quitar a otros: el dueño del canal o `chat:admin` (`canManage`);
 *   - sumar personas: cualquier miembro, si el canal no está archivado;
 *   - de #general no se quita a nadie (es de todo el equipo).
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ conversationId: string; canManage: boolean; initialTab?: 'about' | 'members' }>();
const { t, locale } = useI18n();
const { xs } = useDisplay();
const auth = useAuthStore();
const chat = useChatStore();
const directory = useProjectsStore();
const confirm = useConfirm();
const notify = useNotify();

const tab = ref<'about' | 'members'>('about');
const detail = computed(() => chat.details.get(props.conversationId) ?? null);
const myId = computed(() => ((auth.user as { id?: string } | null)?.id ?? '').toLowerCase());

const name = ref('');
const topic = ref('');
const description = ref('');
const saving = ref(false);
const failure = ref<string | null>(null);

const members = ref<ChatMember[]>([]);
const loadingMembers = ref(false);
const filter = ref('');
const toAdd = ref<string[]>([]);
/** El desplegable de «Agregar personas»: se cierra al agregar (si no, queda abierto y vacío sobre la lista). */
const pickerMenu = ref(false);
const adding = ref(false);

watch(open, (v) => {
  if (!v || !detail.value) return;
  tab.value = props.initialTab ?? 'about';
  name.value = detail.value.name ?? '';
  topic.value = detail.value.topic ?? '';
  description.value = detail.value.description ?? '';
  failure.value = null;
  filter.value = '';
  toAdd.value = [];
  void directory.ensureDirectory();
  void loadMembers();
}, { immediate: true });

async function loadMembers(): Promise<void> {
  loadingMembers.value = true;
  try {
    members.value = await chatApi.members(props.conversationId);
    chat.loadPresence(members.value.map((m) => m.userId));
  } catch (e) {
    failure.value = extractError(e);
  } finally {
    loadingMembers.value = false;
  }
}

const canAdd = computed(() => !!detail.value?.isMember && !detail.value.archivedAt);
const canEdit = computed(() => props.canManage && !detail.value?.archivedAt);
const label = (userId: string) => displayName(directory.users.get(userId)) || t('chat.unknownUser');
/** Los miembros activos primero por nombre; los deshabilitados al final (siguen en la lista: sus mensajes se quedan). */
const shown = computed(() => {
  const q = filter.value.trim().toLowerCase();
  return members.value
    .filter((m) => !q || label(m.userId).toLowerCase().includes(q))
    .sort((a, b) => Number(a.inactive) - Number(b.inactive) || label(a.userId).localeCompare(label(b.userId), locale.value));
});
const candidates = computed(() => {
  const inside = new Set(members.value.map((m) => m.userId));
  return directory.directory.filter((u) => !inside.has(u.id)).map((u) => ({ value: u.id, title: displayName(u), subtitle: u.email }));
});
const dirty = computed(
  () => !!detail.value && (name.value.trim() !== (detail.value.name ?? '') || topic.value.trim() !== (detail.value.topic ?? '') || description.value.trim() !== (detail.value.description ?? '')),
);

async function save(): Promise<void> {
  if (!detail.value || !dirty.value) return;
  saving.value = true;
  failure.value = null;
  try {
    await chatApi.update(props.conversationId, {
      // #general no se renombra (el servidor lo rechaza): solo se manda el nombre si cambió.
      ...(name.value.trim() !== (detail.value.name ?? '') ? { name: name.value.trim() } : {}),
      topic: topic.value.trim() || null,
      description: description.value.trim() || null,
    });
    await chat.refreshDetail(props.conversationId);
    notify.success(t('chat.details.saved'));
  } catch (e) {
    failure.value = extractError(e);
  } finally {
    saving.value = false;
  }
}

async function add(): Promise<void> {
  if (!toAdd.value.length) return;
  adding.value = true;
  failure.value = null;
  try {
    members.value = await chatApi.addMembers(props.conversationId, toAdd.value);
    chat.loadPresence(toAdd.value);
    toAdd.value = [];
    pickerMenu.value = false;
    await chat.refreshDetail(props.conversationId);
  } catch (e) {
    failure.value = extractError(e);
  } finally {
    adding.value = false;
  }
}

async function remove(m: ChatMember): Promise<void> {
  const who = label(m.userId);
  if (!(await confirm({ title: t('chat.details.removeTitle', { name: who }), text: t('chat.details.removeText'), confirmText: t('chat.details.removeConfirm'), destructive: true }))) return;
  try {
    await chatApi.removeMember(props.conversationId, m.userId);
    members.value = members.value.filter((x) => x.userId !== m.userId);
    await chat.refreshDetail(props.conversationId);
  } catch (e) {
    notify.error(extractError(e));
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="600" :fullscreen="xs" scrollable>
    <v-card v-if="detail">
      <v-card-title class="d-flex align-center ga-2">
        <v-icon :icon="detail.visibility === 'private' ? 'mdi-lock-outline' : 'mdi-pound'" size="small" />
        <span class="flex-grow-1 text-truncate">{{ detail.name }}</span>
        <v-btn icon="mdi-close" variant="text" size="small" :aria-label="t('common.close')" @click="open = false" />
      </v-card-title>
      <v-tabs v-model="tab" class="px-4">
        <v-tab value="about">{{ t('chat.details.about') }}</v-tab>
        <v-tab value="members">{{ t('chat.details.members', { n: detail.memberCount }) }}</v-tab>
      </v-tabs>
      <v-divider />
      <v-card-text :style="{ minHeight: '320px' }">
        <v-alert v-if="failure" type="error" class="mb-4" :text="failure" />
        <v-window v-model="tab">
          <v-window-item value="about">
            <div class="d-flex flex-column ga-4">
              <v-text-field
                v-model="name"
                :label="t('chat.newChannel.name')"
                :prefix="detail.visibility === 'private' ? undefined : '#'"
                :hint="detail.isGeneral ? t('chat.details.generalName') : canEdit ? t('chat.newChannel.nameHint') : undefined"
                persistent-hint
                :readonly="!canEdit || detail.isGeneral"
                maxlength="80"
              />
              <v-text-field v-model="topic" :label="t('chat.details.topic')" :readonly="!canEdit" maxlength="250" />
              <v-textarea v-model="description" :label="t('chat.details.description')" :readonly="!canEdit" rows="3" auto-grow maxlength="1000" />
              <div class="text-body-small text-medium-emphasis">
                {{ t('chat.details.created', { name: label(detail.createdBy), date: new Date(detail.createdAt).toLocaleDateString(locale, { dateStyle: 'long' }) }) }}
                · {{ t(detail.visibility === 'private' ? 'chat.newChannel.privateHint' : 'chat.newChannel.publicHint') }}
              </div>
              <div v-if="!canEdit" class="text-body-small text-medium-emphasis">{{ t('chat.details.onlyOwner') }}</div>
            </div>
          </v-window-item>

          <v-window-item value="members">
            <div v-if="canAdd" class="d-flex align-start ga-2 mb-4">
              <v-autocomplete v-model="toAdd" v-model:menu="pickerMenu" :items="candidates" :label="t('chat.details.addPeople')" multiple chips closable-chips hide-details class="flex-grow-1">
                <template #item="{ props: item, item: option }">
                  <v-list-item v-bind="item" :subtitle="option.subtitle" />
                </template>
              </v-autocomplete>
              <v-btn color="primary" variant="flat" :disabled="!toAdd.length" :loading="adding" class="mt-2" @click="add">{{ t('chat.details.add') }}</v-btn>
            </div>
            <v-text-field v-if="members.length > 8" v-model="filter" :placeholder="t('chat.details.filter')" prepend-inner-icon="mdi-magnify" hide-details class="mb-2" />
            <div v-if="loadingMembers" class="d-flex justify-center pa-6"><v-progress-circular indeterminate color="primary" /></div>
            <v-list v-else density="compact">
              <v-list-item v-for="m in shown" :key="m.userId" :data-member="m.userId" :class="{ 'text-disabled': m.inactive }">
                <template #prepend>
                  <PresenceAvatar :user-id="m.userId" :size="32" class="mr-3" />
                </template>
                <v-list-item-title>
                  {{ label(m.userId) }}<span v-if="m.userId === myId" class="text-medium-emphasis"> ({{ t('chat.you') }})</span>
                </v-list-item-title>
                <v-list-item-subtitle v-if="m.inactive">{{ t('chat.details.inactive') }}</v-list-item-subtitle>
                <template #append>
                  <v-chip v-if="m.role === 'owner'" size="small" class="mr-2">{{ t('chat.details.owner') }}</v-chip>
                  <v-btn
                    v-if="canManage && !detail.isGeneral && m.userId !== myId"
                    icon="mdi-account-remove-outline"
                    variant="text"
                    size="small"
                    :aria-label="t('chat.details.remove', { name: label(m.userId) })"
                    @click="remove(m)"
                  />
                </template>
              </v-list-item>
            </v-list>
          </v-window-item>
        </v-window>
      </v-card-text>
      <v-card-actions v-if="tab === 'about' && canEdit">
        <v-spacer />
        <v-btn variant="text" @click="open = false">{{ t('common.cancel') }}</v-btn>
        <v-btn color="primary" variant="flat" :disabled="!dirty" :loading="saving" @click="save">{{ t('common.save') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
