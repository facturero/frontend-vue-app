<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/chat';
import { useProjectsStore } from '@/stores/projects';
import { useConfirm } from '@/composable/useConfirm';
import { useNotify } from '@/composable/useNotify';
import { displayName } from '@/utils/projects';
import { extractError } from '@/utils/error';
import type { CustomEmoji } from '@/types/chat';
import CustomEmojiImg from './CustomEmoji.vue';

/**
 * Emojis personalizados de la organización (como en Slack): subir una imagen con su nombre y usarla con `:nombre:` en mensajes y
 * reacciones. Agrega cualquiera del equipo; quita quien lo subió o un administrador del chat (lo decide chat-service).
 *
 * La imagen: PNG, GIF, JPG o WebP de hasta 256 KB (se ve a 22 px: más pesada solo hace lento el chat). Se recomienda cuadrada.
 */
const open = defineModel<boolean>({ required: true });
const { t } = useI18n();
const { xs } = useDisplay();
const auth = useAuthStore();
const chat = useChatStore();
const directory = useProjectsStore();
const confirm = useConfirm();
const notify = useNotify();

const MAX_BYTES = 256 * 1024;
const TYPES = ['image/png', 'image/gif', 'image/jpeg', 'image/webp'];
const file = ref<File | null>(null);
const preview = ref<string | null>(null);
const name = ref('');
const saving = ref(false);
const failure = ref<string | null>(null);
const filter = ref('');
const input = ref<HTMLInputElement | null>(null);

const myId = computed(() => ((auth.user as { id?: string } | null)?.id ?? '').toLowerCase());
const isAdmin = computed(() => auth.can('chat:admin'));
/** Lo mismo que hará el servidor: así se ve el nombre final antes de guardar. */
const normalized = computed(() =>
  name.value.trim().toLowerCase().replace(/^:+|:+$/g, '').normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, '_').replace(/[^a-z0-9_+-]/g, '').slice(0, 32),
);
const nameError = computed(() => (name.value && normalized.value.length < 2 ? t('chat.emojis.nameShort') : chat.emojis.has(normalized.value) ? t('chat.emojis.nameTaken') : null));
const shown = computed(() => chat.emojiList.filter((e) => !filter.value || e.name.includes(filter.value.toLowerCase())));

watch(
  open,
  (v) => {
    if (!v) return;
    void chat.loadEmojis(true);
    void directory.ensureDirectory();
    reset();
  },
  { immediate: true },
);

function reset(): void {
  if (preview.value) URL.revokeObjectURL(preview.value);
  file.value = null;
  preview.value = null;
  name.value = '';
  failure.value = null;
}

function pick(event: Event): void {
  const f = (event.target as HTMLInputElement).files?.[0] ?? null;
  (event.target as HTMLInputElement).value = '';
  failure.value = null;
  if (!f) return;
  if (!TYPES.includes(f.type)) return void (failure.value = t('chat.emojis.badType'));
  if (f.size > MAX_BYTES) return void (failure.value = t('chat.emojis.tooBig'));
  if (preview.value) URL.revokeObjectURL(preview.value);
  file.value = f;
  preview.value = URL.createObjectURL(f);
  // El nombre sale del archivo («party parrot.gif» → «party_parrot»); se puede cambiar.
  if (!name.value) name.value = f.name.replace(/\.[^.]+$/, '');
}

async function save(): Promise<void> {
  if (!file.value || nameError.value || normalized.value.length < 2) return;
  saving.value = true;
  failure.value = null;
  try {
    const e = await chat.addEmoji(file.value, normalized.value);
    notify.success(t('chat.emojis.added', { name: e.name }));
    reset();
  } catch (err) {
    failure.value = extractError(err);
  } finally {
    saving.value = false;
  }
}

const canRemove = (e: CustomEmoji) => e.createdBy === myId.value || isAdmin.value;
async function remove(e: CustomEmoji): Promise<void> {
  if (!(await confirm({ title: t('chat.emojis.removeTitle', { name: e.name }), text: t('chat.emojis.removeText'), confirmText: t('chat.emojis.removeConfirm'), destructive: true }))) return;
  try {
    await chat.removeEmoji(e);
  } catch (err) {
    notify.error(extractError(err));
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="640" :fullscreen="xs" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <span class="flex-grow-1">{{ t('chat.emojis.title') }}</span>
        <v-btn icon="mdi-close" variant="text" size="small" :aria-label="t('common.close')" @click="open = false" />
      </v-card-title>
      <v-card-text>
        <div class="text-body-medium text-medium-emphasis mb-4">{{ t('chat.emojis.intro') }}</div>
        <v-alert v-if="failure" type="error" class="mb-4" :text="failure" />

        <!-- Agregar -->
        <div class="d-flex align-start ga-4 mb-6">
          <v-sheet class="border rounded d-flex align-center justify-center flex-shrink-0" width="72" height="72">
            <img v-if="preview" :src="preview" alt="" :style="{ maxWidth: '56px', maxHeight: '56px', objectFit: 'contain' }" />
            <v-icon v-else icon="mdi-emoticon-plus-outline" size="32" class="text-medium-emphasis" />
          </v-sheet>
          <div class="flex-grow-1 d-flex flex-column ga-2" :style="{ minWidth: 0 }">
            <div class="d-flex ga-2 align-center">
              <v-btn variant="tonal" prepend-icon="mdi-image-outline" @click="input?.click()">{{ t(file ? 'chat.emojis.changeImage' : 'chat.emojis.pickImage') }}</v-btn>
              <span class="text-body-small text-medium-emphasis">{{ t('chat.emojis.imageHint') }}</span>
            </div>
            <input ref="input" type="file" accept="image/png,image/gif,image/jpeg,image/webp" hidden data-emoji-file @change="pick" />
            <v-text-field
              v-model="name"
              :label="t('chat.emojis.name')"
              prefix=":"
              suffix=":"
              :error-messages="nameError ?? undefined"
              :hint="normalized && normalized !== name.trim() ? t('chat.emojis.willBe', { name: normalized }) : undefined"
              persistent-hint
              maxlength="40"
              @keydown.enter="save"
            />
            <div class="d-flex justify-end">
              <v-btn color="primary" variant="flat" :disabled="!file || !!nameError || normalized.length < 2" :loading="saving" @click="save">{{ t('chat.emojis.add') }}</v-btn>
            </div>
          </div>
        </div>

        <!-- Los de la organización -->
        <div class="d-flex align-center ga-2 mb-2">
          <span class="text-title-large flex-grow-1">{{ t('chat.emojis.list', { n: chat.emojiList.length }) }}</span>
          <v-text-field v-if="chat.emojiList.length > 8" v-model="filter" :placeholder="t('chat.emojis.filter')" prepend-inner-icon="mdi-magnify" hide-details max-width="220" />
        </div>
        <div v-if="!chat.emojiList.length" class="text-body-medium text-medium-emphasis">{{ t('chat.emojis.none') }}</div>
        <v-list v-else density="compact">
          <v-list-item v-for="e in shown" :key="e.id" :data-custom-emoji="e.name">
            <template #prepend>
              <CustomEmojiImg :name="e.name" size="28px" class="mr-4" />
            </template>
            <v-list-item-title>:{{ e.name }}:</v-list-item-title>
            <v-list-item-subtitle>{{ t('chat.emojis.by', { name: displayName(directory.users.get(e.createdBy)) || t('chat.unknownUser') }) }}</v-list-item-subtitle>
            <template v-if="canRemove(e)" #append>
              <v-btn icon="mdi-delete-outline" variant="text" size="small" :aria-label="t('chat.emojis.remove', { name: e.name })" @click="remove(e)" />
            </template>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
