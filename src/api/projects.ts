import { http } from '@/utils/http';
import type {
  Board,
  BoardTask,
  CreateProjectInput,
  CreateTaskInput,
  DirectoryUser,
  Member,
  MyTask,
  Position,
  Project,
  ProjectDetail,
  ProjectRole,
  ProjectWithRole,
  ApprovalDecision,
  BulkAction,
  BulkResult,
  CustomField,
  Dependency,
  FieldOptionInput,
  FieldType,
  FieldValue,
  LinkEntity,
  ProjectColor,
  ProjectTemplate,
  SearchResult,
  Tag,
  TaskLink,
  Visibility,
  LogTimeInput,
  RunningTimer,
  TimeEntry,
  TimeReport,
  TimeReportFilter,
  Workload,
  BillingCriteria,
  FormInput,
  ProjectDashboard,
  ProjectForm,
  ProjectRule,
  PublicForm,
  RuleInput,
  BillingPreview,
  BillingSettings,
  BillingSummary,
  ProjectInvoice,
  ProjectHealth,
  RichDoc,
  StatusUpdate,
  Section,
  Task,
  TaskAttachment,
  TaskComment,
  TaskDetail,
  UpdateProjectInput,
  UpdateTaskInput,
} from '@/types/projects';

const base = '/projects';

export const projectsApi = {
  list: (status: 'active' | 'archived' = 'active') =>
    http.get<{ items: ProjectWithRole[] }>(base, { params: { status } }).then((r) => r.data.items),
  get: (id: string) => http.get<ProjectDetail>(`${base}/${id}`).then((r) => r.data),
  create: (body: CreateProjectInput) => http.post<ProjectDetail>(base, body).then((r) => r.data),
  update: (id: string, body: UpdateProjectInput) => http.patch<Project>(`${base}/${id}`, body).then((r) => r.data),
  archive: (id: string) => http.post<Project>(`${base}/${id}/archive`).then((r) => r.data),
  unarchive: (id: string) => http.post<Project>(`${base}/${id}/unarchive`).then((r) => r.data),
  remove: (id: string) => http.delete<void>(`${base}/${id}`).then(() => undefined),

  board: (id: string) => http.get<Board>(`${base}/${id}/tasks`).then((r) => r.data),

  addMember: (id: string, userId: string, role: ProjectRole) => http.post<Member>(`${base}/${id}/members`, { userId, role }).then((r) => r.data),
  updateMember: (id: string, userId: string, role: ProjectRole) => http.patch<Member>(`${base}/${id}/members/${userId}`, { role }).then((r) => r.data),
  removeMember: (id: string, userId: string) => http.delete<void>(`${base}/${id}/members/${userId}`).then(() => undefined),

  createSection: (id: string, name: string, position: Position = {}) =>
    http.post<Section>(`${base}/${id}/sections`, { name, ...position }).then((r) => r.data),
  renameSection: (id: string, sectionId: string, name: string) => http.patch<Section>(`${base}/${id}/sections/${sectionId}`, { name }).then((r) => r.data),
  moveSection: (id: string, sectionId: string, position: Position) =>
    http.post<Section>(`${base}/${id}/sections/${sectionId}/move`, position).then((r) => r.data),
  deleteSection: (id: string, sectionId: string, moveTasksTo?: string) =>
    http.delete<void>(`${base}/${id}/sections/${sectionId}`, { params: moveTasksTo ? { moveTasksTo } : {} }).then(() => undefined),

  myTasks: (includeCompleted = false) => http.get<{ items: MyTask[] }>(`${base}/my-tasks`, { params: { includeCompleted } }).then((r) => r.data.items),
  getTask: (taskId: string) => http.get<TaskDetail>(`${base}/tasks/${taskId}`).then((r) => r.data),
  createTask: (body: CreateTaskInput) => http.post<Task>(`${base}/tasks`, body).then((r) => r.data),
  updateTask: (taskId: string, body: UpdateTaskInput) => http.patch<Task>(`${base}/tasks/${taskId}`, body).then((r) => r.data),
  moveTask: (taskId: string, body: Position & { version: number; projectId: string; sectionId: string }) =>
    http.post<Task & { placement: Pick<BoardTask, 'sectionId' | 'rank'> & { projectId: string } }>(`${base}/tasks/${taskId}/move`, body).then((r) => r.data),
  completeTask: (taskId: string) => http.post<Task>(`${base}/tasks/${taskId}/complete`).then((r) => r.data),
  reopenTask: (taskId: string) => http.post<Task>(`${base}/tasks/${taskId}/reopen`).then((r) => r.data),
  deleteTask: (taskId: string) => http.delete<void>(`${base}/tasks/${taskId}`).then(() => undefined),

  decide: (taskId: string, decision: ApprovalDecision) => http.post<Task>(`${base}/tasks/${taskId}/approval`, { decision }).then((r) => r.data),

  addComment: (taskId: string, bodyDoc: RichDoc) => http.post<TaskComment>(`${base}/tasks/${taskId}/comments`, { bodyDoc }).then((r) => r.data),
  editComment: (commentId: string, bodyDoc: RichDoc) => http.patch<TaskComment>(`${base}/comments/${commentId}`, { bodyDoc }).then((r) => r.data),
  deleteComment: (commentId: string) => http.delete<void>(`${base}/comments/${commentId}`).then(() => undefined),

  setTaskLike: (taskId: string, liked: boolean) =>
    (liked ? http.post<{ likedBy: string[] }>(`${base}/tasks/${taskId}/like`) : http.delete<{ likedBy: string[] }>(`${base}/tasks/${taskId}/like`)).then((r) => r.data.likedBy),
  setCommentLike: (commentId: string, liked: boolean) =>
    (liked ? http.post<{ likedBy: string[] }>(`${base}/comments/${commentId}/like`) : http.delete<{ likedBy: string[] }>(`${base}/comments/${commentId}/like`)).then(
      (r) => r.data.likedBy,
    ),

  addFollower: (taskId: string, userId: string) => http.post<{ followers: string[] }>(`${base}/tasks/${taskId}/followers`, { userId }).then((r) => r.data.followers),
  removeFollower: (taskId: string, userId: string) => http.delete<{ followers: string[] }>(`${base}/tasks/${taskId}/followers/${userId}`).then((r) => r.data.followers),

  addAttachment: (taskId: string, body: Pick<TaskAttachment, 'documentId' | 'fileName' | 'mimeType' | 'sizeBytes'>) =>
    http.post<TaskAttachment>(`${base}/tasks/${taskId}/attachments`, body).then((r) => r.data),
  removeAttachment: (attachmentId: string) => http.delete<void>(`${base}/attachments/${attachmentId}`).then(() => undefined),

  addDependency: (taskId: string, dependsOnTaskId: string) =>
    http.post<Dependency>(`${base}/tasks/${taskId}/dependencies`, { dependsOnTaskId }).then((r) => r.data),
  removeDependency: (taskId: string, dependsOnTaskId: string) => http.delete<void>(`${base}/tasks/${taskId}/dependencies/${dependsOnTaskId}`).then(() => undefined),

  statusUpdates: (projectId: string) => http.get<{ items: StatusUpdate[] }>(`${base}/${projectId}/status-updates`).then((r) => r.data.items),
  postStatusUpdate: (projectId: string, status: ProjectHealth, bodyDoc: RichDoc | null) =>
    http.post<StatusUpdate>(`${base}/${projectId}/status-updates`, { status, bodyDoc }).then((r) => r.data),

  // ── Entregable 4 ──
  search: (q: string) => http.get<SearchResult>(`${base}/search`, { params: { q } }).then((r) => r.data),
  bulk: (taskIds: string[], action: BulkAction) => http.post<{ results: BulkResult[] }>(`${base}/tasks/bulk`, { taskIds, action }).then((r) => r.data.results),

  templates: (locale: string) => http.get<{ items: ProjectTemplate[] }>(`${base}/templates`, { params: { locale } }).then((r) => r.data.items),
  createFromTemplate: (body: { templateCode: string; name?: string; visibility: Visibility; startOn: string; locale: string }) =>
    http.post<Project>(`${base}/from-template`, body).then((r) => r.data),
  duplicate: (projectId: string, name?: string) => http.post<Project>(`${base}/${projectId}/duplicate`, { name }).then((r) => r.data),

  tags: () => http.get<{ items: Tag[] }>(`${base}/tags`).then((r) => r.data.items),
  createTag: (name: string, color?: ProjectColor) => http.post<Tag>(`${base}/tags`, { name, color }).then((r) => r.data),
  updateTag: (id: string, patch: { name?: string; color?: ProjectColor }) => http.patch<Tag>(`${base}/tags/${id}`, patch).then((r) => r.data),
  deleteTag: (id: string) => http.delete<{ taskCount: number }>(`${base}/tags/${id}`).then((r) => r.data),
  setTaskTag: (taskId: string, tagId: string, on: boolean) =>
    (on ? http.post<{ items: Tag[] }>(`${base}/tasks/${taskId}/tags`, { tagId }) : http.delete<{ items: Tag[] }>(`${base}/tasks/${taskId}/tags/${tagId}`)).then((r) => r.data.items),

  linkedTasks: (entityType: LinkEntity, entityId: string) => http.get<{ items: Task[] }>(`${base}/linked/${entityType}/${entityId}`).then((r) => r.data.items),
  addLink: (taskId: string, body: { entityType: LinkEntity; entityId: string; label: string }) => http.post<TaskLink>(`${base}/tasks/${taskId}/links`, body).then((r) => r.data),
  removeLink: (linkId: string) => http.delete<void>(`${base}/links/${linkId}`).then(() => undefined),

  fields: (projectId: string) => http.get<{ items: CustomField[] }>(`${base}/${projectId}/fields`).then((r) => r.data.items),
  createField: (projectId: string, body: { name: string; type: FieldType; options?: FieldOptionInput[] }) =>
    http.post<CustomField>(`${base}/${projectId}/fields`, body).then((r) => r.data),
  updateField: (fieldId: string, body: { name?: string; options?: FieldOptionInput[] }) => http.patch<CustomField>(`${base}/fields/${fieldId}`, body).then((r) => r.data),
  deleteField: (fieldId: string) => http.delete<void>(`${base}/fields/${fieldId}`).then(() => undefined),
  setFieldValue: (taskId: string, fieldId: string, value: FieldValue | null) =>
    http.put<{ value: FieldValue | null }>(`${base}/tasks/${taskId}/fields/${fieldId}`, { value }).then((r) => r.data.value),

  // ── Entregable 5: horas y carga de trabajo (módulos `projects.time_tracking` y `projects.resource_allocation`) ──
  timeReport: (filter: TimeReportFilter) => http.get<TimeReport>(`${base}/time-entries`, { params: filter }).then((r) => r.data),
  logTime: (body: LogTimeInput) => http.post<TimeEntry>(`${base}/time-entries`, body).then((r) => r.data),
  updateTime: (id: string, body: Partial<Omit<LogTimeInput, 'taskId'>>) => http.patch<TimeEntry>(`${base}/time-entries/${id}`, body).then((r) => r.data),
  deleteTime: (id: string) => http.delete<void>(`${base}/time-entries/${id}`).then(() => undefined),
  timer: () => http.get<{ timer: RunningTimer | null }>(`${base}/time-entries/timer`).then((r) => r.data.timer),
  startTimer: (taskId: string, previousWorkedOn?: string) =>
    http.post<{ timer: RunningTimer; stopped: TimeEntry | null }>(`${base}/time-entries/timer`, { taskId, previousWorkedOn }).then((r) => r.data),
  stopTimer: (workedOn: string) => http.post<TimeEntry>(`${base}/time-entries/timer/stop`, { workedOn }).then((r) => r.data),
  discardTimer: () => http.delete<void>(`${base}/time-entries/timer`).then(() => undefined),
  workload: (from: string, weeks: number, projectId?: string) =>
    http.get<Workload>(`${base}/workload`, { params: { from, weeks, ...(projectId ? { projectId } : {}) } }).then((r) => r.data),
  setCapacity: (userId: string, weeklyMinutes: number) => http.put<{ userId: string; weeklyMinutes: number }>(`${base}/workload/capacity/${userId}`, { weeklyMinutes }).then((r) => r.data),

  // ── Entregable 6: facturar el proyecto (módulo `projects.project_billing`, permiso `project:bill`) ──
  billing: (projectId: string) => http.get<BillingSummary>(`${base}/billing/${projectId}`).then((r) => r.data),
  saveBillingSettings: (projectId: string, body: BillingSettings) => http.put<BillingSettings>(`${base}/billing/${projectId}/settings`, body).then((r) => r.data),
  setMilestoneAmount: (projectId: string, taskId: string, amountCents: number | null) =>
    http.put<{ taskId: string; amountCents: number | null }>(`${base}/billing/${projectId}/milestones/${taskId}`, { amountCents }).then((r) => r.data),
  billingPreview: (projectId: string, criteria: BillingCriteria) => http.post<BillingPreview>(`${base}/billing/${projectId}/preview`, criteria).then((r) => r.data),
  reserveBilling: (projectId: string, criteria: BillingCriteria) =>
    http.post<{ invoice: ProjectInvoice; preview: BillingPreview; settings: BillingSettings }>(`${base}/billing/${projectId}/reserve`, criteria).then((r) => r.data),
  attachInvoice: (billingId: string, invoiceId: string) => http.post<ProjectInvoice>(`${base}/billing/invoices/${billingId}/attach`, { invoiceId }).then((r) => r.data),
  releaseBilling: (billingId: string) => http.post<ProjectInvoice>(`${base}/billing/invoices/${billingId}/release`).then((r) => r.data),

  // ── Entregable 7: reglas, formularios y panel ──
  rules: (projectId: string) => http.get<{ items: ProjectRule[] }>(`${base}/${projectId}/rules`).then((r) => r.data.items),
  createRule: (projectId: string, body: RuleInput) => http.post<ProjectRule>(`${base}/${projectId}/rules`, body).then((r) => r.data),
  updateRule: (ruleId: string, body: RuleInput) => http.patch<ProjectRule>(`${base}/rules/${ruleId}`, body).then((r) => r.data),
  deleteRule: (ruleId: string) => http.delete<void>(`${base}/rules/${ruleId}`).then(() => undefined),
  forms: (projectId: string) => http.get<{ items: ProjectForm[] }>(`${base}/${projectId}/forms`).then((r) => r.data.items),
  createForm: (projectId: string, body: FormInput) => http.post<ProjectForm>(`${base}/${projectId}/forms`, body).then((r) => r.data),
  updateForm: (formId: string, body: FormInput) => http.patch<ProjectForm>(`${base}/forms/${formId}`, body).then((r) => r.data),
  deleteForm: (formId: string) => http.delete<void>(`${base}/forms/${formId}`).then(() => undefined),
  publicForm: (formId: string) => http.get<PublicForm>(`${base}/forms/${formId}`).then((r) => r.data),
  submitForm: (formId: string, title: string, answers: Record<string, string>) =>
    http.post<{ taskId: string }>(`${base}/forms/${formId}/submit`, { title, answers }).then((r) => r.data),
  dashboard: (projectId: string) => http.get<ProjectDashboard>(`${base}/${projectId}/dashboard`).then((r) => r.data),

  /** Compañeros de la organización: lo sirve auth-service y no exige `user:read` (ver su openapi). */
  directory: () => http.get<DirectoryUser[]>('/users/directory').then((r) => r.data),
};
