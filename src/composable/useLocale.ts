import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLocale as useVuetifyLocale } from 'vuetify';

const STORAGE_KEY = 'app-locale';

export function useLocale() {
  const { locale } = useI18n();
  const vuetifyLocale = useVuetifyLocale();

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

  return { locale, setLocale };
}
