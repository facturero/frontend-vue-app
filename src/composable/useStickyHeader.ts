import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

/** Solo lo que este encabezado anima: propiedades CSS con valor de texto o número. */
type HeaderStyle = Record<string, string | number>;

/** Cuántos píxeles de scroll hacen falta para pasar del encabezado normal al fijo a todo el ancho. */
const SCROLL_RANGE = 120;

const px = (value: string): number => Number.parseFloat(value) || 0;

/**
 * Encabezado de página que se queda fijo bajo la barra superior al hacer scroll, para que sus acciones (p. ej. el carrito de
 * módulos) no desaparezcan. Arriba del todo es el panel de siempre, dentro del ancho del contenedor; al bajar crece de forma
 * GRADUAL (atado al scroll, no a un salto) hasta ocupar el 100 % del ancho útil de la pantalla, pierde las esquinas
 * redondeadas y proyecta sombra. NO cambia de alto: si lo hiciera, el contenido de debajo se desplazaría mientras se hace
 * scroll y el scroll "pelearía" con ese desplazamiento.
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
  let radius = 0;
  let bleedLeft = 0;
  let bleedRight = 0;

  /** Cuánto hay entre el ancho natural del encabezado (el contenedor) y el ancho útil de la pantalla (el área principal,
   *  sin el menú lateral): eso es lo que crece por cada lado. */
  function measure(): void {
    const header = el.value;
    const parent = header?.parentElement;
    if (!header || !parent) return;
    if (!radius) radius = px(getComputedStyle(header).borderTopLeftRadius);

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
    if (!el.value || !enabled()) {
      style.value = {};
      return;
    }
    const progress = Math.min(1, Math.max(0, window.scrollY / SCROLL_RANGE));
    style.value = {
      position: 'sticky',
      // La barra superior de Vuetify reserva su alto en esta variable de la capa principal.
      top: 'var(--v-layout-top, 0px)',
      zIndex: 5,
      marginLeft: `${-bleedLeft * progress}px`,
      marginRight: `${-bleedRight * progress}px`,
      // `!important`: la clase `rounded-lg` de la hoja también lo es y, sin esto, las esquinas nunca se aplanarían.
      borderRadius: `${radius * (1 - progress)}px !important`,
      boxShadow:
        progress > 0
          ? `0 ${4 * progress}px ${12 * progress}px rgba(var(--v-theme-on-surface), ${0.14 * progress})`
          : 'none',
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
    remeasure();
  });

  onBeforeUnmount(() => {
    window.removeEventListener('scroll', apply);
    window.removeEventListener('resize', remeasure);
    observer?.disconnect();
  });

  watch([el, enabled], remeasure);

  return style;
}
