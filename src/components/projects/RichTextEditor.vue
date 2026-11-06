<script setup lang="ts">
import { onBeforeUnmount, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { useProjectsStore } from '@/stores/projects';
import { displayName } from '@/utils/projects';
import type { DirectoryUser, RichDoc } from '@/types/projects';
import UserAvatar from './UserAvatar.vue';

/**
 * Editor de descripciones y comentarios (TipTap). Solo ofrece lo que el servidor acepta (lista blanca de `richtext.ts` en
 * projects-service): párrafos, listas, cita, código, negrita, cursiva, tachado, enlaces y @menciones. Los títulos y las líneas
 * horizontales de StarterKit se apagan: el servidor los rechazaría.
 *
 * @menciones: al escribir «@» aparece la lista de compañeros (directorio de auth-service); ↑/↓ para elegir, Enter o Tab para
 * insertar, Esc para cerrar. Ctrl+Enter (⌘+Enter) emite `submit`, como en Asana.
 */
const props = withDefaults(
  defineProps<{ modelValue: RichDoc | null; placeholder?: string; editable?: boolean; autofocus?: boolean; toolbar?: boolean }>(),
  { placeholder: '', editable: true, autofocus: false, toolbar: true },
);
const emit = defineEmits<{ 'update:modelValue': [RichDoc]; submit: []; blur: [] }>();

const { t } = useI18n();
const store = useProjectsStore();

const mention = reactive<{ open: boolean; items: DirectoryUser[]; index: number; x: number; y: number; command: ((p: { id: string; label: string }) => void) | null }>({
  open: false,
  items: [],
  index: 0,
  x: 0,
  y: 0,
  command: null,
});

function place(props: SuggestionProps<DirectoryUser>): void {
  mention.items = props.items;
  mention.command = (attrs) => props.command(attrs);
  const rect = props.clientRect?.();
  if (rect) {
    mention.x = rect.left;
    mention.y = rect.bottom + 4;
  }
}

function choose(user: DirectoryUser | undefined): void {
  if (!user || !mention.command) return;
  mention.command({ id: user.id, label: displayName(user) });
  mention.open = false;
}

const editor = useEditor({
  content: props.modelValue ?? '',
  editable: props.editable,
  autofocus: props.autofocus ? 'end' : false,
  extensions: [
    StarterKit.configure({ heading: false, horizontalRule: false }),
    Link.configure({ openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'], HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
    Placeholder.configure({ placeholder: () => props.placeholder }),
    Mention.configure({
      HTMLAttributes: { class: 'rte-mention' },
      suggestion: {
        items: ({ query }: { query: string }) => {
          const q = query.toLowerCase();
          return store.directory.filter((u) => displayName(u).toLowerCase().includes(q) || u.email.toLowerCase().includes(q)).slice(0, 6);
        },
        render: () => ({
          onStart: (p: SuggestionProps<DirectoryUser>) => {
            mention.open = true;
            mention.index = 0;
            place(p);
          },
          onUpdate: (p: SuggestionProps<DirectoryUser>) => {
            mention.index = 0;
            place(p);
          },
          onKeyDown: ({ event }: SuggestionKeyDownProps) => {
            if (!mention.open || mention.items.length === 0) return false;
            if (event.key === 'ArrowDown') mention.index = (mention.index + 1) % mention.items.length;
            else if (event.key === 'ArrowUp') mention.index = (mention.index - 1 + mention.items.length) % mention.items.length;
            else if (event.key === 'Enter' || event.key === 'Tab') choose(mention.items[mention.index]);
            else if (event.key === 'Escape') mention.open = false;
            else return false;
            return true;
          },
          onExit: () => {
            mention.open = false;
          },
        }),
      },
    }),
  ],
  editorProps: {
    handleKeyDown: (_view, event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        emit('submit');
        return true;
      }
      return false;
    },
  },
  onUpdate: ({ editor: e }) => emit('update:modelValue', e.getJSON() as RichDoc),
  onBlur: () => emit('blur'),
});

// Un cambio que llega de fuera (se guardó en otra pestaña, se vació tras comentar) reemplaza el contenido sin disparar `update`.
watch(
  () => props.modelValue,
  (doc) => {
    const e = editor.value;
    if (!e) return;
    if (JSON.stringify(e.getJSON()) === JSON.stringify(doc ?? { type: 'doc', content: [{ type: 'paragraph' }] })) return;
    e.commands.setContent(doc ?? '', false);
  },
);
watch(
  () => props.editable,
  (v) => editor.value?.setEditable(v),
);

defineExpose({
  focus: () => editor.value?.commands.focus('end'),
  isEmpty: () => editor.value?.isEmpty ?? true,
  clear: () => editor.value?.commands.clearContent(true),
});

onBeforeUnmount(() => editor.value?.destroy());
</script>

<template>
  <div class="rte" :class="{ 'rte--readonly': !editable }">
    <div v-if="toolbar && editable && editor" class="d-flex flex-wrap ga-1 mb-1">
      <v-btn
        v-for="b in [
          { icon: 'mdi-format-bold', cmd: 'toggleBold', active: 'bold', label: t('projects.editor.bold') },
          { icon: 'mdi-format-italic', cmd: 'toggleItalic', active: 'italic', label: t('projects.editor.italic') },
          { icon: 'mdi-format-strikethrough', cmd: 'toggleStrike', active: 'strike', label: t('projects.editor.strike') },
          { icon: 'mdi-format-list-bulleted', cmd: 'toggleBulletList', active: 'bulletList', label: t('projects.editor.bulletList') },
          { icon: 'mdi-format-list-numbered', cmd: 'toggleOrderedList', active: 'orderedList', label: t('projects.editor.orderedList') },
        ]"
        :key="b.cmd"
        :icon="b.icon"
        size="x-small"
        :variant="editor.isActive(b.active) ? 'tonal' : 'text'"
        :aria-label="b.label"
        @mousedown.prevent
        @click="(editor.chain().focus() as unknown as Record<string, () => { run: () => void }>)[b.cmd]!().run()"
      />
    </div>
    <EditorContent :editor="editor" />

    <!--
      Lista de @menciones junto al cursor (TipTap da la posición con clientRect). Se lleva al <body>: dentro del panel lateral, que
      se desliza con `transform`, un `position: fixed` se mide desde el panel y no desde la ventana, y la lista salía fuera de pantalla.
    -->
    <Teleport to="body">
      <v-card v-if="mention.open && mention.items.length" class="rte-suggestions" :style="{ left: `${mention.x}px`, top: `${mention.y}px` }" elevation="3">
        <v-list density="compact">
          <v-list-item
            v-for="(u, i) in mention.items"
            :key="u.id"
            :active="i === mention.index"
            color="primary"
            :subtitle="u.email"
            @mousedown.prevent="choose(u)"
          >
            <template #prepend>
              <UserAvatar :user-id="u.id" :size="24" :tooltip="false" class="mr-2" />
            </template>
            <v-list-item-title>{{ displayName(u) }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-card>
    </Teleport>
  </div>
</template>

<style scoped>
.rte :deep(.ProseMirror) {
  min-height: 72px;
  padding: 8px 12px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  outline: none;
}
.rte--readonly :deep(.ProseMirror) {
  min-height: 0;
  border-color: transparent;
  padding: 0;
}
.rte :deep(.ProseMirror:focus) {
  border-color: rgb(var(--v-theme-primary));
}
.rte :deep(.ProseMirror p) {
  margin: 0 0 4px;
}
.rte :deep(.ProseMirror ul),
.rte :deep(.ProseMirror ol) {
  padding-left: 20px;
}
.rte :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.rte :deep(.rte-mention) {
  color: rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-lightprimary));
  border-radius: 4px;
  padding: 0 2px;
}
.rte-suggestions {
  position: fixed;
  z-index: 3000;
  min-width: 240px;
}
</style>
