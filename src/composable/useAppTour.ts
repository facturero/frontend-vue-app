import { nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useTheme } from 'vuetify';
import { driver, type Config, type DriveStep, type Driver } from 'driver.js';
import { useAuthStore } from '@/stores/auth';
import { usePluginsStore } from '@/stores/plugins';
import { useUiStore } from '@/stores/ui';

/**
 * Tours guiados de la aplicación con driver.js (https://driverjs.com).
 *
 * Hay tres de la aplicación, y se encadenan en el orden en que un usuario nuevo los encuentra:
 *
 *   'welcome'       (/profile)               da la bienvenida y explica los
 *                                            datos personales que hay que dar.
 *   'organization'  (/organization/settings) explica campo a campo la ficha de
 *                                            la organización.
 *   'app'           (multi-pantalla)         el recorrido por los módulos, que
 *                                            sale con el alta ya terminada.
 *
 * El 'app' es multi-pantalla: cada paso vive en la ruta que describe, de modo
 * que al pulsar Siguiente/Anterior el tour navega con vue-router y reanuda el
 * highlight una vez que la vista nueva montó su `PageHeader`. Los dos del alta
 * ocurren dentro de una sola vista, y los lanza la propia vista cuando ya tiene
 * el formulario pintado (ver ProfileView y OrganizationSettingsView).
 *
 * Y uno por cada módulo complejo (`PLUGIN_TOURS`): sale solo justo después de comprarlo en el catálogo (ver PluginCartDialog) y
 * se puede pedir otra vez desde el menú ⋯ del módulo. Hoy: 'projects' (Proyectos y tareas). Es multi-pantalla como el 'app'.
 *
 * Reglas que respeta:
 * - Filtra pasos por permiso (`auth.can`) y plugin activo (`plugins.isActive`),
 *   igual que el menú lateral: un usuario solo ve el tour de lo que puede usar.
 * - El popover se pinta con tokens del tema (ver src/styles/tour.css). Los
 *   colores se vuelcan a variables CSS en `:root` porque driver.js monta el
 *   popover fuera del `.v-application` de Vuetify y no heredaría `--v-theme-*`.
 * - Solo el tour 'app' expande el rail del menú (el drawer colapsado no se
 *   puede resaltar con sentido) y lo restaura al terminar: los del alta no lo
 *   tocan porque ninguno de sus pasos señala el menú.
 * - "Visto" se persiste por usuario y por tour (`localStorage`) para no
 *   molestar, pero el botón de la top bar relanza el 'app' siempre que se
 *   quiera.
 */

const STORAGE_PREFIX = 'crm:tour:v1';
const DISABLED_KEY = 'crm:tour:disabled';

export type TourName = 'app' | 'welcome' | 'organization' | 'projects';

/**
 * Módulos que traen recorrido propio al comprarlos: los que no se entienden de un vistazo. Un módulo nuevo se suma aquí con su
 * función de pasos en `buildConfig`.
 */
export const PLUGIN_TOURS: Readonly<Record<string, TourName>> = { 'projects.tasks_kanban': 'projects' };

/** El recorrido que toca enseñar tras activar estos módulos (el primero que tenga uno), o `null`. */
export function tourForPlugins(codes: readonly string[]): TourName | null {
  for (const code of codes) if (PLUGIN_TOURS[code]) return PLUGIN_TOURS[code]!;
  return null;
}

let _driver: Driver | null = null;
let _activeTour: TourName = 'app';
let _pendingStep: number | null = null;
let _unregisterAfterEach: (() => void) | null = null;
let _prevRail = true;
let _prevDrawer = true;

/** `.driver-popover.app-tour` y elementos de su árbol. */
// Vuetify 4 admite colores de tema como objeto (RGB/HSV), no solo texto: aquí solo sirve el texto (hex), lo demás cae al respaldo.
function applyThemeVars(themeColors: Readonly<Record<string, unknown>>): void {
  const colors = Object.fromEntries(Object.entries(themeColors).filter((e): e is [string, string] => typeof e[1] === 'string'));
  const root = document.documentElement.style;
  root.setProperty('--tour-primary', colors.primary ?? '#5D87FF');
  root.setProperty('--tour-on-primary', colors['on-primary'] ?? '#FFFFFF');
  root.setProperty('--tour-surface', colors.surface ?? '#FFFFFF');
  root.setProperty('--tour-on-surface', colors['on-surface'] ?? '#2A3547');
  root.setProperty('--tour-lightprimary', colors.lightprimary ?? '#ECF2FF');
}

/**
 * El tour 'app' conserva la clave sin sufijo con la que se viene guardando
 * desde el principio: cambiarla ahora se lo volvería a sacar a todo el mundo.
 */
function seenKey(userId: string, tour: TourName): string {
  return tour === 'app' ? `${STORAGE_PREFIX}:${userId}` : `${STORAGE_PREFIX}:${userId}:${tour}`;
}

/**
 * driver.js solo permite una instancia con sentido. Durante desarrollo, HMR de
 * Vite puede dejar una instancia vieja viva (su `.driver-popover` queda en el
 * DOM) y arrancar una nueva al volver a evaluar este módulo: dos popovers a la
 * vez, el "bienvenido" pegado sobre el paso actual. Antes de montar un driver
 * nuevo se purga cualquier artefacto huérfano de la capa de overlay.
 */
function purgeDriverArtifacts(): void {
  document
    .querySelectorAll('.driver-popover, .driver-overlay, #driver-dummy-element')
    .forEach((el) => el.remove());
}

export function isTourSeen(userId: string, tour: TourName = 'app'): boolean {
  return localStorage.getItem(seenKey(userId, tour)) === '1';
}

export function markTourSeen(userId: string, tour: TourName): void {
  localStorage.setItem(seenKey(userId, tour), '1');
}

/**
 * Condición única para los tours que salen solos: no visto y no apagado.
 *
 * `crm:tour:disabled` a '1' en localStorage los apaga. Lo usan los tests e2e,
 * que conducen el alta a mano y a los que el overlay de driver.js les come
 * los clics. El botón de ayuda de la top bar no consulta nada de esto: pedir
 * el tour a mano siempre funciona.
 */
export function shouldAutoStartTour(userId: string, tour: TourName): boolean {
  if (localStorage.getItem(DISABLED_KEY) === '1') return false;
  return !isTourSeen(userId, tour);
}

export function useAppTour(): { startTour: (tour?: TourName) => void } {
  const router = useRouter();
  const { t } = useI18n();
  const theme = useTheme();

  const applyTheme = () => applyThemeVars(theme.current.value.colors);

  /** `router.afterEach` se registra una sola vez por sesión. */
  if (!_unregisterAfterEach) {
    _unregisterAfterEach = router.afterEach(async () => {
      if (_pendingStep !== null && _driver) {
        const target = _pendingStep;
        _pendingStep = null;
        await nextTick();
        // Si el recorrido arranca en otra pantalla (el de un módulo, recién comprado en el catálogo), todavía no está activo.
        if (_driver.isActive()) _driver.moveTo(target);
        else _driver.drive(target);
      }
    });
  }

  function goTo(target: number): void {
    const steps = _driver?.getConfig().steps ?? [];
    if (target >= steps.length) {
      _driver?.destroy();
      return;
    }
    if (target < 0) {
      _driver?.movePrevious();
      return;
    }
    const route = steps[target].data?.route as string | undefined;
    const current = router.currentRoute.value.name as string | undefined;
    if (route && route !== current) {
      _pendingStep = target;
      router.push({ name: route });
    } else {
      _driver?.moveTo(target);
    }
  }

  function endTour(): void {
    const auth = useAuthStore();
    if (auth.user?.id) markTourSeen(auth.user.id, _activeTour);
    _driver?.destroy();
  }

  const q = (sel: string) => (): Element => document.querySelector(sel) as Element;

  /**
   * Alta, paso 1: los datos personales. Sale sobre /profile en cuanto la cuenta
   * existe, así que lo primero que ve un usuario nuevo es el porqué de pedirle
   * datos antes de dejarle entrar.
   *
   * Cuenta el para qué de la pantalla, no qué va en cada campo: de eso se
   * encarga el "?" que cada campo lleva al lado (components/ui/FieldHelp.vue).
   */
  function welcomeSteps(): DriveStep[] {
    return [
      {
        popover: {
          title: t('tour.onboarding.hello.title'),
          description: t('tour.onboarding.hello.desc'),
        },
      },
      {
        element: q('[data-tour="profile-form"]'),
        popover: {
          title: t('tour.onboarding.profile.form.title'),
          description: t('tour.onboarding.profile.form.desc'),
          side: 'top',
          align: 'center',
        },
      },
      {
        element: q('[data-tour="profile-submit"]'),
        popover: {
          title: t('tour.onboarding.profile.submit.title'),
          description: t('tour.onboarding.profile.submit.desc'),
          side: 'top',
          align: 'center',
        },
      },
    ];
  }

  /**
   * Alta, paso 2: la ficha de la organización.
   *
   * `greet` antepone la bienvenida cuando el usuario nunca pasó por el tour de
   * perfil: quien se registra con identificación entra directo aquí (el guard
   * del router lo manda a /organization/settings) y se quedaría sin saludo.
   */
  function organizationSteps(greet: boolean): DriveStep[] {
    const steps: DriveStep[] = [];

    if (greet) {
      steps.push({
        popover: {
          title: t('tour.onboarding.hello.title'),
          description: t('tour.onboarding.hello.desc'),
        },
      });
    }

    steps.push(
      {
        element: q('[data-tour="org-form"]'),
        popover: {
          title: t('tour.onboarding.org.intro.title'),
          description: t('tour.onboarding.org.intro.desc'),
          side: 'top',
          align: 'center',
        },
      },
      {
        element: q('[data-tour="org-submit"]'),
        popover: {
          title: t('tour.onboarding.org.submit.title'),
          description: t('tour.onboarding.org.submit.desc'),
          side: 'top',
          align: 'center',
        },
      },
    );

    return steps;
  }

  /** El recorrido por los módulos, ya con cuenta y organización listas. */
  function appSteps(): DriveStep[] {
    const auth = useAuthStore();
    const plugins = usePluginsStore();

    const pluginStep = (plugin: string): boolean => plugins.isActive(plugin);

    const steps: DriveStep[] = [
      {
        data: { route: 'home' },
        popover: {
          title: t('tour.welcome.title'),
          description: t('tour.welcome.desc'),
        },
      },
      {
        element: q('main h1'),
        data: { route: 'home' },
        popover: {
          title: t('tour.home.title'),
          description: t('tour.home.desc'),
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: q('.v-navigation-drawer'),
        data: { route: 'home' },
        popover: {
          title: t('tour.menu.title'),
          description: t('tour.menu.desc'),
          side: 'right',
          align: 'start',
        },
      },
    ];

    if (auth.can('user:read')) {
      steps.push({
        element: q('main h1'),
        data: { route: 'roles' },
        popover: {
          title: t('tour.roles.title'),
          description: t('tour.roles.desc'),
          side: 'bottom',
          align: 'start',
        },
      });
    }

    if (auth.can('user:read')) {
      steps.push({
        element: q('main h1'),
        data: { route: 'employees' },
        popover: {
          title: t('tour.employees.title'),
          description: t('tour.employees.desc'),
          side: 'bottom',
          align: 'start',
        },
      });
    }

    if (auth.can('customer:read') && pluginStep('crm.contacts')) {
      steps.push({
        element: q('main h1'),
        data: { route: 'customers' },
        popover: {
          title: t('tour.customers.title'),
          description: t('tour.customers.desc'),
          side: 'bottom',
          align: 'start',
        },
      });
    }
    if (auth.can('product:read') && pluginStep('infra.catalog_products')) {
      steps.push({
        element: q('main h1'),
        data: { route: 'products' },
        popover: {
          title: t('tour.products.title'),
          description: t('tour.products.desc'),
          side: 'bottom',
          align: 'start',
        },
      });
    }
    if (auth.can('invoice:read') && pluginStep('finance.electronic_invoicing')) {
      steps.push({
        element: q('main h1'),
        data: { route: 'invoices' },
        popover: {
          title: t('tour.invoices.title'),
          description: t('tour.invoices.desc'),
          side: 'bottom',
          align: 'start',
        },
      });
    }

    steps.push({
      element: q('main h1'),
      data: { route: 'settings' },
      popover: {
        title: t('tour.settings.title'),
        description: t('tour.settings.desc'),
        side: 'bottom',
        align: 'start',
      },
    });

    if (auth.can('plugins:read')) {
      steps.push({
        element: q('main h1'),
        data: { route: 'plugins' },
        popover: {
          title: t('tour.plugins.title'),
          description: t('tour.plugins.desc'),
          side: 'bottom',
          align: 'start',
        },
      });
    }

    steps.push({
      popover: {
        title: t('tour.finish.title'),
        description: t('tour.finish.desc'),
      },
    });

    return steps;
  }

  /**
   * Proyectos y tareas, recién comprado: qué es, cómo empezar y dónde está cada cosa. Recorre /projects y /my-tasks (y Horas y
   * Carga de trabajo si también se compraron). Lo de dentro de un proyecto se cuenta sin señalar nada: recién comprado no hay
   * ninguno que abrir.
   */
  function projectsSteps(): DriveStep[] {
    const auth = useAuthStore();
    const plugins = usePluginsStore();
    const step = (route: string, key: string, element?: string): DriveStep => ({
      ...(element ? { element: q(element) } : {}),
      data: { route },
      popover: {
        title: t(`tour.projects.${key}.title`),
        description: t(`tour.projects.${key}.desc`),
        ...(element ? { side: 'bottom' as const, align: 'start' as const } : {}),
      },
    });

    const steps: DriveStep[] = [step('projects', 'welcome')];
    if (auth.can('project:create')) steps.push(step('projects', 'create', '[data-tour="projects-new"]'));
    steps.push(step('projects', 'inside'), step('projects', 'detail'));
    steps.push(step('my-tasks', 'myTasks', 'main h1'), step('my-tasks', 'quickAdd', '[data-tour="my-tasks-quick"]'));
    if (plugins.isActive('projects.time_tracking')) steps.push(step('time-tracking', 'time', 'main h1'));
    if (plugins.isActive('projects.resource_allocation')) steps.push(step('workload', 'workload', 'main h1'));
    steps.push(step('my-tasks', 'finish'));
    return steps;
  }

  function buildConfig(tour: TourName): Config {
    const auth = useAuthStore();

    let steps: DriveStep[];
    if (tour === 'welcome') {
      steps = welcomeSteps();
    } else if (tour === 'organization') {
      steps = organizationSteps(!auth.user?.id || !isTourSeen(auth.user.id, 'welcome'));
    } else if (tour === 'projects') {
      steps = projectsSteps();
    } else {
      steps = appSteps();
    }

    return {
      steps,
      animate: true,
      duration: 650,
      smoothScroll: true,
      overlayColor: '#000000',
      overlayOpacity: 0.55,
      stageRadius: 12,
      stagePadding: 10,
      waitForElement: 900,
      // Del tour solo se sale por la X del popover. `allowClose` se queda en
      // true porque es lo que hace que driver.js pinte esa X; lo que se
      // desarma es todo lo demás que cerraba sin querer: el clic en el fondo
      // (un hook vacío lo deja inerte) y la tecla Escape, que va dentro del
      // control por teclado. El precio de esto último es quedarse también sin
      // las flechas para avanzar; los botones del popover siguen ahí.
      allowClose: true,
      overlayClickBehavior: () => {},
      allowKeyboardControl: false,
      popoverClass: 'app-tour',
      showProgress: true,
      progressText: t('tour.progress', { current: '{{current}}', total: '{{total}}' }),
      nextBtnText: t('tour.next'),
      prevBtnText: t('tour.prev'),
      doneBtnText: tour === 'app' || tour === 'projects' ? t('tour.done') : t('tour.gotIt'),
      onHighlightStarted: () => applyTheme(),
      onNextClick: (_el, _step, opts) => goTo((opts.index ?? 0) + 1),
      onPrevClick: (_el, _step, opts) => goTo((opts.index ?? 0) - 1),
      onDoneClick: () => endTour(),
      onDestroyed: () => {
        const auth = useAuthStore();
        if (auth.user?.id && !isTourSeen(auth.user.id, _activeTour)) {
          markTourSeen(auth.user.id, _activeTour);
        }
        _driver = null;
        _pendingStep = null;
        useUiStore().setDrawer(_prevDrawer);
        useUiStore().rail = _prevRail;
      },
    };
  }

  function startTour(tour: TourName = 'app'): void {
    if (_driver?.isActive()) return;
    purgeDriverArtifacts();
    applyTheme();

    _activeTour = tour;

    const ui = useUiStore();
    _prevRail = ui.rail;
    _prevDrawer = ui.drawer;
    // Los tours del alta transcurren dentro de un formulario: abrir el menú
    // solo taparía la vista en móvil, donde el drawer es temporary.
    if (tour === 'app') {
      ui.setDrawer(true);
      ui.rail = false;
    }

    const config = buildConfig(tour);
    _driver = driver(config);
    // Un recorrido multi-pantalla pedido desde otra (el de un módulo, al terminar la compra en el catálogo) arranca en la pantalla
    // de su primer paso: el `afterEach` de arriba lo empieza cuando la vista montó.
    const firstRoute = config.steps?.[0]?.data?.route as string | undefined;
    if (firstRoute && firstRoute !== router.currentRoute.value.name) {
      _pendingStep = 0;
      void router.push({ name: firstRoute });
    } else {
      _driver.drive(0);
    }
  }

  return { startTour };
}
