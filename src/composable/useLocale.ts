import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLocale as useVuetifyLocale } from 'vuetify';

const STORAGE_KEY = 'app-locale';

/**
 * Bandera que representa cada idioma (código ISO 3166 de `flag-icons`). Un idioma
 * no tiene bandera propia: se elige el país con más hablantes o el más reconocible.
 * Si un idioma no está aquí se prueba su propio código, que acierta en muchos
 * casos (de → de, it → it); los que no, conviene añadirlos al traducir.
 */
const LANGUAGE_FLAGS: Record<string, string> = {
  en: 'us', es: 'es', fr: 'fr', pt: 'br', de: 'de', it: 'it', nl: 'nl', ja: 'jp', zh: 'cn',
  ko: 'kr', ar: 'sa', hi: 'in', ru: 'ru', uk: 'ua', el: 'gr', he: 'il', fa: 'ir', sv: 'se',
  da: 'dk', nb: 'no', cs: 'cz', vi: 'vn', ms: 'my', sw: 'ke', qu: 'pe', ca: 'es-ct', eu: 'es-pv', gl: 'es-ga',
};

export interface LanguageOption {
  code: string;
  flag: string;
  /** Nombre en el propio idioma ("Français"): es como lo busca quien no entiende la interfaz actual. */
  nativeName: string;
  /** Nombre en el idioma de la interfaz ("Francés"). */
  localizedName: string;
}

function languageName(code: string, inLocale: string): string {
  try {
    const name = new Intl.DisplayNames([inLocale], { type: 'language' }).of(code) ?? code;
    return name.charAt(0).toLocaleUpperCase(inLocale) + name.slice(1);
  } catch {
    return code;
  }
}

export function useLocale() {
  const { locale, availableLocales } = useI18n();
  const vuetifyLocale = useVuetifyLocale();

  /** Los idiomas salen de los mensajes cargados en i18n: añadir un JSON de traducción basta para que aparezca. */
  const languages = computed<LanguageOption[]>(() =>
    [...availableLocales]
      .map((code) => ({
        code,
        flag: LANGUAGE_FLAGS[code] ?? code,
        nativeName: languageName(code, code),
        localizedName: languageName(code, locale.value),
      }))
      .sort((a, b) => a.nativeName.localeCompare(b.nativeName, locale.value)),
  );

  function setLocale(lang: string): void {
    locale.value = lang;
    vuetifyLocale.current.value = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }

  watch(locale, (val) => {
    vuetifyLocale.current.value = val;
    localStorage.setItem(STORAGE_KEY, val);
    document.documentElement.lang = val;
  });

  return { locale, languages, setLocale };
}
