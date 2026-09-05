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
    // Superficies. Sin elevación de Vuetify: el radio (7px) y la sombra suave
    // los aporta la clase `card-surface`, definida en index.html.
    VCard: { elevation: 0, class: 'card-surface' },
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
    // Sin sombras ni bordes: el armazón se separa del contenido por color de
    // fondo (surface blanco sobre background gris), no por líneas.
    VAppBar: { elevation: 0, class: 'border-b' },
    VNavigationDrawer: { elevation: 0 },
    VList: { class: 'py-1' },
  },
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        colors: {
          // Base
          primary: '#5D87FF',
          'primary-darken-1': '#4570EA',

          secondary: '#49BEFF',
          'secondary-darken-1': '#23AFDB',

          success: '#13DEB9',
          info: '#539BFF',
          warning: '#FFAE1F',
          error: '#FA896B',

          // Fondos tonales suaves: chips, alertas, badges y cabeceras de
          // sección. Sin ellos el conjunto se ve plano — son la mitad del
          // carácter visual. Uso: color="lightprimary".
          lightprimary: '#ECF2FF',
          lightsecondary: '#E8F7FF',
          lightsuccess: '#E6FFFA',
          lightinfo: '#EBF3FE',
          lightwarning: '#FEF5E5',
          lighterror: '#FDEDE8',

          // Bordes y estados
          borderColor: '#E5EAEF',
          inputBorder: '#DFE5EF',
          hoverColor: '#F6F9FC',
          grey100: '#F2F6FA',
          grey200: '#EAEFF4',

          background: '#F2F6FA',
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

          // Los fondos tonales llevan texto del color base, no blanco.
          'on-lightprimary': '#5D87FF',
          'on-lightsecondary': '#49BEFF',
          'on-lightsuccess': '#13DEB9',
          'on-lightinfo': '#539BFF',
          'on-lightwarning': '#FFAE1F',
          'on-lighterror': '#FA896B',

          'on-background': '#2A3547',
          'on-surface': '#2A3547',
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
          primary: '#5D87FF',
          'primary-darken-1': '#4570EA',

          secondary: '#49BEFF',
          'secondary-darken-1': '#23AFDB',

          success: '#13DEB9',
          info: '#539BFF',
          warning: '#FFAE1F',
          error: '#FA896B',

          // En oscuro los tonales son versiones apagadas, no claras.
          lightprimary: '#253662',
          lightsecondary: '#1C455D',
          lightsuccess: '#1B3C48',
          lightinfo: '#223662',
          lightwarning: '#4D3A2A',
          lighterror: '#4B313D',

          borderColor: '#333F55',
          inputBorder: '#465670',
          hoverColor: '#333F55',
          grey100: '#333F55',
          grey200: '#465670',

          background: '#2A3447',
          surface: '#2A3447',

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

          // Sobre tonales oscuros el texto va en el color base, que resalta.
          'on-lightprimary': '#5D87FF',
          'on-lightsecondary': '#49BEFF',
          'on-lightsuccess': '#13DEB9',
          'on-lightinfo': '#539BFF',
          'on-lightwarning': '#FFAE1F',
          'on-lighterror': '#FA896B',

          'on-background': '#EAEFF4',
          'on-surface': '#EAEFF4',
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
