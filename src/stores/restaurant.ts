import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { restaurantApi } from '@/api/restaurant';
import { useAuthStore } from '@/stores/auth';
import { extractError } from '@/utils/error';
import type {
  AddScheduleExceptionInput,
  BulkCreateTablesInput,
  CreateTableInput,
  DiningTable,
  Floor,
  FloorPlan,
  SaveFloorPlanInput,
  SaveScheduleInput,
  ScheduleException,
  ScheduleView,
  SetupResult,
  SlotPreview,
  UpdateFloorInput,
  UpdateTableInput,
} from '@/types/restaurant';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento la pantalla funciona igual: solo no recuerda el
    // establecimiento elegido.
  }
}

/**
 * Estado del plugin de restaurantes que NO es el borrador del editor: qué
 * establecimiento se está mirando, su planta y su horario, y las escrituras
 * puntuales (mesas suelta, turnos, excepciones). El plano en edición vive aparte
 * (`stores/floorplanEditor.ts`) porque tiene deshacer/rehacer y autoguardado.
 */
export const useRestaurantStore = defineStore('restaurant', () => {
  const auth = useAuthStore();

  const selectedEstablishmentId = ref<string | null>(null);
  const floors = ref<Floor[]>([]);
  const plan = ref<FloorPlan | null>(null);
  const schedule = ref<ScheduleView | null>(null);
  const preview = ref<SlotPreview | null>(null);

  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  const floor = computed(() => plan.value?.floor ?? null);
  const tables = computed(() => plan.value?.tables ?? []);
  const zones = computed(() => plan.value?.zones ?? []);

  function scope(): string {
    const user = auth.user as { id?: string; orgId?: string | null } | null;
    return `${user?.orgId ?? 'sin-org'}:${user?.id ?? 'sin-usuario'}`;
  }

  /** Guarda el establecimiento elegido por usuario y organización para que
   *  volver a la pantalla no obligue a escogerlo otra vez. */
  function selectEstablishment(id: string): void {
    selectedEstablishmentId.value = id;
    write(`restaurant:establishment:${scope()}`, id);
  }

  function restoreEstablishment(): void {
    selectedEstablishmentId.value = read<string>(`restaurant:establishment:${scope()}`);
  }

  async function run<T>(fn: () => Promise<T>, isWrite = false): Promise<T> {
    if (isWrite) saving.value = true;
    else loading.value = true;
    error.value = null;
    try {
      return await fn();
    } catch (e) {
      error.value = extractError(e);
      throw e;
    } finally {
      if (isWrite) saving.value = false;
      else loading.value = false;
    }
  }

  /** Idempotente: deja planta y horario si aún no existen. */
  function setup(establishmentId: string): Promise<SetupResult> {
    return run(() => restaurantApi.setup(establishmentId), true);
  }

  async function fetchFloors(establishmentId: string): Promise<void> {
    floors.value = await run(() => restaurantApi.listFloors(establishmentId));
  }

  async function fetchPlan(floorId: string): Promise<void> {
    plan.value = await run(() => restaurantApi.getFloorPlan(floorId));
  }

  /** Devuelve la planta con la nueva `layoutVersion` y refresca el plano en
   *  memoria para que el editor no vuelva a pedirlo tras guardar. */
  async function savePlan(floorId: string, body: SaveFloorPlanInput): Promise<Floor> {
    const updated = await run(() => restaurantApi.saveFloorPlan(floorId, body), true);
    if (plan.value && plan.value.floor.id === floorId) {
      plan.value = { ...plan.value, floor: updated, layout: { ...plan.value.layout, version: updated.layoutVersion } };
    }
    return updated;
  }

  async function updateFloor(floorId: string, body: UpdateFloorInput): Promise<void> {
    const updated = await run(() => restaurantApi.updateFloor(floorId, body), true);
    if (plan.value && plan.value.floor.id === floorId) plan.value = { ...plan.value, floor: updated };
  }

  async function createTable(floorId: string, body: CreateTableInput): Promise<DiningTable> {
    const created = await run(() => restaurantApi.createTable(floorId, body), true);
    await fetchPlan(floorId);
    return created;
  }

  async function bulkCreateTables(floorId: string, body: BulkCreateTablesInput): Promise<DiningTable[]> {
    const created = await run(() => restaurantApi.bulkCreateTables(floorId, body), true);
    await fetchPlan(floorId);
    return created;
  }

  async function updateTable(id: string, body: UpdateTableInput): Promise<DiningTable> {
    const updated = await run(() => restaurantApi.updateTable(id, body), true);
    if (plan.value) {
      plan.value = { ...plan.value, tables: plan.value.tables.map((t) => (t.id === id ? updated : t)) };
    }
    return updated;
  }

  async function fetchSchedule(establishmentId: string): Promise<void> {
    schedule.value = await run(() => restaurantApi.getSchedule(establishmentId));
  }

  async function saveSchedule(establishmentId: string, body: SaveScheduleInput): Promise<void> {
    const result = await run(() => restaurantApi.saveSchedule(establishmentId, body), true);
    schedule.value = { schedule: result.schedule, shifts: result.shifts, exceptions: schedule.value?.exceptions ?? [] };
  }

  async function previewSlots(establishmentId: string, date: string): Promise<void> {
    preview.value = await run(() => restaurantApi.previewSlots(establishmentId, date));
  }

  async function addException(establishmentId: string, body: AddScheduleExceptionInput): Promise<ScheduleException> {
    const created = await run(() => restaurantApi.addException(establishmentId, body), true);
    if (schedule.value) schedule.value = { ...schedule.value, exceptions: [...schedule.value.exceptions, created] };
    return created;
  }

  async function removeException(id: string): Promise<void> {
    await run(() => restaurantApi.removeException(id), true);
    if (schedule.value) {
      schedule.value = { ...schedule.value, exceptions: schedule.value.exceptions.filter((e) => e.id !== id) };
    }
  }

  return {
    selectedEstablishmentId,
    floors,
    plan,
    schedule,
    preview,
    loading,
    saving,
    error,
    floor,
    tables,
    zones,
    selectEstablishment,
    restoreEstablishment,
    setup,
    fetchFloors,
    fetchPlan,
    savePlan,
    updateFloor,
    createTable,
    bulkCreateTables,
    updateTable,
    fetchSchedule,
    saveSchedule,
    previewSlots,
    addException,
    removeException,
  };
});
