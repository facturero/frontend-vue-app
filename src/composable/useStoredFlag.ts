import { ref, watch, type Ref } from 'vue';

/**
 * Un sí/no que se recuerda en este navegador (secciones plegadas, preferencias de vista). Es una comodidad por persona: si el
 * navegador no deja guardar (ventana privada, almacenamiento bloqueado), funciona igual con el valor inicial.
 */
export function useStoredFlag(key: string, initial: boolean): Ref<boolean> {
  let start = initial;
  try {
    const saved = localStorage.getItem(key);
    if (saved === '1' || saved === '0') start = saved === '1';
  } catch {
    // Sin almacenamiento: se queda el valor inicial.
  }
  const flag = ref(start);
  watch(flag, (v) => {
    try {
      localStorage.setItem(key, v ? '1' : '0');
    } catch {
      // Sin almacenamiento: el cambio vale para esta visita.
    }
  });
  return flag;
}
