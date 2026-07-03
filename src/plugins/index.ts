import type { App } from 'vue';
import { createPinia } from 'pinia';
import vuetify from './vuetify';
import i18n from './i18n';
import router from '@/router';

export function registerPlugins(app: App): void {
  app.use(createPinia());
  app.use(router);
  app.use(vuetify);
  app.use(i18n);
}
