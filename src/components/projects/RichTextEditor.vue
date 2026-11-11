<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { EditorContent, useEditor, VueNodeViewRenderer } from '@tiptap/vue-3';
import { Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { useProjectsStore } from '@/stores/projects';
import { displayName } from '@/utils/projects';
import type { DirectoryUser, RichDoc } from '@/types/projects';
import UserAvatar from './UserAvatar.vue';
import RichImageNode from './RichImageNode.vue';
import RichFileNode from './RichFileNode.vue';

/**
 * Editor de descripciones y comentarios (TipTap). Solo ofrece lo que el servidor acepta (lista blanca de `richtext.ts` en
 * projects-service): párrafos, listas, cita, código, negrita, cursiva, tachado, enlaces, @menciones, tablas, imágenes y fichas de
 * documentos. Los títulos
 * y las líneas horizontales de StarterKit se apagan: el servidor los rechazaría.
 *
 * @menciones: al escribir «@» aparece la lista de compañeros (directorio de auth-service); ↑/↓ para elegir, Enter o Tab para
 * insertar, Esc para cerrar. Ctrl+Enter (⌘+Enter) emite `submit`, como en Asana.
 *
 * Archivos: con `uploadFile` (sube el archivo y devuelve su id en document-service) se adjuntan con el clip, pegándolos o soltándolos
 * sobre el texto. Una imagen se ve en línea; cualquier otro (Excel, PDF…) queda como una ficha donde estaba el cursor. Sustituye al
 * recuadro «Suelta archivos aquí» de la tarea, que ocupaba mucho (lo pidió un cliente). Sin esa función no hay clip.
 */
const props = withDefaults(
  defineProps<{
    modelValue: RichDoc | null;
    placeholder?: string;
    editable?: boolean;
    autofocus?: boolean;
    toolbar?: boolean;
    uploadFile?: (file: File) => Promise<string | null>;
  }>(),
  { placeholder: '', editable: true, autofocus: false, toolbar: true, uploadFile: undefined },
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

/**
 * La imagen guarda el id del archivo, no la URL (la firmada caduca): se reemplazan los atributos de la extensión y solo se lee de un
 * <img> con `data-document-id`. Así, pegar HTML de otra página con imágenes no crea nodos sin archivo, que el servidor rechazaría y
 * se perdería el texto entero.
 */
const RichImage = Image.extend({
  addAttributes() {
    return {
      documentId: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute('data-document-id'), renderHTML: (a: Record<string, unknown>) => ({ 'data-document-id': a.documentId }) },
      alt: { default: '' },
    };
  },
  parseHTML() {
    return [{ tag: 'img[data-document-id]' }];
  },
  addNodeView() {
    return VueNodeViewRenderer(RichImageNode);
  },
});

/** Ficha de un documento (Excel, PDF…) dentro del texto. Como la imagen, guarda el id del archivo; nombre y tipo solo para pintarla. */
const RichFile = Node.create({
  name: 'file',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      documentId: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute('data-file-id'), renderHTML: (a: Record<string, unknown>) => ({ 'data-file-id': a.documentId }) },
      name: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-file-name') ?? '', renderHTML: (a: Record<string, unknown>) => ({ 'data-file-name': a.name }) },
      mimeType: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-file-type') ?? '', renderHTML: (a: Record<string, unknown>) => ({ 'data-file-type': a.mimeType }) },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-file-id]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes), String(HTMLAttributes['data-file-name'] ?? '')];
  },
  addNodeView() {
    return VueNodeViewRenderer(RichFileNode);
  },
});

const uploading = ref(0);
const fileInput = ref<HTMLInputElement | null>(null);

async function insertFiles(files: File[]): Promise<void> {
  if (!props.uploadFile) return;
  // Donde estaba el cursor al pedir el archivo. Mientras se sube, la tarea se guarda y se recarga, el contenido se vuelve a poner y el
  // cursor saltaba al final (la imagen caía en la última celda de una tabla, por ejemplo).
  let at = editor.value?.state.selection.to ?? 0;
  for (const file of files) {
    uploading.value += 1;
    try {
      const documentId = await props.uploadFile(file);
      const e = editor.value;
      if (documentId && e) {
        at = Math.min(at, e.state.doc.content.size);
        const node = file.type.startsWith('image/')
          ? { type: 'image', attrs: { documentId, alt: file.name } }
          : { type: 'file', attrs: { documentId, name: file.name, mimeType: file.type || 'application/octet-stream' } };
        e.chain().focus().insertContentAt(at, node).run();
        at = e.state.selection.to;
      }
    } catch {
      // El aviso lo deja quien sube (el store); se sigue con los demás archivos.
    } finally {
      uploading.value -= 1;
    }
  }
}

function filesOf(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []);
}

const editor = useEditor({
  content: props.modelValue ?? '',
  editable: props.editable,
  autofocus: props.autofocus ? 'end' : false,
  extensions: [
    StarterKit.configure({ heading: false, horizontalRule: false }),
    Link.configure({ openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'], HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
    Placeholder.configure({ placeholder: () => props.placeholder }),
    RichImage.configure({ inline: false }),
    RichFile,
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
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
    // Pegar una captura o soltar archivos los sube y los inserta. Si lo pegado trae además texto (celdas de Excel, un párrafo de Word),
    // se pega el texto: esos programas ponen también una imagen de lo copiado en el portapapeles, y antes se subía esa imagen en vez
    // de pegar la tabla.
    handlePaste: (_view, event) => {
      const data = event.clipboardData;
      const files = filesOf(data?.files);
      if (!props.uploadFile || !files.length) return false;
      if (data?.getData('text/html') || data?.getData('text/plain')) return false;
      void insertFiles(files);
      return true;
    },
    handleDrop: (_view, event) => {
      const files = filesOf((event as DragEvent).dataTransfer?.files);
      if (!props.uploadFile || !files.length) return false;
      void insertFiles(files);
      return true;
    },
  },
  onUpdate: ({ editor: e }) => emit('update:modelValue', e.getJSON() as RichDoc),
  onBlur: ({ event }) => {
    // Abrir un menú de la barra (enlace, tabla) quita el foco al editor: eso no es «terminé de escribir», no se guarda todavía.
    const next = (event as FocusEvent | undefined)?.relatedTarget as HTMLElement | null;
    if (next?.closest('.rte-popover')) return;
    emit('blur');
  },
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

// ── Barra de herramientas ───────────────────────────────────────────────────
type Cmd = 'toggleBold' | 'toggleItalic' | 'toggleStrike' | 'toggleBulletList' | 'toggleOrderedList' | 'toggleBlockquote' | 'toggleCode';
const marks = computed<Array<{ icon: string; cmd: Cmd; active: string; label: string }>>(() => [
  { icon: 'mdi-format-bold', cmd: 'toggleBold', active: 'bold', label: t('projects.editor.bold') },
  { icon: 'mdi-format-italic', cmd: 'toggleItalic', active: 'italic', label: t('projects.editor.italic') },
  { icon: 'mdi-format-strikethrough', cmd: 'toggleStrike', active: 'strike', label: t('projects.editor.strike') },
  { icon: 'mdi-code-tags', cmd: 'toggleCode', active: 'code', label: t('projects.editor.code') },
  { icon: 'mdi-format-list-bulleted', cmd: 'toggleBulletList', active: 'bulletList', label: t('projects.editor.bulletList') },
  { icon: 'mdi-format-list-numbered', cmd: 'toggleOrderedList', active: 'orderedList', label: t('projects.editor.orderedList') },
  { icon: 'mdi-format-quote-close', cmd: 'toggleBlockquote', active: 'blockquote', label: t('projects.editor.quote') },
]);

function run(cmd: Cmd): void {
  editor.value?.chain().focus()[cmd]().run();
}

// Enlace con texto: así un enlace larguísimo se ve como «la cotización» y no como 200 caracteres de URL.
const link = reactive({ open: false, text: '', url: '', editing: false });
const linkUrlValid = computed(() => /^(https?:\/\/|mailto:)\S+$/i.test(normalizeUrl(link.url)));

function normalizeUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  if (/^(https?:\/\/|mailto:)/i.test(v)) return v;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `mailto:${v}`;
  return `https://${v}`;
}

function openLink(): void {
  const e = editor.value;
  if (!e) return;
  if (e.isActive('link')) e.chain().extendMarkRange('link').run();
  const { from, to } = e.state.selection;
  link.text = e.state.doc.textBetween(from, to, ' ');
  link.url = (e.getAttributes('link').href as string | undefined) ?? '';
  link.editing = e.isActive('link');
  link.open = true;
}

function applyLink(): void {
  const e = editor.value;
  if (!e || !linkUrlValid.value) return;
  const href = normalizeUrl(link.url);
  const text = link.text.trim() || href;
  const { from, to } = e.state.selection;
  const current = e.state.doc.textBetween(from, to, ' ');
  if (from !== to && current === text) e.chain().focus().extendMarkRange('link').setLink({ href }).run();
  else e.chain().focus().insertContent({ type: 'text', text, marks: [{ type: 'link', attrs: { href } }] }).run();
  link.open = false;
}

// Si el menú del enlace se cierra sin volver al editor (Esc, clic fuera), el `blur` que se saltó al abrirlo se emite ahora: si no,
// la descripción escrita no se guardaba hasta volver a entrar y salir del editor.
watch(
  () => link.open,
  (open) => {
    if (!open) setTimeout(() => !editor.value?.isFocused && emit('blur'), 0);
  },
);

function removeLink(): void {
  editor.value?.chain().focus().extendMarkRange('link').unsetLink().run();
  link.open = false;
}

const inTable = computed(() => !!editor.value?.isActive('table'));
type TableCmd = 'addRowAfter' | 'addColumnAfter' | 'deleteRow' | 'deleteColumn' | 'toggleHeaderRow' | 'deleteTable';
const tableActions = computed<Array<{ cmd: TableCmd; icon: string; label: string }>>(() => [
  { cmd: 'addRowAfter', icon: 'mdi-table-row-plus-after', label: t('projects.editor.addRow') },
  { cmd: 'addColumnAfter', icon: 'mdi-table-column-plus-after', label: t('projects.editor.addColumn') },
  { cmd: 'deleteRow', icon: 'mdi-table-row-remove', label: t('projects.editor.deleteRow') },
  { cmd: 'deleteColumn', icon: 'mdi-table-column-remove', label: t('projects.editor.deleteColumn') },
  { cmd: 'toggleHeaderRow', icon: 'mdi-table-headers-eye', label: t('projects.editor.headerRow') },
  { cmd: 'deleteTable', icon: 'mdi-table-remove', label: t('projects.editor.deleteTable') },
]);

function insertTable(): void {
  editor.value?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
}

function tableCmd(cmd: TableCmd): void {
  editor.value?.chain().focus()[cmd]().run();
}

function pickFiles(event: Event): void {
  const input = event.target as HTMLInputElement;
  void insertFiles(filesOf(input.files));
  input.value = '';
}

defineExpose({
  focus: () => editor.value?.commands.focus('end'),
  isEmpty: () => editor.value?.isEmpty ?? true,
  clear: () => editor.value?.commands.clearContent(true),
});

onBeforeUnmount(() => editor.value?.destroy());
</script>

<template>
  <div class="rte" :class="{ 'rte--readonly': !editable }">
    <div v-if="toolbar && editable && editor" class="d-flex flex-wrap align-center ga-1 mb-1">
      <v-btn
        v-for="b in marks"
        :key="b.cmd"
        v-tooltip:top="b.label"
        :icon="b.icon"
        size="x-small"
        :variant="editor.isActive(b.active) ? 'tonal' : 'text'"
        :aria-label="b.label"
        @mousedown.prevent
        @click="run(b.cmd)"
      />

      <v-menu v-model="link.open" :close-on-content-click="false" location="bottom start">
        <template #activator="{ props: activator }">
          <v-btn
            v-bind="activator"
            v-tooltip:top="t('projects.editor.link')"
            icon="mdi-link-variant"
            size="x-small"
            :variant="editor.isActive('link') ? 'tonal' : 'text'"
            :aria-label="t('projects.editor.link')"
            @mousedown.prevent
            @click.stop="openLink"
          />
        </template>
        <v-card min-width="320" class="pa-4 rte-popover">
          <v-text-field v-model="link.text" :label="t('projects.editor.linkText')" :hint="t('projects.editor.linkTextHint')" persistent-hint class="mb-2" />
          <v-text-field
            v-model="link.url"
            :label="t('projects.editor.linkUrl')"
            placeholder="https://"
            autofocus
            :error-messages="link.url && !linkUrlValid ? t('projects.editor.linkInvalid') : undefined"
            @keydown.enter.prevent="applyLink"
          />
          <div class="d-flex ga-2 mt-2">
            <v-btn v-if="link.editing" variant="text" color="error" size="small" @click="removeLink">{{ t('projects.editor.unlink') }}</v-btn>
            <v-spacer />
            <v-btn variant="text" size="small" @click="link.open = false">{{ t('common.cancel') }}</v-btn>
            <v-btn color="primary" size="small" :disabled="!linkUrlValid" @click="applyLink">{{ t('common.save') }}</v-btn>
          </div>
        </v-card>
      </v-menu>

      <v-menu v-if="inTable" location="bottom start">
        <template #activator="{ props: activator }">
          <v-btn v-bind="activator" v-tooltip:top="t('projects.editor.table')" icon="mdi-table-edit" size="x-small" variant="tonal" :aria-label="t('projects.editor.table')" @mousedown.prevent />
        </template>
        <v-list density="compact" class="rte-popover">
          <v-list-item v-for="a in tableActions" :key="a.cmd" :prepend-icon="a.icon" :title="a.label" @mousedown.prevent @click="tableCmd(a.cmd)" />
        </v-list>
      </v-menu>
      <v-btn
        v-else
        v-tooltip:top="t('projects.editor.table')"
        icon="mdi-table-plus"
        size="x-small"
        variant="text"
        :aria-label="t('projects.editor.table')"
        @mousedown.prevent
        @click="insertTable"
      />

      <template v-if="uploadFile">
        <v-btn
          v-tooltip:top="t('projects.editor.attach')"
          icon="mdi-paperclip"
          size="x-small"
          variant="text"
          :loading="uploading > 0"
          :aria-label="t('projects.editor.attach')"
          @mousedown.prevent
          @click="fileInput?.click()"
        />
        <input ref="fileInput" type="file" multiple hidden @change="pickFiles" />
      </template>
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
.rte :deep(.ProseMirror blockquote) {
  padding-left: 12px;
  border-left: 3px solid rgba(var(--v-border-color), var(--v-border-opacity));
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.rte :deep(.ProseMirror a) {
  color: rgb(var(--v-theme-primary));
}
.rte :deep(.ProseMirror table) {
  border-collapse: collapse;
  width: 100%;
  margin: 4px 0;
  table-layout: fixed;
}
.rte :deep(.ProseMirror th),
.rte :deep(.ProseMirror td) {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding: 4px 8px;
  vertical-align: top;
  position: relative;
}
.rte :deep(.ProseMirror th) {
  background: rgb(var(--v-theme-lightprimary));
  font-weight: 500;
  text-align: left;
}
.rte :deep(.ProseMirror .selectedCell::after) {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(var(--v-theme-primary), 0.12);
  pointer-events: none;
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
