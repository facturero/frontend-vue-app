/**
 * Contratos de restaurant-service (entregable 1: mapa del local).
 *
 * Dos unidades conviven a propósito: la base de datos, la API y el estado del
 * editor hablan en **centímetros enteros** (así el plano no arrastra decimales
 * binarios), y solo la interfaz los muestra en metros. La conversión vive en
 * `utils/restaurant-plan.ts`, nunca repartida por los componentes.
 *
 * El plano es un documento JSON (`layout`) versionado con `layoutVersion`: el
 * borrador vive en el navegador y «Guardar» manda todo de una vez. Los ids de
 * mesas y zonas nuevas los genera el editor (`crypto.randomUUID`), porque el
 * plano completo se aplica en una sola transacción y el servidor no puede
 * inventarlos sin una segunda ida y vuelta.
 */

export type EntityStatus = 'active' | 'inactive';

export type TableShape = 'rect' | 'round';

/** Solo giros de 90 en 90: el producto no admite inclinaciones libres. */
export type RotationDeg = 0 | 90 | 180 | 270;

/** Token del tema, nunca hexadecimal; el SVG lo pinta con `rgb(var(--v-theme-<token>))`. */
export type ZoneColor = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error';

export type ObjectKind = 'bar' | 'column' | 'restroom' | 'kitchen' | 'plant' | 'stairs' | 'entrance';

export interface Floor {
  id: string;
  organizationId: string;
  establishmentId: string;
  name: string;
  widthCm: number | null;
  heightCm: number | null;
  sortOrder: number;
  status: EntityStatus;
  layoutVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface Zone {
  id: string;
  organizationId: string;
  floorId: string;
  name: string;
  color: ZoneColor;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DiningTable {
  id: string;
  organizationId: string;
  floorId: string;
  zoneId: string | null;
  name: string;
  capacityMin: number;
  capacityMax: number;
  /** `null` = mesa sin ubicar; existe y es reservable aunque no haya plano. */
  xCm: number | null;
  yCm: number | null;
  widthCm: number;
  heightCm: number;
  shape: TableShape;
  rotationDeg: RotationDeg;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

// --------------------------------------------------------------------------
// Documento del plano (floors.layout_elements)
// --------------------------------------------------------------------------

export interface PlanWall {
  id: string;
  type: 'wall';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thicknessCm: number;
}

export interface PlanDoor {
  id: string;
  type: 'door';
  x: number;
  y: number;
  widthCm: number;
  rotationDeg: RotationDeg;
}

export interface PlanObject {
  id: string;
  type: 'object';
  kind: ObjectKind;
  x: number;
  y: number;
  widthCm: number;
  heightCm: number;
  rotationDeg: RotationDeg;
  label?: string;
}

export type PlanElement = PlanWall | PlanDoor | PlanObject;

export interface FloorPlan {
  floor: Floor;
  zones: Zone[];
  tables: DiningTable[];
  layout: {
    version: number;
    elements: PlanElement[];
  };
}

// --------------------------------------------------------------------------
// Horarios
// --------------------------------------------------------------------------

export interface PartyDuration {
  upTo: number | null;
  minutes: number;
}

export interface EstablishmentSchedule {
  id: string;
  organizationId: string;
  establishmentId: string;
  timezone: string;
  slotMinutes: number;
  cleanupMinutes: number;
  durationByPartySize: PartyDuration[];
  createdAt: string;
  updatedAt: string;
}

export interface Shift {
  id: string;
  weekday: number;
  opensAt: string;
  closesAt: string;
  label: string | null;
}

export interface ScheduleException {
  id: string;
  onDate: string;
  kind: 'closed' | 'special_hours';
  opensAt: string | null;
  closesAt: string | null;
  reason: string | null;
  createdAt: string;
}

export interface ScheduleView {
  schedule: EstablishmentSchedule;
  shifts: Shift[];
  exceptions: ScheduleException[];
}

export interface SlotPreview {
  date: string;
  timezone: string;
  slots: Array<{ startsAt: string; shiftLabel: string | null }>;
}

export interface SetupResult {
  floor: Floor;
  schedule: EstablishmentSchedule;
}

// --------------------------------------------------------------------------
// Cuerpos de petición
// --------------------------------------------------------------------------

export interface TableListParams {
  floorId?: string;
  zoneId?: string;
  status?: EntityStatus;
}

export interface CreateTableInput {
  name: string;
  capacityMin: number;
  capacityMax: number;
  zoneId?: string | null;
  xCm?: number | null;
  yCm?: number | null;
  widthCm?: number;
  heightCm?: number;
  shape?: TableShape;
  rotationDeg?: RotationDeg;
}

export type UpdateTableInput = Partial<CreateTableInput> & { status?: EntityStatus };

export interface BulkCreateTablesInput {
  count: number;
  capacityMin: number;
  capacityMax: number;
  /** Prefijo del nombre; el servidor continúa la numeración existente. */
  prefix?: string;
}

export interface CreateZoneInput {
  name: string;
  color?: ZoneColor;
}

export interface UpdateZoneInput {
  name?: string;
  color?: ZoneColor;
  status?: EntityStatus;
}

export interface UpdateFloorInput {
  name?: string;
  widthCm?: number | null;
  heightCm?: number | null;
  sortOrder?: number;
  status?: EntityStatus;
}

export interface PlanZonePayload {
  id: string;
  name: string;
  color?: ZoneColor;
}

export interface PlanTablePayload {
  id: string;
  name: string;
  capacityMin: number;
  capacityMax: number;
  zoneId?: string | null;
  xCm?: number | null;
  yCm?: number | null;
  widthCm?: number;
  heightCm?: number;
  shape?: TableShape;
  rotationDeg?: RotationDeg;
}

export interface SaveFloorPlanInput {
  expectedVersion: number;
  floor: { widthCm?: number | null; heightCm?: number | null };
  zones: PlanZonePayload[];
  tables: PlanTablePayload[];
  elements: PlanElement[];
}

export interface ShiftInput {
  weekday: number;
  opensAt: string;
  closesAt: string;
  label?: string | null;
}

export interface SaveScheduleInput {
  timezone?: string;
  slotMinutes?: number;
  cleanupMinutes?: number;
  durationByPartySize?: PartyDuration[];
  shifts: ShiftInput[];
}

export interface AddScheduleExceptionInput {
  onDate: string;
  kind: 'closed' | 'special_hours';
  opensAt?: string | null;
  closesAt?: string | null;
  reason?: string | null;
}

// ── Reservas (entregable 2) ──────────────────────────────────────────────────

export type ReservationStatus = 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';
export type ReservationSource = 'online' | 'staff';

/** Ajustes del local para recibir reservas del cliente final (página pública y límites). */
export interface ReservationSettings {
  id: string;
  establishmentId: string;
  /** Interruptor del dueño: apagado, la página pública responde como si el local no existiera. */
  enabled: boolean;
  /** Dirección pública (`reservas.noahsolution.com/<publicSlug>`). Única en todo el sistema. */
  publicSlug: string | null;
  displayName: string | null;
  publicNote: string | null;
  contactPhone: string | null;
  /** A dónde llega el aviso de cada reserva o cancelación en línea. */
  notifyEmail: string | null;
  maxDaysAhead: number;
  minNoticeMinutes: number;
  maxPartySize: number;
  maxTablesPerReservation: number;
  updatedAt: string;
}

export type ReservationSettingsInput = Partial<
  Omit<ReservationSettings, 'id' | 'establishmentId' | 'updatedAt'>
>;

export interface Reservation {
  id: string;
  establishmentId: string;
  /** Código corto que el cliente puede dictar por teléfono. */
  code: string;
  status: ReservationStatus;
  source: ReservationSource;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string;
  partySize: number;
  /** Fecha y hora LOCALES del restaurante. */
  date: string;
  time: string;
  startsAt: string;
  endsAt: string;
  notes: string | null;
  tables: Array<{ id: string; name: string }>;
  cancelledAt: string | null;
  cancelledBy: 'guest' | 'staff' | null;
  cancelReason: string | null;
  createdAt: string;
}

export interface AvailabilitySlot {
  time: string;
  startsAt: string;
  shiftLabel: string | null;
  available: boolean;
  /** `full`: no hay mesa libre; `notice`: ya pasó o falta antelación. */
  reason?: 'full' | 'notice';
}

export interface DayAvailability {
  date: string;
  status: 'open' | 'closed' | 'past' | 'too_far';
  slots: AvailabilitySlot[];
}

export interface StaffReservationInput {
  date: string;
  time: string;
  partySize: number;
  guestName: string;
  guestPhone: string;
  guestEmail?: string | null;
  notes?: string | null;
  tableIds?: string[];
}
