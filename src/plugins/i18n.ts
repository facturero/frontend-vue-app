import { createI18n } from 'vue-i18n';
import es from '@/i18n/es.json';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';

// Sin navegador (pruebas unitarias de utilidades que formatean fechas o dinero) no hay localStorage: se usa el idioma por defecto.
const savedLocale = (typeof localStorage !== 'undefined' ? localStorage.getItem('app-locale') : null) || 'es';

export default createI18n({
  locale: savedLocale,
  fallbackLocale: 'es',
  messages: { es, en, fr },
});
