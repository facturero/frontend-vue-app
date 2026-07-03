import { createI18n } from 'vue-i18n';
import es from '@/i18n/es.json';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';

const savedLocale = localStorage.getItem('app-locale') || 'es';

export default createI18n({
  locale: savedLocale,
  fallbackLocale: 'es',
  messages: { es, en, fr },
});
