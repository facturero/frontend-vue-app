import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import { es, en, fr } from 'vuetify/locale';

export default createVuetify({
  components,
  directives,
  icons: { defaultSet: 'mdi' },
  locale: {
    locale: 'es',
    messages: { es, en, fr },
  },
  defaults: {
    VCard: { elevation: 2 },
    VTextField: { variant: 'outlined', density: 'compact' },
    VSelect: { variant: 'outlined', density: 'compact' },
    VBtn: { variant: 'flat', rounded: 'lg' },
  },
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        colors: {
          // Base
          primary: '#078DEE',
          'primary-darken-1': '#1F5592',

          secondary: '#6D788D',
          'secondary-darken-1': '#018786',

          success: '#02CA4B',
          info: '#06B6D4',
          warning: '#EAB308',
          error: '#FB4141',

          background: '#F8FAFC',
          surface: '#FFFFFF',

          // Surface variants
          'surface-light': '#EEEEEE',
          'surface-bright': '#FFFFFF',
          'surface-variant': '#424242',

          // Custom skin
          'skin-bordered-background': '#FAFAFA',
          'skin-bordered-surface': '#FFFFFF',

          // Utility
          code: '#F5F5F5',
          kbd: '#EEEEEE',

          // Foreground / text
          'on-primary': '#FFFFFF',
          'on-primary-darken-1': '#FFFFFF',

          'on-secondary': '#FFFFFF',
          'on-secondary-darken-1': '#FFFFFF',

          'on-success': '#FFFFFF',
          'on-info': '#FFFFFF',
          'on-warning': '#FFFFFF',
          'on-error': '#FFFFFF',

          'on-background': '#3F404D',
          'on-surface': '#3F404D',
          'on-surface-light': '#000000',
          'on-surface-bright': '#000000',
          'on-surface-variant': '#EEEEEE',

          'on-skin-bordered-background': '#000000',
          'on-skin-bordered-surface': '#000000',

          'on-code': '#000000',
          'on-kbd': '#000000',
        },
      },

      dark: {
        dark: true,
        colors: {
          // Base
          primary: '#078DEE',
          'primary-darken-1': '#277CC1',

          secondary: '#6D788D',
          'secondary-darken-1': '#48A9A6',

          success: '#02CA4B',
          info: '#06B6D4',
          warning: '#EAB308',
          error: '#FB4141',

          background: '#121212',
          surface: '#1E1E1E',

          // Surface variants
          'surface-light': '#424242',
          'surface-bright': '#CCBFD6',
          'surface-variant': '#C8C8C8',

          // Custom skin
          'skin-bordered-background': '#111827',
          'skin-bordered-surface': '#202A37',

          // Utility
          code: '#343434',
          kbd: '#424242',

          // Foreground / text
          'on-primary': '#FFFFFF',
          'on-primary-darken-1': '#FFFFFF',

          'on-secondary': '#FFFFFF',
          'on-secondary-darken-1': '#FFFFFF',

          'on-success': '#000000',
          'on-info': '#FFFFFF',
          'on-warning': '#FFFFFF',
          'on-error': '#FFFFFF',

          'on-background': '#E6E6F1',
          'on-surface': '#E6E6F1',
          'on-surface-light': '#FFFFFF',
          'on-surface-bright': '#000000',
          'on-surface-variant': '#000000',

          'on-skin-bordered-background': '#FFFFFF',
          'on-skin-bordered-surface': '#FFFFFF',

          'on-code': '#CCCCCC',
          'on-kbd': '#FFFFFF',
        },
      },
    },
  },
});
