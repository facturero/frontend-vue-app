import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

/** Solo lo que este encabezado anima: propiedades CSS con valor de texto o número. */
type HeaderStyle = Record<string, string | number>;

/** Cuántos píxeles de scroll hacen falta para pasar del encabezado normal al fijo a todo el ancho. */
const SCROLL_RANGE = 120;
/** Un encabezado más alto que esto (en pantallas angostas las acciones bajan a otra fila) no se fija: comería demasiada pantalla. */
const MAX_REST_HEIGHT = 112;
/** Relleno vertical con el que queda el encabezado ya fijo (arriba del todo conserva el suyo). */
const STUCK_PADDING = 8;

const px = (value: string): number => Number.parseFloat(value) || 0;

/**
 * Cuánto se ha hecho scroll. Mientras un diálogo está abierto, Vuetify bloquea el scroll de la página dejándola con
 * `position: fixed` y la desplaza con `--v-body-scroll-y`: `window.scrollY` pasa a valer 0 aunque la persona esté a media página,
 * y el encabezado volvería de golpe a su tamaño normal detrás del diálogo. Por eso, bloqueado, se lee la posición guardada.
 */
function currentScroll(): number {
  const root = document.documentElement;
  if (root.classList.contains('v-overlay-scroll-blocked')) return -px(root.style.getPropertyValue('--v-body-scroll-y'));
  return window.scrollY;
}

/**
 * Encabezado de página que se queda fijo bajo la barra superior al hacer scroll, para que sus acciones (p. ej. el carrito de
 * módulos) no desaparezcan. Arriba del todo es el panel de siempre, dentro del ancho del contenedor; al bajar crece de forma
 * GRADUAL (atado al scroll, no a un salto) hasta ocupar el 100 % del ancho útil de la pantalla, pierde las esquinas
 * redondeadas y se compacta (menos relleno arriba y abajo), sin sombra. Su hueco en la página NO cambia: lo que pierde de alto
 * se lo suma al margen inferior; si no, el contenido de debajo se desplazaría mientras se hace scroll y el scroll
 * "pelearía" con ese desplazamiento.
 *
 * Se activa solo donde tiene sentido: no dentro de tarjetas ni diálogos, ni si el encabezado es muy alto en reposo (móvil).
 *
 * Devuelve el `style` que hay que poner en el elemento. Lo que se anima son márgenes negativos: el contenedor del encabezado
 * no cambia de tamaño, así que el resto de la página no se mueve.
 *
 * Lo caro (medir cuánto sobra a cada lado) se hace solo al montar y al cambiar el ancho; en cada scroll solo se calcula el
 * progreso. No usa requestAnimationFrame: el navegador ya entrega un evento de scroll por fotograma.
 */
export function useStickyHeader(el: Ref<HTMLElement | null>, enabled: () => boolean): Ref<HeaderStyle> {
  const style = ref<HeaderStyle>({});
  let observer: ResizeObserver | null = null;
  let scrollLockObserver: MutationObserver | null = null;
  let radius = 0;
  let padding = 0;
  let marginBottom = 0;
  let appliedShrink = 0;
  let fits = true;
  let bleedLeft = 0;
  let bleedRight = 0;

  /** Cuánto hay entre el ancho natural del encabezado (el contenedor) y el ancho útil de la pantalla (el área principal,
   *  sin el menú lateral): eso es lo que crece por cada lado. */
  function measure(): void {
    const header = el.value;
    const parent = header?.parentElement;
    if (!header || !parent) return;
    if (!radius) {
      // Los valores de partida son los de la hoja normal; se leen una vez, antes de que este código los toque.
      const own = getComputedStyle(header);
      radius = px(own.borderTopLeftRadius);
      padding = px(own.paddingTop);
      marginBottom = px(own.marginBottom);
    }

    // Dentro de una tarjeta o un diálogo (p. ej. las secciones de Ajustes, que ya viven bajo su propio encabezado) no hay página
    // que seguir: no se fija. Y un encabezado muy alto en reposo tampoco.
    fits = !header.closest('.v-card, .v-dialog') && header.offsetHeight + 2 * appliedShrink <= MAX_REST_HEIGHT;

    const main = header.closest('.v-main');
    if (!main) {
      bleedLeft = 0;
      bleedRight = 0;
      return;
    }
    const mainBox = main.getBoundingClientRect();
    const mainStyle = getComputedStyle(main);
    const parentBox = parent.getBoundingClientRect();
    const parentStyle = getComputedStyle(parent);
    const usableLeft = mainBox.left + px(mainStyle.paddingLeft);
    const usableRight = mainBox.right - px(mainStyle.paddingRight);
    bleedLeft = Math.max(0, parentBox.left + px(parentStyle.paddingLeft) - usableLeft);
    bleedRight = Math.max(0, usableRight - (parentBox.right - px(parentStyle.paddingRight)));
  }

  function apply(): void {
    if (!el.value || !enabled() || !fits) {
      appliedShrink = 0;
      style.value = {};
      return;
    }
    const progress = Math.min(1, Math.max(0, currentScroll() / SCROLL_RANGE));
    const shrink = Math.max(0, padding - STUCK_PADDING) * progress;
    appliedShrink = shrink;
    // `!important`: las clases utilitarias de la hoja (`pa-6`, `mb-6`, `rounded-lg`) también lo son y, sin esto, ganarían.
    style.value = {
      position: 'sticky',
      // La barra superior de Vuetify reserva su alto en esta variable de la capa principal.
      top: 'var(--v-layout-top, 0px)',
      zIndex: 5,
      marginLeft: `${-bleedLeft * progress}px`,
      marginRight: `${-bleedRight * progress}px`,
      borderRadius: `${radius * (1 - progress)}px !important`,
      paddingTop: `${padding - shrink}px !important`,
      paddingBottom: `${padding - shrink}px !important`,
      // Lo que pierde de alto arriba y abajo (2 × shrink) se devuelve como margen: el hueco en la página es el mismo.
      marginBottom: `${marginBottom + 2 * shrink}px !important`,
    };
  }

  function remeasure(): void {
    measure();
    apply();
  }

  onMounted(() => {
    window.addEventListener('scroll', apply, { passive: true });
    window.addEventListener('resize', remeasure);
    // El menú lateral (rail / completo) cambia el ancho del contenedor sin que haya scroll ni resize.
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(remeasure);
      if (el.value?.parentElement) observer.observe(el.value.parentElement);
    }
    // Abrir o cerrar un diálogo no genera evento de scroll: se vigila el bloqueo para no dejar el encabezado a medias.
    if (typeof MutationObserver !== 'undefined') {
      scrollLockObserver = new MutationObserver(apply);
      scrollLockObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    }
    remeasure();
  });

  onBeforeUnmount(() => {
    window.removeEventListener('scroll', apply);
    window.removeEventListener('resize', remeasure);
    observer?.disconnect();
    scrollLockObserver?.disconnect();
  });

  watch([el, enabled], remeasure);

  return style;
}
