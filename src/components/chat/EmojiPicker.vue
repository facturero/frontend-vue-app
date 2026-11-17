<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import { useChatStore } from '@/stores/chat';
import CustomEmojiImg from './CustomEmoji.vue';
import CustomEmojiDialog from './CustomEmojiDialog.vue';

/**
 * Selector de emojis: los de uso diario en una oficina y, debajo, los personalizados de la organización (`:nombre:`, como en Slack),
 * con un enlace para subir otros. Sin librería (pesan cientos de KB por miles de emojis que nadie usa para reaccionar en el trabajo);
 * si hiciera falta uno que no está, se agrega a la lista o se sube como personalizado.
 *
 * Arriba, un buscador: con decenas de personalizados ya no se encuentran a ojo. Filtra los personalizados por su `:nombre:` y los
 * normales por palabras clave (es/en/fr juntas: quien busca escribe en su idioma, sea cual sea el de la pantalla). Enter elige el primero.
 */
withDefaults(defineProps<{ label?: string; icon?: string; size?: string }>(), { label: '', icon: 'mdi-emoticon-plus-outline', size: 'x-small' });
const emit = defineEmits<{ pick: [string]; open: [boolean] }>();
const { t } = useI18n();
const chat = useChatStore();
const { mobile } = useDisplay();
const manage = ref(false);
const open = ref(false);
const query = ref('');

/** Emoji y sus palabras de búsqueda (sin tildes, en minúsculas; es, en y fr). El orden es el del selector. */
const EMOJIS: [string, string][] = [
  ['👍', 'pulgar arriba bien ok si de acuerdo like thumbs up yes pouce oui'],
  ['👎', 'pulgar abajo mal no dislike thumbs down pouce bas non'],
  ['👌', 'ok perfecto bien perfect parfait'],
  ['🙏', 'gracias por favor rezar thanks please pray merci prier'],
  ['👏', 'aplauso aplausos bravo clap applause applaudir'],
  ['🙌', 'manos arriba celebrar hurra hands raise hooray mains'],
  ['💪', 'fuerza fuerte musculo brazo strong muscle force'],
  ['🤝', 'trato acuerdo manos apreton deal handshake accord poignee'],
  ['✅', 'listo hecho check visto correcto done marcado fait valide'],
  ['❌', 'no error equis cruz mal cancelar wrong cross annuler croix'],
  ['⚠️', 'aviso alerta cuidado atencion advertencia warning attention'],
  ['❓', 'pregunta duda interrogacion question'],
  ['❗', 'importante exclamacion urgente important exclamation'],
  ['💯', 'cien perfecto 100 hundred cent'],
  ['🔥', 'fuego candela genial fire hot feu'],
  ['⭐', 'estrella favorito star etoile favori'],
  ['😀', 'sonrisa feliz contento smile happy sourire content'],
  ['😂', 'risa jaja llorar de risa lol laugh joy rire'],
  ['😊', 'sonrisa feliz sonrojado smile blush sourire'],
  ['😍', 'amor encanta enamorado ojos corazon love coeur adore'],
  ['🤔', 'pensar pensando duda hmm think thinking reflechir'],
  ['😅', 'sudor uf alivio nervioso sweat phew ouf'],
  ['😮', 'sorpresa wow asombro surprise oh'],
  ['😢', 'triste llorar lagrima sad cry pleurer'],
  ['😎', 'genial gafas lentes cool sunglasses lunettes'],
  ['🥳', 'fiesta celebrar cumpleanos party celebrate fete'],
  ['🎉', 'fiesta celebrar confeti felicidades tada party fete bravo'],
  ['❤️', 'corazon amor rojo heart love coeur'],
  ['💡', 'idea foco bombilla bulb light ampoule idee'],
  ['👀', 'ojos mirando viendo ver eyes look yeux regarder'],
  ['🚀', 'cohete lanzar lanzamiento rapido rocket launch ship fusee'],
  ['⏰', 'reloj alarma hora tiempo clock alarm time reveil heure'],
  ['📌', 'fijar chincheta pin epingle'],
  ['📎', 'clip adjunto archivo paperclip attachment trombone'],
  ['📅', 'calendario fecha dia calendar date calendrier'],
  ['💰', 'dinero plata pago money bag cash argent'],
  ['📈', 'sube grafico crecimiento ventas chart up growth hausse'],
  ['📉', 'baja grafico caida chart down drop baisse'],
  ['🛒', 'carrito compra compras cart shopping panier achat'],
  ['☕', 'cafe taza descanso coffee break pause tasse'],
];

/** Lo escrito, comparable: sin tildes, en minúsculas y sin los dos puntos de `:nombre:`. */
const needle = computed(() =>
  query.value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/:/g, '')
    .trim(),
);
const standard = computed(() => (needle.value ? EMOJIS.filter(([e, words]) => e === query.value.trim() || words.includes(needle.value)) : EMOJIS));
const custom = computed(() => (needle.value ? chat.emojiList.filter((e) => e.name.toLowerCase().includes(needle.value)) : chat.emojiList));

watch(open, (v) => {
  emit('open', v);
  if (!v) return;
  query.value = '';
  // Al abrirlo, la lista al día (un emoji que otra persona acaba de subir).
  void chat.loadEmojis(false, 5_000);
});

/** El menú ya no se cierra con cualquier clic dentro (el buscador es clic dentro): se cierra al elegir. */
function pick(value: string): void {
  emit('pick', value);
  open.value = false;
}

function pickFirst(): void {
  if (!needle.value) return;
  const first = standard.value[0]?.[0] ?? (custom.value[0] ? `:${custom.value[0].name}:` : null);
  if (first) pick(first);
}

function openManage(): void {
  open.value = false;
  manage.value = true;
}
</script>

<template>
  <v-menu v-model="open" location="top" :close-on-content-click="false">
    <template #activator="{ props: menu }">
      <slot :props="menu">
        <v-btn v-bind="menu" :icon="icon" variant="text" :size="size" :aria-label="label || t('chat.react')" />
      </slot>
    </template>
    <v-card class="pa-2" width="296" data-emoji-picker>
      <v-text-field
        v-model="query"
        class="mb-2"
        prepend-inner-icon="mdi-magnify"
        clearable
        :autofocus="!mobile"
        :placeholder="t('chat.emojis.search')"
        :aria-label="t('chat.emojis.search')"
        data-emoji-search
        @keydown.enter.prevent="pickFirst"
      />
      <div v-if="standard.length" class="d-flex flex-wrap">
        <v-btn v-for="[e] in standard" :key="e" variant="text" size="small" min-width="36" class="px-0 text-body-large" :aria-label="e" @click="pick(e)">
          {{ e }}
        </v-btn>
      </div>
      <div v-if="!standard.length && !custom.length" class="text-body-medium text-medium-emphasis text-center py-4" data-emoji-none>
        {{ t('chat.emojis.noMatch') }}
      </div>
      <template v-if="custom.length">
        <v-divider v-if="standard.length" class="my-2" />
        <div class="text-body-small text-medium-emphasis px-1 mb-1">{{ t('chat.emojis.custom') }}</div>
        <div class="d-flex flex-wrap overflow-y-auto" :style="{ maxHeight: '144px' }">
          <v-btn
            v-for="e in custom"
            :key="e.id"
            v-tooltip:top="`:${e.name}:`"
            variant="text"
            size="small"
            min-width="36"
            class="px-0"
            :aria-label="`:${e.name}:`"
            @click="pick(`:${e.name}:`)"
          >
            <CustomEmojiImg :name="e.name" size="22px" />
          </v-btn>
        </div>
      </template>
      <v-divider class="my-2" />
      <v-btn variant="text" size="small" block prepend-icon="mdi-emoticon-plus-outline" @click="openManage">{{ t('chat.emojis.manage') }}</v-btn>
    </v-card>
  </v-menu>
  <CustomEmojiDialog v-if="manage" v-model="manage" />
</template>
