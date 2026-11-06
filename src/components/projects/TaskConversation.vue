<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatRelative } from '@/utils/format';
import { useAuthStore } from '@/stores/auth';
import { useProjectsStore } from '@/stores/projects';
import { displayName } from '@/utils/projects';
import type { RichDoc, TaskComment } from '@/types/projects';
import RichTextEditor from './RichTextEditor.vue';
import RichTextView from './RichTextView.vue';
import UserAvatar from './UserAvatar.vue';

/**
 * Los comentarios de la tarea, en orden de fecha, con la caja para comentar al pie (Ctrl+Enter envía). El historial de cambios va
 * aparte, al final del panel (TaskActivity). Siempre visible: no se pliega.
 *
 * El borrador vive en el store, por tarea (`commentDrafts`): un clic fuera del panel lo cierra y, cuando el borrador era de este
 * componente, se perdía lo escrito. Los comentarios borrados dejan su hueco; editar o borrar un comentario lo hace su autor (el
 * servidor además deja borrar al administrador del proyecto).
 */
const { t } = useI18n();
const store = useProjectsStore();
const auth = useAuthStore();

const composer = ref<InstanceType<typeof RichTextEditor> | null>(null);
const sending = ref(false);
const editingId = ref<string | null>(null);
const editDraft = ref<RichDoc | null>(null);

const draft = computed<RichDoc | null>({
  get: () => (store.detail ? (store.commentDrafts[store.detail.id] ?? null) : null),
  set: (doc) => {
    if (store.detail) store.setCommentDraft(store.detail.id, doc);
  },
});

const me = computed(() => auth.user?.id ?? '');
const name = (id: string | null) => (id ? displayName(store.users.get(id)) || t('projects.share.unknownUser') : t('projects.activity.system'));
const comments = computed<TaskComment[]>(() => [...(store.detail?.comments ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
const relative = (iso: string) => formatRelative(iso);

async function send(): Promise<void> {
  const task = store.detail;
  if (!task || !draft.value || composer.value?.isEmpty() || sending.value) return;
  sending.value = true;
  try {
    await store.addComment(draft.value);
    store.setCommentDraft(task.id, null);
    composer.value?.clear();
  } catch {
    // El aviso lo deja el store; el borrador se conserva para reintentar.
  } finally {
    sending.value = false;
  }
}

function startEdit(c: TaskComment): void {
  editingId.value = c.id;
  editDraft.value = c.bodyDoc;
}

async function saveEdit(): Promise<void> {
  if (!editingId.value || !editDraft.value) return;
  try {
    await store.editComment(editingId.value, editDraft.value);
    editingId.value = null;
  } catch {
    // El aviso lo deja el store.
  }
}

async function remove(c: TaskComment): Promise<void> {
  try {
    await store.deleteComment(c.id);
  } catch {
    // El aviso lo deja el store.
  }
}

// Tab+K: a la caja de comentar.
defineExpose({
  focus: async () => {
    await nextTick();
    composer.value?.focus();
  },
});
</script>

<template>
  <div v-if="store.detail">
    <div class="text-body-large font-weight-medium mb-2">{{ t('projects.conversation.title') }} ({{ comments.length }})</div>

      <div class="d-flex flex-column ga-2">
        <div v-if="!comments.length" class="text-body-medium text-medium-emphasis">{{ t('projects.conversation.empty') }}</div>
        <div v-for="c in comments" :key="c.id" class="d-flex ga-2">
          <UserAvatar :user-id="c.authorUserId" :size="32" />
          <div class="flex-grow-1">
            <div class="d-flex align-center ga-2">
              <span class="text-body-medium font-weight-medium">{{ name(c.authorUserId) }}</span>
              <span class="text-body-small text-medium-emphasis">
                {{ relative(c.createdAt) }}<template v-if="c.editedAt"> · {{ t('projects.conversation.edited') }}</template>
              </span>
              <v-spacer />
              <template v-if="!c.deleted">
                <v-btn
                  :prepend-icon="c.likedBy.includes(me) ? 'mdi-thumb-up' : 'mdi-thumb-up-outline'"
                  :color="c.likedBy.includes(me) ? 'primary' : undefined"
                  variant="text"
                  size="x-small"
                  :disabled="!store.detail.canComment"
                  :aria-label="t('projects.like')"
                  @click="store.toggleCommentLike(c, me)"
                >
                  {{ c.likedBy.length || '' }}
                </v-btn>
                <v-menu v-if="c.authorUserId === me">
                  <template #activator="{ props: menu }">
                    <v-btn v-bind="menu" icon="mdi-dots-horizontal" variant="text" size="x-small" :aria-label="t('projects.menu')" />
                  </template>
                  <v-list density="compact">
                    <v-list-item prepend-icon="mdi-pencil-outline" :title="t('common.edit')" @click="startEdit(c)" />
                    <v-list-item prepend-icon="mdi-trash-can-outline" :title="t('common.delete')" @click="remove(c)" />
                  </v-list>
                </v-menu>
              </template>
            </div>
            <div v-if="c.deleted" class="text-body-medium text-medium-emphasis font-italic">{{ t('projects.conversation.deleted') }}</div>
            <div v-else-if="editingId === c.id" class="d-flex flex-column ga-2">
              <RichTextEditor v-model="editDraft" :toolbar="false" autofocus @submit="saveEdit" />
              <div class="d-flex ga-2 justify-end">
                <v-btn variant="text" size="small" @click="editingId = null">{{ t('common.cancel') }}</v-btn>
                <v-btn color="primary" size="small" @click="saveEdit">{{ t('common.save') }}</v-btn>
              </div>
            </div>
            <RichTextView v-else :doc="c.bodyDoc" class="text-body-medium" />
          </div>
        </div>
      </div>

      <div v-if="store.detail.canComment" class="d-flex flex-column ga-2 mt-4">
        <RichTextEditor ref="composer" v-model="draft" :placeholder="t('projects.conversation.placeholder')" :toolbar="false" @submit="send" />
        <div class="d-flex align-center ga-2">
          <span class="text-body-small text-medium-emphasis">{{ t('projects.conversation.hint') }}</span>
          <v-spacer />
          <v-btn color="primary" size="small" :loading="sending" @click="send">{{ t('projects.conversation.send') }}</v-btn>
        </div>
      </div>
  </div>
</template>
