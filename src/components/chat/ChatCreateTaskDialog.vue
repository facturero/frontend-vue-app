<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/chat';
import { useProjectsStore } from '@/stores/projects';
import { useNotify } from '@/composable/useNotify';
import { projectsApi } from '@/api/projects';
import { displayName } from '@/utils/projects';
import { extractError } from '@/utils/error';
import type { RichDoc } from '@/types/projects';
import type { ChatMessage } from '@/types/chat';
import DateField from '@/components/ui/DateField.vue';

/**
 * «Crear tarea» desde un mensaje (menú ⋯): título con el texto del mensaje, responsable (yo, por defecto) y fecha. La tarea se crea con
 * la API de Proyectos (queda en «Mis tareas» del responsable, sin proyecto) con el mensaje citado y su enlace en la descripción, y en
 * el hilo del mensaje se responde con la tarjeta de la tarea: quien lo escribió ve que alguien se hizo cargo. chat-service no sabe
 * nada de Proyectos (IMPLEMENTATION.md, «Integración con el CRM»).
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ message: ChatMessage }>();
const { t } = useI18n();
const auth = useAuthStore();
const chat = useChatStore();
const directory = useProjectsStore();
const notify = useNotify();

const MAX_TITLE = 200;
const title = ref('');
const assignee = ref<string | null>(null);
const dueOn = ref<string | null>(null);
const busy = ref(false);
const failure = ref<string | null>(null);

const myId = computed(() => ((auth.user as { id?: string } | null)?.id ?? '').toLowerCase());
const people = computed(() => directory.directory.map((u) => ({ value: u.id, title: displayName(u), subtitle: u.email })));

/** Primera línea del mensaje como título (los nombres de archivo y tarjetas vienen entre corchetes en el texto plano: fuera). */
function suggestedTitle(m: ChatMessage): string {
  const line = (m.bodyText ?? '').split('\n').map((l) => l.replace(/^\[.*\]$/, '').trim()).find(Boolean) ?? '';
  return line.length > MAX_TITLE ? `${line.slice(0, MAX_TITLE - 1)}…` : line;
}

watch(open, (v) => {
  if (!v) return;
  title.value = suggestedTitle(props.message);
  assignee.value = myId.value || null;
  dueOn.value = null;
  failure.value = null;
  void directory.ensureDirectory();
}, { immediate: true });

function permalink(m: ChatMessage): string {
  const url = new URL(`/messages/${m.conversationId}`, window.location.origin);
  if (m.threadRootId) url.searchParams.set('thread', m.threadRootId);
  url.searchParams.set('m', m.id);
  return url.toString();
}

/**
 * Descripción de la tarea: el texto del mensaje citado y el enlace a él. Solo texto plano: el documento del mensaje puede traer
 * @canal o tarjetas del CRM, que la lista blanca de Proyectos no acepta.
 */
function descriptionDoc(m: ChatMessage): RichDoc {
  const author = displayName(directory.users.get(m.senderId ?? '')) || t('chat.unknownUser');
  const lines = (m.bodyText ?? '').split('\n').filter((l) => l.trim());
  return {
    type: 'doc',
    content: [
      ...(lines.length
        ? [{ type: 'blockquote', content: lines.map((l) => ({ type: 'paragraph', content: [{ type: 'text', text: l }] })) }]
        : []),
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: `${t('chat.task.from', { name: author })} ` },
          { type: 'text', text: t('chat.task.openMessage'), marks: [{ type: 'link', attrs: { href: permalink(m) } }] },
        ],
      },
    ],
  } as RichDoc;
}

async function create(): Promise<void> {
  const name = title.value.trim();
  if (!name) return;
  busy.value = true;
  failure.value = null;
  const m = props.message;
  try {
    const task = await projectsApi.createTask({ title: name, assigneeUserId: assignee.value, dueOn: dueOn.value, descriptionDoc: descriptionDoc(m) });
    open.value = false;
    // La respuesta en el hilo es aparte: si falla (sin permiso de escribir, canal archivado), la tarea ya existe y se avisa igual.
    try {
      await chat.send(m.conversationId, {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: t('chat.task.created') }] },
          { type: 'crmLink', attrs: { entityType: 'task', entityId: task.id, label: task.title } },
        ],
      } as RichDoc, undefined, m.threadRootId ?? m.id);
    } catch {
      // Solo la tarjeta en el hilo; la tarea quedó creada.
    }
    notify.success(t('chat.task.done'));
  } catch (e) {
    failure.value = extractError(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="560">
    <v-card>
      <v-card-title>{{ t('chat.task.title') }}</v-card-title>
      <v-card-text class="d-flex flex-column ga-4">
        <v-alert v-if="failure" type="error" :text="failure" />
        <v-text-field v-model="title" :label="t('chat.task.name')" :maxlength="MAX_TITLE" autofocus @keydown.enter="create" />
        <v-autocomplete v-model="assignee" :items="people" :label="t('chat.task.assignee')" clearable>
          <template #item="{ props: item, item: option }">
            <v-list-item v-bind="item" :subtitle="option.subtitle" />
          </template>
        </v-autocomplete>
        <DateField v-model="dueOn" :label="t('chat.task.dueOn')" clearable />
        <div class="text-body-small text-medium-emphasis">{{ t('chat.task.hint') }}</div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">{{ t('common.cancel') }}</v-btn>
        <v-btn color="primary" variant="flat" :disabled="!title.trim()" :loading="busy" @click="create">{{ t('chat.task.create') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
