<script setup lang="ts">
import { formatMinutes } from '@/utils/duration';
import { formatDate } from '@/utils/format';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useProjectsStore } from '@/stores/projects';
import { displayName } from '@/utils/projects';
import type { RichDoc, TaskActivity, TaskComment } from '@/types/projects';
import RichTextEditor from './RichTextEditor.vue';
import RichTextView from './RichTextView.vue';
import UserAvatar from './UserAvatar.vue';

/**
 * El hilo de la tarea, como en Asana: comentarios e historial intercalados por fecha, y la caja para comentar al pie (Ctrl+Enter
 * envía). Los comentarios borrados dejan su hueco; editar o borrar un comentario lo hace su autor (el servidor además deja borrar
 * al administrador del proyecto).
 */
const { t, locale } = useI18n();
const store = useProjectsStore();
const auth = useAuthStore();

const draft = ref<RichDoc | null>(null);
const composer = ref<InstanceType<typeof RichTextEditor> | null>(null);
const sending = ref(false);
const editingId = ref<string | null>(null);
const editDraft = ref<RichDoc | null>(null);
const showActivity = ref(true);

const me = computed(() => auth.user?.id ?? '');
const name = (id: string | null) => (id ? displayName(store.users.get(id)) || t('projects.share.unknownUser') : t('projects.activity.system'));

type Entry = { type: 'comment'; at: string; comment: TaskComment } | { type: 'activity'; at: string; activity: TaskActivity };

const entries = computed<Entry[]>(() => {
  const d = store.detail;
  if (!d) return [];
  const list: Entry[] = d.comments.map((c) => ({ type: 'comment', at: c.createdAt, comment: c }));
  if (showActivity.value) list.push(...d.activity.map((a): Entry => ({ type: 'activity', at: a.at, activity: a })));
  return list.sort((a, b) => a.at.localeCompare(b.at));
});

const relative = (iso: string) => {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  if (abs < 7 * 86400) return rtf.format(Math.round(seconds / 86400), 'day');
  return formatDate(iso);
};

const date = (value: unknown) => {
  if (typeof value !== 'string' || !value) return '';
  return formatDate(value);
};

/** Texto de una línea del historial. Las claves y sus datos los define projects-service (application/activity.ts). */
function describe(a: TaskActivity): string {
  const d = a.data;
  switch (a.kind) {
    case 'assigned':
      return t('projects.activity.assigned', { to: name(String(d.to ?? '')) });
    case 'due_changed':
      return d.to ? t('projects.activity.dueChanged', { to: date(d.to) }) : t('projects.activity.dueRemoved');
    case 'start_changed':
      return d.to ? t('projects.activity.startChanged', { to: date(d.to) }) : t('projects.activity.startRemoved');
    case 'title_changed':
      return t('projects.activity.titleChanged', { to: String(d.to ?? '') });
    case 'moved':
      return t('projects.activity.moved', { from: String(d.from ?? ''), to: String(d.to ?? '') });
    case 'approval_decided':
      return t(`projects.approval.decided.${String(d.decision)}`);
    case 'kind_changed':
      return t(`projects.activity.kindChanged.${String(d.to)}`);
    case 'dependency_added':
      return t('projects.activity.dependencyAdded', { task: String(d.dependsOn ?? '') });
    case 'dependency_removed':
      return t('projects.activity.dependencyRemoved', { task: String(d.dependsOn ?? '') });
    case 'rule_applied':
      return d.error ? t('projects.activity.ruleFailed', { rule: String(d.rule ?? '') }) : t('projects.activity.ruleApplied', { rule: String(d.rule ?? '') });
    case 'form_submitted':
      return t('projects.activity.formSubmitted', { form: String(d.form ?? '') });
    case 'time_logged':
      return t('projects.activity.timeLogged', { amount: formatMinutes(Number(d.minutes ?? 0)) });
    case 'estimate_changed':
      return d.to ? t('projects.activity.estimateChanged', { amount: formatMinutes(Number(d.to)) }) : t('projects.activity.estimateRemoved');
    case 'link_added':
      return t('projects.activity.linkAdded', { what: t(`projects.links.type.${String(d.entityType)}`), label: String(d.label ?? '') });
    case 'link_removed':
      return t('projects.activity.linkRemoved', { what: t(`projects.links.type.${String(d.entityType)}`), label: String(d.label ?? '') });
    case 'field_set':
      return d.value === null || d.value === undefined
        ? t('projects.activity.fieldCleared', { field: String(d.field ?? '') })
        : t('projects.activity.fieldSet', { field: String(d.field ?? ''), value: String(d.value) });
    case 'attachment_added':
    case 'attachment_removed':
      return t(`projects.activity.${a.kind === 'attachment_added' ? 'attachmentAdded' : 'attachmentRemoved'}`, { file: String(d.fileName ?? '') });
    default:
      return t(`projects.activity.${({ created: 'created', unassigned: 'unassigned', completed: 'completed', reopened: 'reopened', description_changed: 'descriptionChanged' } as Record<string, string>)[a.kind] ?? 'changed'}`);
  }
}

async function send(): Promise<void> {
  if (!draft.value || composer.value?.isEmpty() || sending.value) return;
  sending.value = true;
  try {
    await store.addComment(draft.value);
    draft.value = null;
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

defineExpose({ focus: () => composer.value?.focus() });
</script>

<template>
  <div v-if="store.detail">
    <div class="d-flex align-center mb-2">
      <span class="text-body-large font-weight-medium">{{ t('projects.conversation.title') }}</span>
      <v-spacer />
      <v-switch v-model="showActivity" :label="t('projects.conversation.showActivity')" class="flex-grow-0" />
    </div>

    <div class="d-flex flex-column ga-2">
      <template v-for="e in entries" :key="e.type === 'comment' ? e.comment.id : e.activity.id">
        <div v-if="e.type === 'activity'" class="d-flex align-center ga-2 text-body-small text-medium-emphasis">
          <v-icon icon="mdi-history" size="x-small" />
          <span>
            <strong>{{ name(e.activity.actorUserId) }}</strong> {{ describe(e.activity) }} · {{ relative(e.activity.at) }}
          </span>
        </div>

        <div v-else class="d-flex ga-2">
          <UserAvatar :user-id="e.comment.authorUserId" :size="32" />
          <div class="flex-grow-1">
            <div class="d-flex align-center ga-2">
              <span class="text-body-medium font-weight-medium">{{ name(e.comment.authorUserId) }}</span>
              <span class="text-body-small text-medium-emphasis">
                {{ relative(e.comment.createdAt) }}<template v-if="e.comment.editedAt"> · {{ t('projects.conversation.edited') }}</template>
              </span>
              <v-spacer />
              <template v-if="!e.comment.deleted">
                <v-btn
                  :prepend-icon="e.comment.likedBy.includes(me) ? 'mdi-thumb-up' : 'mdi-thumb-up-outline'"
                  :color="e.comment.likedBy.includes(me) ? 'primary' : undefined"
                  variant="text"
                  size="x-small"
                  :disabled="!store.detail.canComment"
                  :aria-label="t('projects.like')"
                  @click="store.toggleCommentLike(e.comment, me)"
                >
                  {{ e.comment.likedBy.length || '' }}
                </v-btn>
                <v-menu v-if="e.comment.authorUserId === me">
                  <template #activator="{ props: menu }">
                    <v-btn v-bind="menu" icon="mdi-dots-horizontal" variant="text" size="x-small" :aria-label="t('projects.menu')" />
                  </template>
                  <v-list density="compact">
                    <v-list-item prepend-icon="mdi-pencil-outline" :title="t('common.edit')" @click="startEdit(e.comment)" />
                    <v-list-item prepend-icon="mdi-trash-can-outline" :title="t('common.delete')" @click="remove(e.comment)" />
                  </v-list>
                </v-menu>
              </template>
            </div>
            <div v-if="e.comment.deleted" class="text-body-medium text-medium-emphasis font-italic">{{ t('projects.conversation.deleted') }}</div>
            <div v-else-if="editingId === e.comment.id" class="d-flex flex-column ga-2">
              <RichTextEditor v-model="editDraft" :toolbar="false" autofocus @submit="saveEdit" />
              <div class="d-flex ga-2 justify-end">
                <v-btn variant="text" size="small" @click="editingId = null">{{ t('common.cancel') }}</v-btn>
                <v-btn color="primary" size="small" @click="saveEdit">{{ t('common.save') }}</v-btn>
              </div>
            </div>
            <RichTextView v-else :doc="e.comment.bodyDoc" class="text-body-medium" />
          </div>
        </div>
      </template>
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
