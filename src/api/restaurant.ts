import { http } from '@/utils/http';
import type {
  AddScheduleExceptionInput,
  BulkCreateTablesInput,
  CreateTableInput,
  CreateZoneInput,
  DiningTable,
  EstablishmentSchedule,
  Floor,
  FloorPlan,
  ScheduleException,
  ScheduleView,
  SetupResult,
  Shift,
  SlotPreview,
  TableListParams,
  UpdateFloorInput,
  UpdateTableInput,
  UpdateZoneInput,
  SaveFloorPlanInput,
  SaveScheduleInput,
  Zone,
} from '@/types/restaurant';

/**
 * Rutas del plugin de restaurantes. Se sirven CON el prefijo `/restaurant`
 * (el gateway reenvía `ANY /restaurant/*` sin quitarlo) y exigen el plugin
 * `restaurant.floorplan`; sin él el gateway responde 403 antes de llegar aquí.
 */
export const restaurantApi = {
  /** Idempotente: deja la planta «Salón principal» y el horario por defecto. */
  setup: (establishmentId: string) =>
    http.post<SetupResult>(`/restaurant/establishments/${establishmentId}/setup`).then((r) => r.data),

  listFloors: (establishmentId: string) =>
    http.get<Floor[]>(`/restaurant/establishments/${establishmentId}/floors`).then((r) => r.data),

  updateFloor: (floorId: string, body: UpdateFloorInput) =>
    http.patch<Floor>(`/restaurant/floors/${floorId}`, body).then((r) => r.data),

  /** Planta + zonas + mesas + dibujo, todo en una petición. */
  getFloorPlan: (floorId: string) =>
    http.get<FloorPlan>(`/restaurant/floors/${floorId}/plan`).then((r) => r.data),

  /** Falla con 409 (`PLAN_VERSION_CONFLICT`) si otra persona guardó antes. */
  saveFloorPlan: (floorId: string, body: SaveFloorPlanInput) =>
    http.put<Floor>(`/restaurant/floors/${floorId}/plan`, body).then((r) => r.data),

  listTables: (establishmentId: string, params?: TableListParams) =>
    http.get<DiningTable[]>(`/restaurant/establishments/${establishmentId}/tables`, { params }).then((r) => r.data),

  createTable: (floorId: string, body: CreateTableInput) =>
    http.post<DiningTable>(`/restaurant/floors/${floorId}/tables`, body).then((r) => r.data),

  /** «¿Cuántas mesas tienes?»: crea N de golpe continuando la numeración. */
  bulkCreateTables: (floorId: string, body: BulkCreateTablesInput) =>
    http.post<DiningTable[]>(`/restaurant/floors/${floorId}/tables/bulk`, body).then((r) => r.data),

  /** No hay DELETE: desactivar (`status: inactive`) conserva la fila y el id. */
  updateTable: (id: string, body: UpdateTableInput) =>
    http.patch<DiningTable>(`/restaurant/tables/${id}`, body).then((r) => r.data),

  listZones: (floorId: string) =>
    http.get<Zone[]>(`/restaurant/floors/${floorId}/zones`).then((r) => r.data),

  createZone: (floorId: string, body: CreateZoneInput) =>
    http.post<Zone>(`/restaurant/floors/${floorId}/zones`, body).then((r) => r.data),

  updateZone: (id: string, body: UpdateZoneInput) =>
    http.patch<Zone>(`/restaurant/zones/${id}`, body).then((r) => r.data),

  getSchedule: (establishmentId: string) =>
    http.get<ScheduleView>(`/restaurant/establishments/${establishmentId}/schedule`).then((r) => r.data),

  saveSchedule: (establishmentId: string, body: SaveScheduleInput) =>
    http
      .put<{ schedule: EstablishmentSchedule; shifts: Shift[] }>(
        `/restaurant/establishments/${establishmentId}/schedule`,
        body,
      )
      .then((r) => r.data),

  previewSlots: (establishmentId: string, date: string) =>
    http
      .get<SlotPreview>(`/restaurant/establishments/${establishmentId}/schedule/preview`, { params: { date } })
      .then((r) => r.data),

  addException: (establishmentId: string, body: AddScheduleExceptionInput) =>
    http.post<ScheduleException>(`/restaurant/establishments/${establishmentId}/schedule/exceptions`, body).then((r) => r.data),

  removeException: (id: string) =>
    http.delete<void>(`/restaurant/schedule/exceptions/${id}`).then((r) => r.data),
};
