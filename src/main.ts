import { createApp } from 'vue';
import { createPinia } from 'pinia';

import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

import App from './App.vue';
import router from './router';

const vuetify = createVuetify({
  components,
  directives,
  icons: { defaultSet: 'mdi' },
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          primary: '#5b3df5',
          secondary: '#00b8a9',
        },
      },
    },
  },
});

createApp(App).use(createPinia()).use(router).use(vuetify).mount('#app');
