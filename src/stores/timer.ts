import { defineStore } from 'pinia';
import { computed, onScopeDispose, ref } from 'vue';
import { projectsApi } from '@/api/projects';
import { usePluginsStore } from '@/stores/plugins';
import { extractError } from '@/utils/error';
import { localIsoDate } from '@/utils/projects';
import type { RunningTimer, TimeEntry } from '@/types/projects';

export const TIME_TRACKING_PLUGIN = 'projects.time_tracking';

/**
 * El cronómetro de horas (entregable 5): uno por persona, como en Asana, así que vive en un store y se ve igual en el detalle de la
 * tarea, en el proyecto y en «Horas». El servidor guarda cuándo arrancó; aquí solo se cuenta el tiempo para mostrarlo.
 *
 * Al detenerlo se manda el día LOCAL en que arrancó: el servidor está en UTC y un cronómetro de las 20:00 en Ecuador sería «mañana».
 */
export const useTimerStore = defineStore('timer', () => {
  const timer = ref<RunningTimer | null>(null);
  const now = ref(Date.now());
  const busy = ref(false);
  const error = ref<string | null>(null);
  let loaded = false;
  let tick: ReturnType<typeof setInterval> | null = null;

  const enabled = computed(() => usePluginsStore().isActive(TIME_TRACKING_PLUGIN));
  const elapsedMs = computed(() => (timer.value ? now.value - new Date(timer.value.startedAt).getTime() : 0));

  function run(t: RunningTimer | null): void {
    timer.value = t;
    if (t && !tick) tick = setInterval(() => (now.value = Date.now()), 1000);
    if (!t && tick) {
      clearInterval(tick);
      tick = null;
    }
    now.value = Date.now();
  }
  onScopeDispose(() => tick && clearInterval(tick));

  async function load(force = false): Promise<void> {
    if (!enabled.value || (loaded && !force)) return;
    try {
      run(await projectsApi.timer());
      loaded = true;
    } catch {
      // Sin cronómetro visible no se bloquea nada.
    }
  }

  async function act<T>(work: () => Promise<T>): Promise<T | undefined> {
    busy.value = true;
    error.value = null;
    try {
      return await work();
    } catch (err) {
      error.value = extractError(err);
      return undefined;
    } finally {
      busy.value = false;
    }
  }

  /** Arranca en una tarea; si había otro en marcha, el servidor lo detiene y registra (lo devuelve en `stopped`). */
  async function start(taskId: string): Promise<TimeEntry | null> {
    const previous = timer.value ? localIsoDate(new Date(timer.value.startedAt)) : undefined;
    const out = await act(() => projectsApi.startTimer(taskId, previous));
    if (out) run(out.timer);
    return out?.stopped ?? null;
  }

  async function stop(): Promise<TimeEntry | null> {
    if (!timer.value) return null;
    const workedOn = localIsoDate(new Date(timer.value.startedAt));
    const entry = await act(() => projectsApi.stopTimer(workedOn));
    // Si ya no había cronómetro (se detuvo en otra pestaña), igual se limpia la pantalla.
    run(null);
    return entry ?? null;
  }

  async function discard(): Promise<void> {
    await act(() => projectsApi.discardTimer());
    run(null);
  }

  return { timer, elapsedMs, busy, error, enabled, load, start, stop, discard };
});
