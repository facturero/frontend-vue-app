import { nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useTheme } from 'vuetify';
import { driver, type Config, type DriveStep, type Driver } from 'driver.js';
import { useAuthStore } from '@/stores/auth';
import { usePluginsStore } from '@/stores/plugins';
import { useUiStore } from '@/stores/ui';

/**
 * Tour guiado de la aplicación con driver.js (https://driverjs.com).
 *
 * Es un tour multi-pantalla: cada paso vive en la ruta que describe, de modo
 * que al pulsar Siguiente/Anterior el tour navega con vue-router y reanuda el
 * highlight una vez que la vista nueva montó su `PageHeader`.
 *
 * Reglas que respeta:
 * - Filtra pasos por permiso (`auth.can`) y plugin activo (`plugins.isActive`),
 *   igual que el menú lateral: un usuario solo ve el tour de lo que puede usar.
 * - El popover se pinta con tokens del tema (ver src/styles/tour.css). Los
 *   colores se vuelcan a variables CSS en `:root` porque driver.js monta el
 *   popover fuera del `.v-application` de Vuetify y no heredaría `--v-theme-*`.
 * - Al empezar, expande el rail del menú (el drawer colapsado no se puede
 *   resaltar con sentido) y lo restaura al terminar.
 * - "Visto" se persiste por usuario (`localStorage`) para no molestar, pero el
 *   botón de la top bar lo relanza siempre que se quiera.
 */

const STORAGE_PREFIX = 'crm:tour:v1';

let _driver: Driver | null = null;
let _pendingStep: number | null = null;
let _unregisterAfterEach: (() => void) | null = null;
let _prevRail = true;
let _prevDrawer = true;

/** `.driver-popover.app-tour` y elementos de su árbol. */
function applyThemeVars(colors: Record<string, string | undefined>): void {
  const root = document.documentElement.style;
  root.setProperty('--tour-primary', colors.primary ?? '#5D87FF');
  root.setProperty('--tour-on-primary', colors['on-primary'] ?? '#FFFFFF');
  root.setProperty('--tour-surface', colors.surface ?? '#FFFFFF');
  root.setProperty('--tour-on-surface', colors['on-surface'] ?? '#2A3547');
  root.setProperty('--tour-lightprimary', colors.lightprimary ?? '#ECF2FF');
}

function seenKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
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

export function isTourSeen(userId: string): boolean {
  return localStorage.getItem(seenKey(userId)) === '1';
}

export function useAppTour(): { startTour: () => void } {
  const router = useRouter();
  const { t } = useI18n();
  const theme = useTheme();

  const applyTheme = () => applyThemeVars(theme.current.value.colors);

  /** `router.afterEach` se registra una sola vez por sesión. */
  if (!_unregisterAfterEach) {
    _unregisterAfterEach = router.afterEach(async () => {
      if (_pendingStep !== null && _driver?.isActive()) {
        const target = _pendingStep;
        _pendingStep = null;
        await nextTick();
        _driver.moveTo(target);
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
    if (auth.user?.id) localStorage.setItem(seenKey(auth.user.id), '1');
    _driver?.destroy();
  }

  function buildConfig(): Config {
    const auth = useAuthStore();
    const plugins = usePluginsStore();

    const q = (sel: string) => (): Element => document.querySelector(sel) as Element;

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
      allowClose: true,
      popoverClass: 'app-tour',
      showProgress: true,
      progressText: t('tour.progress', { current: '{{current}}', total: '{{total}}' }),
      nextBtnText: t('tour.next'),
      prevBtnText: t('tour.prev'),
      doneBtnText: t('tour.done'),
      onHighlightStarted: () => applyTheme(),
      onNextClick: (_el, _step, opts) => goTo((opts.index ?? 0) + 1),
      onPrevClick: (_el, _step, opts) => goTo((opts.index ?? 0) - 1),
      onDoneClick: () => endTour(),
      onDestroyed: () => {
        const auth = useAuthStore();
        if (auth.user?.id && !isTourSeen(auth.user.id)) {
          localStorage.setItem(seenKey(auth.user.id), '1');
        }
        _driver = null;
        _pendingStep = null;
        useUiStore().setDrawer(_prevDrawer);
        useUiStore().rail = _prevRail;
      },
    };
  }

  function startTour(): void {
    if (_driver?.isActive()) return;
    purgeDriverArtifacts();
    applyTheme();

    const ui = useUiStore();
    _prevRail = ui.rail;
    _prevDrawer = ui.drawer;
    ui.setDrawer(true);
    ui.rail = false;

    _driver = driver(buildConfig());
    _driver.drive(0);
  }

  return { startTour };
}