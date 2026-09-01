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
  // ---------------------------------------------------------------------------
  // FUENTE ÚNICA DE VERDAD DEL UI.
  // Antes de escribir una prop de estilo en una vista, mírala aquí: si el valor
  // que necesitas es el mismo, no la escribas. Si necesitas otro valor de forma
  // recurrente, cámbialo aquí, no en la vista. Ver docs/UI-UX.md.
  // ---------------------------------------------------------------------------
  defaults: {
    // Superficies
    VCard: { elevation: 2, rounded: 'lg' },
    VSheet: { rounded: 'lg' },

    // Acciones
    VBtn: { variant: 'flat', rounded: 'lg', class: 'text-none' },

    // Campos de formulario: un único par variant + density para todos
    VTextField: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
    VTextarea: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
    VSelect: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
    VAutocomplete: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
    VCombobox: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
    VFileInput: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
    VCheckbox: { color: 'primary', density: 'compact', hideDetails: 'auto' },
    VSwitch: { color: 'primary', density: 'compact', hideDetails: 'auto' },
    VRadioGroup: { color: 'primary', density: 'compact', hideDetails: 'auto' },

    // Feedback
    VAlert: { variant: 'tonal', density: 'compact', rounded: 'lg' },
    VChip: { variant: 'tonal' },
    VDialog: { maxWidth: 480 },

    // Datos
    VDataTable: { hover: true },
    VDataTableServer: { hover: true },

    // Navegación
    VAppBar: { elevation: 0, class: 'border-b' },
    VNavigationDrawer: { elevation: 0, class: 'border-e' },
    VList: { class: 'py-1' },
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

          // Panel lateral de login / registro -> clase bg-auth-panel
          'auth-panel': '#EDF2FB',

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

          // Panel lateral de login / registro -> clase bg-auth-panel
          'auth-panel': '#18212F',

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
