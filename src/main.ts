import { createApp } from 'vue';
import { registerPlugins } from '@/plugins';
import App from './App.vue';
import 'driver.js/dist/driver.css';
import 'flag-icons/css/flag-icons.min.css';
import '@/styles/tour.css';
import '@/styles/mobile.css';
import '@/styles/print.css';
import router from '@/router';
import i18n from '@/plugins/i18n';
import { useAuthStore } from '@/stores/auth';
import { installGlobalErrorHandlers, reportError, setTelemetryContext, startTelemetry } from '@/telemetry';
import { addBreadcrumb } from '@/telemetry/breadcrumbs';

const app = createApp(App);

registerPlugins(app);

// Errores que nadie atrapó → telemetría. Poner un `errorHandler` reemplaza el aviso por defecto de Vue, así que se conserva.
app.config.errorHandler = (err, _instance, info) => {
  reportError(err, `vue:${info}`);
  console.error(err);
};
installGlobalErrorHandlers();

// Con esto cada span dice dónde estaba la persona. Solo identificadores (nunca correo ni nombre).
setTelemetryContext(() => {
  const user = useAuthStore().user as { id?: string; orgId?: string | null } | null;
  return {
    'app.route': router.currentRoute.value.matched.at(-1)?.path ?? router.currentRoute.value.path,
    'app.user_id': user?.id,
    'app.org_id': user?.orgId ?? undefined,
    'app.locale': String(i18n.global.locale),
    'app.viewport': `${window.innerWidth}x${window.innerHeight}`,
  };
});

// Cada cambio de pantalla entra en «lo último que hizo la persona» (con la plantilla de ruta, sin ids).
router.afterEach((to) => addBreadcrumb({ kind: 'route', text: `abrió ${to.matched.at(-1)?.path ?? to.path}` }));

app.mount('#app');
// Después de montar: el SDK se carga aparte y no retrasa la primera pantalla.
void startTelemetry();
