/** Proyectos y tareas (projects-service). Contrato: backend/projects-service/openapi.yaml. */

export type ProjectRole = 'admin' | 'editor' | 'commenter' | 'viewer';
export type ProjectHealth = 'on_track' | 'at_risk' | 'off_track' | 'complete';
export type Visibility = 'organization' | 'members';
export type ProjectView = 'list' | 'board';
export type ProjectColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  color: ProjectColor;
  icon: string;
  visibility: Visibility;
  ownerUserId: string;
  status: 'active' | 'archived';
  defaultView: ProjectView;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface StatusUpdate {
  id: string;
  status: ProjectHealth;
  bodyDoc: RichDoc | null;
  bodyText: string | null;
  authorUserId: string;
  createdAt: string;
}

export interface ProjectWithRole extends Project {
  myRole: ProjectRole;
  isMember: boolean;
  latestStatus: StatusUpdate | null;
  /** Solo en la lista (`GET /projects`): lo que muestra la tarjeta. Tareas de primer nivel; «vencida» con la fecha de la organización. */
  summary?: ProjectSummary;
}

export interface ProjectSummary {
  total: number;
  completed: number;
  overdue: number;
  nextDueOn: string | null;
  memberCount: number;
  /** Hasta 5, los administradores primero. */
  memberUserIds: string[];
}

export interface Member {
  userId: string;
  role: ProjectRole;
  addedAt: string;
}

export interface ProjectDetail extends ProjectWithRole {
  members: Member[];
}

export interface Section {
  id: string;
  name: string;
  rank: string;
}

export type TaskKind = 'task' | 'milestone' | 'approval';
export type ApprovalStatus = 'pending' | 'approved' | 'changes_requested' | 'rejected';
export type ApprovalDecision = 'approved' | 'changes_requested' | 'rejected';

/** Documento de TipTap (ProseMirror en JSON). El servidor lo valida contra una lista blanca. */
export interface RichDoc {
  type: string;
  content?: RichDoc[];
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

export interface Task {
  id: string;
  parentTaskId: string | null;
  kind: TaskKind;
  approvalStatus: ApprovalStatus | null;
  title: string;
  description: string | null;
  descriptionDoc: RichDoc | null;
  assigneeUserId: string | null;
  assignedAt: string | null;
  startOn: string | null;
  dueOn: string | null;
  /** «Tiempo estimado», en minutos. */
  estimatedMinutes: number | null;
  completedAt: string | null;
  completedBy: string | null;
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SubtaskCount {
  total: number;
  completed: number;
}

// ── Entregable 4: vínculos con el ERP, etiquetas y campos personalizados ──
export type LinkEntity = 'customer' | 'invoice' | 'quote' | 'purchase_order' | 'product';

export interface TaskLink {
  id: string;
  entityType: LinkEntity;
  entityId: string;
  /** Lo que se veía al vincular (el servicio de proyectos no puede preguntar el nombre del cliente). */
  label: string;
  createdBy: string;
  createdAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color: ProjectColor;
  /** En cuántas tareas está (solo en la lista de la organización, `GET /projects/tags`). */
  taskCount?: number;
}

export type FieldType = 'text' | 'number' | 'select' | 'date' | 'person';

export interface FieldOption {
  id: string;
  label: string;
  color: ProjectColor;
}

export interface CustomField {
  id: string;
  projectId: string;
  name: string;
  type: FieldType;
  options: FieldOption[];
  rank: string;
}

export type FieldValue = string | number;

export interface BoardTask extends Task {
  sectionId: string;
  rank: string;
  subtasks: SubtaskCount;
  tags: Tag[];
  /** Valor de cada campo personalizado, por id de campo (los vacíos no vienen). */
  values: Record<string, FieldValue>;
  /** Minutos registrados. */
  actualMinutes: number;
}

export interface Dependency {
  /** La que espera. */
  taskId: string;
  /** La que tiene que terminar antes. */
  dependsOnTaskId: string;
}

export interface Board {
  project: Project & { myRole: ProjectRole };
  sections: Section[];
  tasks: BoardTask[];
  dependencies: Dependency[];
  fields: CustomField[];
}

export interface LinkedTask {
  id: string;
  title: string;
  dueOn: string | null;
  completed: boolean;
}

export interface ProjectChip {
  projectId: string;
  name: string;
  color: ProjectColor;
}

export interface TaskComment {
  id: string;
  taskId: string;
  authorUserId: string;
  bodyDoc: RichDoc;
  bodyText: string;
  mentionedUserIds: string[];
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  likedBy: string[];
}

export interface TaskAttachment {
  id: string;
  documentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
}

export interface TaskActivity {
  id: string;
  actorUserId: string | null;
  kind: string;
  data: Record<string, unknown>;
  at: string;
}

export interface TaskDetail extends Task {
  links: TaskLink[];
  tags: Tag[];
  fields: Array<CustomField & { value: FieldValue | null }>;
  blockedBy: LinkedTask[];
  blocking: LinkedTask[];
  parent: { id: string; title: string } | null;
  /** `actualMinutes`: horas registradas en cada subtarea. */
  subtasks: Array<Task & { actualMinutes?: number }>;
  projects: Array<ProjectChip & { sectionId: string; sectionName: string | null }>;
  followers: string[];
  likedBy: string[];
  attachments: TaskAttachment[];
  comments: TaskComment[];
  activity: TaskActivity[];
  canComment: boolean;
  canEdit: boolean;
  canComplete: boolean;
  canDecide: boolean;
  /** Las de la tarea y las de sus subtareas (cada una con su `taskId`). */
  timeEntries: TimeEntry[];
  /** Total: propias + subtareas (el tiempo que llevó la tarea entera). */
  actualMinutes: number;
  ownMinutes: number;
  subtasksMinutes: number;
  /** Registrar horas: el responsable o un editor. */
  canLogTime: boolean;
}

export interface MyTask extends Task {
  parent: { id: string; title: string } | null;
  projects: ProjectChip[];
  subtasks: SubtaskCount;
}

/** Directorio de compañeros (`GET /users/directory`, auth-service). */
export interface DirectoryUser {
  id: string;
  email: string;
  fullName: string | null;
  avatarFileId: string | null;
}

export interface Position {
  beforeId?: string | null;
  afterId?: string | null;
}

export interface CreateProjectInput {
  name: string;
  description?: string | null;
  color?: ProjectColor;
  visibility: Visibility;
  defaultView?: ProjectView;
  sectionNames: string[];
}

export interface UpdateProjectInput {
  version: number;
  name?: string;
  description?: string | null;
  color?: ProjectColor;
  visibility?: Visibility;
  defaultView?: ProjectView;
}

export interface CreateTaskInput extends Position {
  title: string;
  description?: string | null;
  descriptionDoc?: RichDoc | null;
  kind?: TaskKind;
  assigneeUserId?: string | null;
  startOn?: string | null;
  dueOn?: string | null;
  estimatedMinutes?: number | null;
  projectId?: string | null;
  sectionId?: string | null;
  parentTaskId?: string | null;
}

export interface ProjectTemplate {
  code: string;
  icon: string;
  color: ProjectColor;
  name: string;
  description: string;
  sections: string[];
  taskCount: number;
}

export interface FieldOptionInput {
  id?: string | null;
  label: string;
  color?: ProjectColor | null;
}

export type BulkAction =
  | { type: 'complete' }
  | { type: 'reopen' }
  | { type: 'delete' }
  | { type: 'assign'; assigneeUserId: string | null }
  | { type: 'due'; dueOn: string | null }
  | { type: 'move'; projectId: string; sectionId: string }
  | { type: 'tag'; tagId: string };

export interface BulkResult {
  taskId: string;
  ok: boolean;
  code?: string;
  message?: string;
}

export interface SearchResult {
  tasks: Array<Task & { projects: ProjectChip[] }>;
  projects: Project[];
}

// ── Horas y carga de trabajo (entregable 5) ──
export interface TimeEntry {
  id: string;
  taskId: string;
  projectId: string | null;
  userId: string;
  workedOn: string;
  minutes: number;
  billable: boolean;
  note: string | null;
  source: 'manual' | 'timer';
  /** En una factura del proyecto: ya no se corrige ni se borra. */
  billingId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimeReportRow extends TimeEntry {
  taskTitle: string;
  taskDeleted: boolean;
  projectName: string | null;
  canEdit: boolean;
}

export interface TimeReport {
  items: TimeReportRow[];
  totalMinutes: number;
  billableMinutes: number;
  truncated: boolean;
  canReadAll: boolean;
}

export interface TimeReportFilter {
  from?: string;
  to?: string;
  userId?: string;
  projectId?: string;
  taskId?: string;
  billable?: boolean;
}

export interface RunningTimer {
  taskId: string;
  taskTitle: string;
  projectId: string | null;
  startedAt: string;
}

export interface LogTimeInput {
  taskId: string;
  workedOn: string;
  minutes: number;
  billable?: boolean;
  note?: string | null;
  projectId?: string | null;
}

export interface WorkloadTask {
  id: string;
  title: string;
  kind: TaskKind;
  startOn: string | null;
  dueOn: string;
  estimatedMinutes: number | null;
  minutesByWeek: Record<string, number>;
  weeks: string[];
}

export interface WorkloadPerson {
  userId: string;
  weeklyMinutes: number;
  weeks: Array<{ weekStart: string; minutes: number; taskCount: number }>;
  tasks: WorkloadTask[];
}

export interface Workload {
  weekStarts: string[];
  people: WorkloadPerson[];
  capacities: Record<string, number>;
  defaultWeeklyMinutes: number;
}

// ── Facturar el proyecto (entregable 6) ──
export type BillingGroupBy = 'task' | 'person' | 'single';

export interface BillingSettings {
  customerId: string | null;
  customerLabel: string | null;
  hourlyRateCents: number | null;
  serviceProductId: string | null;
  serviceProductLabel: string | null;
  groupBy: BillingGroupBy;
}

export type ProjectInvoiceStatus = 'pending' | 'draft' | 'issued' | 'voided' | 'released';

export interface ProjectInvoice {
  id: string;
  projectId: string;
  invoiceId: string | null;
  status: ProjectInvoiceStatus;
  number: string | null;
  minutes: number;
  entryCount: number;
  milestoneCount: number;
  amountCents: number;
  /** Si se emitió un borrador ya liberado: horas o hitos que estaban en otra factura. */
  conflicts: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface BillingMilestone {
  taskId: string;
  title: string;
  dueOn: string | null;
  completedAt: string | null;
  amountCents: number | null;
  billingId: string | null;
}

export interface BillingSummary {
  settings: BillingSettings;
  unbilledMinutes: number;
  unbilledEntries: number;
  unbilledAmountCents: number;
  milestones: BillingMilestone[];
  invoices: ProjectInvoice[];
}

export interface BillingGroup {
  kind: 'hours' | 'milestone';
  key: string;
  label: string | null;
  minutes: number;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
}

export interface BillingPreview {
  groups: BillingGroup[];
  entryCount: number;
  milestoneCount: number;
  minutes: number;
  amountCents: number;
}

export interface BillingCriteria {
  from?: string;
  to?: string;
  includeHours: boolean;
  milestoneTaskIds: string[];
  groupBy?: BillingGroupBy;
}

// ── Reglas, formularios y panel (entregable 7) ──
export type RuleTrigger = 'task_added' | 'task_moved' | 'task_completed';

export type RuleAction =
  | { type: 'assign'; userId: string | null }
  | { type: 'set_due'; days: number }
  | { type: 'move_to_section'; sectionId: string }
  | { type: 'complete' }
  | { type: 'add_tag'; tagId: string }
  | { type: 'add_follower'; userId: string };

export interface RuleInput {
  name: string;
  trigger: RuleTrigger;
  triggerSectionId: string | null;
  actions: RuleAction[];
  enabled: boolean;
}

export interface ProjectRule extends RuleInput {
  id: string;
  projectId: string;
  runCount: number;
  lastRunAt: string | null;
  lastError: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type QuestionType = 'text' | 'long_text' | 'date' | 'select';

export interface FormQuestion {
  id?: string;
  label: string;
  type: QuestionType;
  required: boolean;
  options: string[];
  mapsToDue: boolean;
}

export interface FormInput {
  title: string;
  description: string | null;
  questions: FormQuestion[];
  sectionId: string | null;
  assigneeUserId: string | null;
  enabled: boolean;
}

export interface ProjectForm extends FormInput {
  id: string;
  projectId: string;
  submissionCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicForm {
  id: string;
  title: string;
  description: string | null;
  projectName: string;
  questions: Array<FormQuestion & { id: string }>;
}

export interface ProjectDashboard {
  today: string;
  totals: { total: number; open: number; completed: number; overdue: number; unassigned: number; dueThisWeek: number };
  bySection: Array<{ sectionId: string; name: string; open: number; completed: number }>;
  byAssignee: Array<{ userId: string | null; open: number; overdue: number }>;
  completedByWeek: Array<{ weekStart: string; count: number }>;
  milestones: Array<{ taskId: string; title: string; dueOn: string | null; completed: boolean }>;
  time: { estimatedMinutes: number; actualMinutes: number };
}

export interface UpdateTaskInput {
  version: number;
  kind?: TaskKind;
  title?: string;
  description?: string | null;
  descriptionDoc?: RichDoc | null;
  assigneeUserId?: string | null;
  startOn?: string | null;
  dueOn?: string | null;
  estimatedMinutes?: number | null;
}
