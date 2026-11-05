import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { fileApi } from '@/api/files';
import { projectsApi } from '@/api/projects';
import { useCelebration } from '@/composable/useCelebration';
import { extractError, extractErrorCode } from '@/utils/error';
import { neighbours } from '@/utils/projects';
import type {
  ApprovalDecision,
  BoardTask,
  BulkAction,
  BulkResult,
  CustomField,
  FieldOptionInput,
  FieldType,
  FieldValue,
  LinkEntity,
  Project,
  ProjectColor,
  Tag,
  Visibility,
  CreateProjectInput,
  Dependency,
  ProjectHealth,
  StatusUpdate,
  CreateTaskInput,
  DirectoryUser,
  MyTask,
  Position,
  ProjectDetail,
  ProjectRole,
  ProjectWithRole,
  RichDoc,
  Section,
  Task,
  TaskComment,
  TaskDetail,
  TaskKind,
  UpdateProjectInput,
  UpdateTaskInput,
} from '@/types/projects';

/**
 * Proyectos y tareas. El tablero se guarda como columnas (un arreglo de tarjetas por sección) porque el arrastre las cambia en
 * sitio: tras soltar una tarjeta, sus vecinas se leen de la columna ya reordenada y se mandan al servidor, que calcula la posición.
 *
 * Errores: las lecturas dejan el mensaje en `error`; las escrituras lo dejan en `notice` (aviso breve) y relanzan para que la vista
 * decida. Un 409 de versión (otra persona cambió la tarea) recarga lo que corresponda en vez de dejar la pantalla desfasada.
 */
export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<ProjectWithRole[]>([]);
  const current = ref<ProjectDetail | null>(null);
  const sections = ref<Section[]>([]);
  const columns = ref<Record<string, BoardTask[]>>({});
  /** Dependencias entre tareas del proyecto abierto: las flechas del cronograma. */
  const dependencies = ref<Dependency[]>([]);
  const statusUpdates = ref<StatusUpdate[]>([]);
  /** Campos personalizados del proyecto abierto (columnas de la lista). */
  const fields = ref<CustomField[]>([]);
  /** Etiquetas de la organización, para el autocompletado. */
  const tags = ref<Tag[]>([]);
  const myTasks = ref<MyTask[]>([]);
  const detail = ref<TaskDetail | null>(null);
  const directory = ref<DirectoryUser[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const notice = ref<string | null>(null);
  const { celebrate } = useCelebration();

  const users = computed(() => new Map(directory.value.map((u) => [u.id, u])));
  const myRole = computed<ProjectRole | null>(() => current.value?.myRole ?? null);
  const canEdit = computed(() => myRole.value === 'admin' || myRole.value === 'editor');
  const canManage = computed(() => myRole.value === 'admin');

  async function read<T>(work: () => Promise<T>): Promise<T | undefined> {
    loading.value = true;
    error.value = null;
    try {
      return await work();
    } catch (err) {
      error.value = extractError(err);
      return undefined;
    } finally {
      loading.value = false;
    }
  }

  async function write<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (err) {
      notice.value = extractError(err);
      if (extractErrorCode(err) === 'VERSION_CONFLICT' || extractErrorCode(err) === 'INVALID_POSITION') {
        // Otra persona cambió algo: se recarga para mostrar lo que hay de verdad.
        if (current.value) await reloadBoard();
        if (detail.value) await openTask(detail.value.id);
      }
      throw err;
    }
  }

  // ── Directorio ────────────────────────────────────────────────────────────
  let directoryLoaded = false;
  async function ensureDirectory(): Promise<void> {
    if (directoryLoaded) return;
    try {
      directory.value = await projectsApi.directory();
      directoryLoaded = true;
    } catch {
      // Sin directorio se ven iniciales genéricas; no es motivo para bloquear la pantalla.
    }
  }

  // ── Proyectos ─────────────────────────────────────────────────────────────
  async function fetchProjects(status: 'active' | 'archived' = 'active'): Promise<void> {
    const out = await read(() => projectsApi.list(status));
    if (out) projects.value = out;
  }

  async function createProject(input: CreateProjectInput): Promise<ProjectDetail> {
    const created = await write(() => projectsApi.create(input));
    projects.value = [...projects.value, created].sort((a, b) => a.name.localeCompare(b.name));
    return created;
  }

  function setBoard(b: { sections: Section[]; tasks: BoardTask[]; dependencies?: Dependency[]; fields?: CustomField[] }): void {
    sections.value = b.sections;
    dependencies.value = b.dependencies ?? [];
    fields.value = b.fields ?? [];
    const next: Record<string, BoardTask[]> = {};
    for (const s of b.sections) next[s.id] = [];
    for (const t of b.tasks) next[t.sectionId]?.push(t);
    columns.value = next;
  }

  async function loadProject(id: string): Promise<void> {
    current.value = null;
    await read(async () => {
      const [p, b] = await Promise.all([projectsApi.get(id), projectsApi.board(id)]);
      current.value = p;
      setBoard(b);
    });
  }

  async function reloadBoard(): Promise<void> {
    if (!current.value) return;
    try {
      setBoard(await projectsApi.board(current.value.id));
    } catch (err) {
      error.value = extractError(err);
    }
  }

  async function updateProject(patch: Omit<UpdateProjectInput, 'version'>): Promise<void> {
    if (!current.value) return;
    const p = current.value;
    const updated = await write(() => projectsApi.update(p.id, { ...patch, version: p.version }));
    current.value = { ...p, ...updated };
  }

  async function setArchived(archived: boolean): Promise<void> {
    if (!current.value) return;
    const id = current.value.id;
    const updated = await write(() => (archived ? projectsApi.archive(id) : projectsApi.unarchive(id)));
    current.value = { ...current.value, ...updated };
  }

  async function removeProject(): Promise<void> {
    if (!current.value) return;
    const id = current.value.id;
    await write(() => projectsApi.remove(id));
    projects.value = projects.value.filter((p) => p.id !== id);
    current.value = null;
  }

  // ── Miembros ──────────────────────────────────────────────────────────────
  async function refreshMembers(): Promise<void> {
    if (current.value) current.value = await projectsApi.get(current.value.id);
  }
  async function addMember(userId: string, role: ProjectRole): Promise<void> {
    await write(() => projectsApi.addMember(current.value!.id, userId, role));
    await refreshMembers();
  }
  async function updateMember(userId: string, role: ProjectRole): Promise<void> {
    await write(() => projectsApi.updateMember(current.value!.id, userId, role));
    await refreshMembers();
  }
  async function removeMember(userId: string): Promise<void> {
    await write(() => projectsApi.removeMember(current.value!.id, userId));
    await refreshMembers();
  }

  // ── Secciones ─────────────────────────────────────────────────────────────
  async function createSection(name: string, position: Position = {}): Promise<void> {
    await write(() => projectsApi.createSection(current.value!.id, name, position));
    await reloadBoard();
  }
  async function renameSection(sectionId: string, name: string): Promise<void> {
    const updated = await write(() => projectsApi.renameSection(current.value!.id, sectionId, name));
    sections.value = sections.value.map((s) => (s.id === sectionId ? updated : s));
  }
  /** Tras arrastrar una columna: `sections` ya está en el orden nuevo. */
  async function moveSection(sectionId: string): Promise<void> {
    try {
      await write(() => projectsApi.moveSection(current.value!.id, sectionId, neighbours(sections.value, sectionId)));
    } catch {
      await reloadBoard();
    }
  }
  async function deleteSection(sectionId: string, moveTasksTo?: string): Promise<void> {
    await write(() => projectsApi.deleteSection(current.value!.id, sectionId, moveTasksTo));
    await reloadBoard();
  }

  // ── Tareas ────────────────────────────────────────────────────────────────
  /** Aplica una tarea devuelta por el servidor en todas las copias que tenga la pantalla. */
  function apply(task: Task): void {
    for (const list of Object.values(columns.value)) {
      const i = list.findIndex((t) => t.id === task.id);
      if (i !== -1) list[i] = { ...list[i]!, ...task };
    }
    const m = myTasks.value.findIndex((t) => t.id === task.id);
    if (m !== -1) myTasks.value[m] = { ...myTasks.value[m]!, ...task };
    if (detail.value?.id === task.id) detail.value = { ...detail.value, ...task };
    if (detail.value) {
      const s = detail.value.subtasks.findIndex((t) => t.id === task.id);
      if (s !== -1) detail.value.subtasks[s] = task;
    }
  }

  /** En un proyecto: la tarjeta aparece en su columna donde se pidió (por defecto, al final) sin recargar el tablero. */
  async function createTask(input: CreateTaskInput): Promise<Task> {
    const task = await write(() => projectsApi.createTask(input));
    if (input.projectId && current.value?.id === input.projectId) {
      const sectionId = input.sectionId ?? sections.value[0]?.id;
      const list = sectionId ? columns.value[sectionId] : undefined;
      if (list && sectionId) {
        const card: BoardTask = { ...task, sectionId, rank: '', subtasks: { total: 0, completed: 0 }, tags: [], values: {}, actualMinutes: 0 };
        const after = input.beforeId ? list.findIndex((t) => t.id === input.beforeId) + 1 : input.afterId ? list.findIndex((t) => t.id === input.afterId) : list.length;
        list.splice(after < 0 ? list.length : after, 0, card);
      }
    }
    if (input.parentTaskId && detail.value?.id === input.parentTaskId) {
      detail.value.subtasks.push(task);
      bumpSubtasks(input.parentTaskId, 1, 0);
    }
    return task;
  }

  function bumpSubtasks(parentId: string, total: number, completed: number): void {
    for (const list of Object.values(columns.value)) {
      const card = list.find((t) => t.id === parentId);
      if (card) card.subtasks = { total: card.subtasks.total + total, completed: card.subtasks.completed + completed };
    }
  }

  async function updateTask(taskId: string, version: number, patch: Omit<UpdateTaskInput, 'version'>): Promise<Task> {
    const task = await write(() => projectsApi.updateTask(taskId, { ...patch, version }));
    apply(task);
    return task;
  }

  /** Tras soltar una tarjeta: `columns[sectionId]` ya la tiene en su sitio nuevo. */
  async function moveTask(taskId: string, sectionId: string): Promise<void> {
    const list = columns.value[sectionId] ?? [];
    const card = list.find((t) => t.id === taskId);
    if (!card || !current.value) return;
    try {
      const moved = await write(() =>
        projectsApi.moveTask(taskId, { projectId: current.value!.id, sectionId, version: card.version, ...neighbours(list, taskId) }),
      );
      card.sectionId = sectionId;
      apply(moved);
    } catch {
      await reloadBoard();
    }
  }

  async function toggleComplete(task: Task): Promise<Task> {
    const done = !task.completedAt;
    const updated = await write(() => (done ? projectsApi.completeTask(task.id) : projectsApi.reopenTask(task.id)));
    apply(updated);
    if (updated.parentTaskId) bumpSubtasks(updated.parentTaskId, 0, done ? 1 : -1);
    if (done) celebrate();
    return updated;
  }

  async function deleteTask(taskId: string): Promise<void> {
    await write(() => projectsApi.deleteTask(taskId));
    for (const key of Object.keys(columns.value)) columns.value[key] = columns.value[key]!.filter((t) => t.id !== taskId);
    myTasks.value = myTasks.value.filter((t) => t.id !== taskId);
    if (detail.value?.id === taskId) detail.value = null;
    else if (detail.value) {
      const before = detail.value.subtasks.length;
      detail.value.subtasks = detail.value.subtasks.filter((t) => t.id !== taskId);
      if (detail.value.subtasks.length !== before) bumpSubtasks(detail.value.id, -1, 0);
    }
  }

  async function openTask(taskId: string): Promise<void> {
    try {
      detail.value = await projectsApi.getTask(taskId);
    } catch (err) {
      notice.value = extractError(err);
      detail.value = null;
    }
  }

  function closeTask(): void {
    detail.value = null;
  }

  // ── Colaboración (entregable 2) ───────────────────────────────────────────
  /**
   * Comentarios, «me gusta», seguidores, adjuntos y aprobaciones: tras cada cambio se vuelve a pedir el detalle, porque el servidor
   * también escribe en el historial y en los seguidores (mencionar a alguien lo suma) y la pantalla debe mostrar lo que quedó.
   */
  async function refreshDetail(): Promise<void> {
    if (detail.value) await openTask(detail.value.id);
  }

  async function addComment(bodyDoc: RichDoc): Promise<void> {
    if (!detail.value) return;
    const taskId = detail.value.id;
    await write(() => projectsApi.addComment(taskId, bodyDoc));
    await refreshDetail();
  }

  async function editComment(commentId: string, bodyDoc: RichDoc): Promise<void> {
    await write(() => projectsApi.editComment(commentId, bodyDoc));
    await refreshDetail();
  }

  async function deleteComment(commentId: string): Promise<void> {
    await write(() => projectsApi.deleteComment(commentId));
    await refreshDetail();
  }

  async function toggleTaskLike(me: string): Promise<void> {
    if (!detail.value) return;
    const d = detail.value;
    d.likedBy = await write(() => projectsApi.setTaskLike(d.id, !d.likedBy.includes(me)));
  }

  async function toggleCommentLike(comment: TaskComment, me: string): Promise<void> {
    comment.likedBy = await write(() => projectsApi.setCommentLike(comment.id, !comment.likedBy.includes(me)));
  }

  async function setFollowing(userId: string, following: boolean): Promise<void> {
    if (!detail.value) return;
    const taskId = detail.value.id;
    const followers = await write(() => (following ? projectsApi.addFollower(taskId, userId) : projectsApi.removeFollower(taskId, userId)));
    if (detail.value?.id === taskId) detail.value.followers = followers;
  }

  /**
   * Sube el archivo a document-service (URL firmada, igual que las imágenes del catálogo) y lo registra en la tarea. El archivo queda
   * ligado a la tarea (`project_task`) para que document-service sepa de qué es.
   */
  async function attachFile(file: File): Promise<void> {
    if (!detail.value) return;
    const taskId = detail.value.id;
    await write(async () => {
      const presigned = await fileApi.requestPresigned({
        resourceType: 'project_task',
        resourceId: taskId,
        category: 'attachment',
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
      });
      const upload = await fetch(presigned.presignedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
      if (!upload.ok) throw new Error(`HTTP ${upload.status}`);
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const checksum = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
      await fileApi.confirm(presigned.fileId, checksum);
      return projectsApi.addAttachment(taskId, {
        documentId: presigned.fileId,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      });
    });
    await refreshDetail();
  }

  async function removeAttachment(attachmentId: string): Promise<void> {
    await write(() => projectsApi.removeAttachment(attachmentId));
    await refreshDetail();
  }

  async function decide(decision: ApprovalDecision): Promise<void> {
    if (!detail.value) return;
    const updated = await write(() => projectsApi.decide(detail.value!.id, decision));
    apply(updated);
    if (decision === 'approved') celebrate();
    await refreshDetail();
  }

  async function setKind(kind: TaskKind): Promise<void> {
    if (!detail.value) return;
    const d = detail.value;
    apply(await write(() => projectsApi.updateTask(d.id, { version: d.version, kind })));
    await refreshDetail();
  }

  // ── Cronograma y estado del proyecto (entregable 3) ───────────────────────
  async function addDependency(taskId: string, dependsOnTaskId: string): Promise<void> {
    await write(() => projectsApi.addDependency(taskId, dependsOnTaskId));
    await Promise.all([refreshDetail(), reloadBoard()]);
  }

  async function removeDependency(taskId: string, dependsOnTaskId: string): Promise<void> {
    await write(() => projectsApi.removeDependency(taskId, dependsOnTaskId));
    await Promise.all([refreshDetail(), reloadBoard()]);
  }

  /** Arrastrar en el calendario o en el cronograma: cambia las fechas con la versión que la pantalla tiene. */
  async function reschedule(taskId: string, dates: { startOn?: string | null; dueOn?: string | null }): Promise<void> {
    const card = Object.values(columns.value).flat().find((t) => t.id === taskId);
    if (!card) return;
    try {
      await updateTask(taskId, card.version, dates);
    } catch {
      // El aviso y la recarga los hace `write`.
    }
  }

  async function fetchStatusUpdates(): Promise<void> {
    if (!current.value) return;
    try {
      statusUpdates.value = await projectsApi.statusUpdates(current.value.id);
    } catch (err) {
      notice.value = extractError(err);
    }
  }

  async function postStatusUpdate(status: ProjectHealth, bodyDoc: RichDoc | null): Promise<void> {
    if (!current.value) return;
    const update = await write(() => projectsApi.postStatusUpdate(current.value!.id, status, bodyDoc));
    statusUpdates.value = [update, ...statusUpdates.value];
    current.value = { ...current.value, latestStatus: update };
  }

  // ── Vínculos, etiquetas, campos, plantillas, búsqueda y lote (entregable 4) ──
  function boardCard(taskId: string): BoardTask | undefined {
    return Object.values(columns.value).flat().find((t) => t.id === taskId);
  }

  let tagsLoaded = false;
  async function ensureTags(force = false): Promise<void> {
    if (tagsLoaded && !force) return;
    try {
      tags.value = await projectsApi.tags();
      tagsLoaded = true;
    } catch (err) {
      notice.value = extractError(err);
    }
  }

  /** Crea la etiqueta (o devuelve la que ya se llama igual) y la deja en la lista del autocompletado. */
  async function createTag(name: string, color?: ProjectColor): Promise<Tag> {
    const tag = await write(() => projectsApi.createTag(name, color));
    if (!tags.value.some((t) => t.id === tag.id)) tags.value = [...tags.value, tag].sort((a, b) => a.name.localeCompare(b.name));
    return tag;
  }

  async function setTaskTag(taskId: string, tagId: string, on: boolean): Promise<void> {
    const items = await write(() => projectsApi.setTaskTag(taskId, tagId, on));
    if (detail.value?.id === taskId) detail.value.tags = items;
    const card = boardCard(taskId);
    if (card) card.tags = items;
  }

  async function addLink(entityType: LinkEntity, entityId: string, label: string): Promise<void> {
    if (!detail.value) return;
    const taskId = detail.value.id;
    await write(() => projectsApi.addLink(taskId, { entityType, entityId, label }));
    await refreshDetail();
  }

  async function removeLink(linkId: string): Promise<void> {
    await write(() => projectsApi.removeLink(linkId));
    if (detail.value) detail.value.links = detail.value.links.filter((l) => l.id !== linkId);
  }

  /** Llena o vacía un campo; el servidor devuelve el valor normalizado (p. ej. «1.500,5» → 1500.5). */
  async function setFieldValue(taskId: string, fieldId: string, value: FieldValue | null): Promise<void> {
    const saved = await write(() => projectsApi.setFieldValue(taskId, fieldId, value));
    if (detail.value?.id === taskId) {
      const f = detail.value.fields.find((x) => x.id === fieldId);
      if (f) f.value = saved;
    }
    const card = boardCard(taskId);
    if (card) {
      const values = { ...card.values };
      if (saved === null) delete values[fieldId];
      else values[fieldId] = saved;
      card.values = values;
    }
  }

  async function createField(name: string, type: FieldType, options?: FieldOptionInput[]): Promise<void> {
    if (!current.value) return;
    const projectId = current.value.id;
    await write(() => projectsApi.createField(projectId, { name, type, options }));
    await reloadBoard();
  }

  async function updateField(fieldId: string, patch: { name?: string; options?: FieldOptionInput[] }): Promise<void> {
    await write(() => projectsApi.updateField(fieldId, patch));
    await reloadBoard();
  }

  async function deleteField(fieldId: string): Promise<void> {
    await write(() => projectsApi.deleteField(fieldId));
    await reloadBoard();
  }

  async function createFromTemplate(input: { templateCode: string; name?: string; visibility: Visibility; startOn: string; locale: string }): Promise<Project> {
    const project = await write(() => projectsApi.createFromTemplate(input));
    await fetchProjects();
    return project;
  }

  async function duplicateProject(projectId: string, name?: string): Promise<Project> {
    const project = await write(() => projectsApi.duplicate(projectId, name));
    await fetchProjects();
    return project;
  }

  /**
   * Edición en lote: el servidor aplica cada tarea por separado y dice cuáles no pudo (rol, versión). Después se recarga lo abierto,
   * porque un lote puede mover, borrar o completar tarjetas de varias columnas a la vez.
   */
  async function bulk(taskIds: string[], action: BulkAction): Promise<BulkResult[]> {
    const results = await write(() => projectsApi.bulk(taskIds, action));
    if (action.type === 'complete' && results.some((r) => r.ok)) celebrate();
    await Promise.all([reloadBoard(), myTasksOpen.value ? fetchMyTasks(false) : Promise.resolve()]);
    return results;
  }

  // ── Tiempo real ───────────────────────────────────────────────────────────
  /**
   * `projects.changed` del socket: otra persona (o esta misma en otra pestaña) cambió algo. El aviso no trae datos (ver el gateway,
   * projects-routing.ts): se vuelve a pedir lo que esté abierto y le toque, con un pequeño retardo para juntar ráfagas (mover una
   * tarjeta publica varios eventos seguidos).
   */
  let pending: ReturnType<typeof setTimeout> | null = null;
  const touched = { board: false, detail: false, myTasks: false };
  const myTasksOpen = ref(false);

  function onRealtime(message: { event: string; projectIds: string[]; taskId: string | null }): void {
    if (current.value && message.projectIds.includes(current.value.id)) touched.board = true;
    if (detail.value && message.taskId && (message.taskId === detail.value.id || detail.value.subtasks.some((s) => s.id === message.taskId))) {
      touched.detail = true;
    }
    if (myTasksOpen.value) touched.myTasks = true;
    if (!touched.board && !touched.detail && !touched.myTasks) return;
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      const { board, detail: d, myTasks: m } = touched;
      touched.board = touched.detail = touched.myTasks = false;
      if (board) void reloadBoard();
      if (d) void refreshDetail();
      if (m) void projectsApi.myTasks(false).then((items) => (myTasks.value = items)).catch(() => undefined);
    }, 400);
  }

  // ── Mis tareas ────────────────────────────────────────────────────────────
  async function fetchMyTasks(includeCompleted = false): Promise<void> {
    const out = await read(() => projectsApi.myTasks(includeCompleted));
    if (out) myTasks.value = out;
  }

  async function createMyTask(title: string, me: string, dueOn: string | null): Promise<void> {
    const task = await write(() => projectsApi.createTask({ title, assigneeUserId: me, dueOn }));
    myTasks.value = [...myTasks.value, { ...task, parent: null, projects: [], subtasks: { total: 0, completed: 0 } }];
  }

  return {
    projects,
    current,
    sections,
    columns,
    myTasks,
    detail,
    directory,
    users,
    loading,
    error,
    notice,
    myRole,
    canEdit,
    canManage,
    ensureDirectory,
    fetchProjects,
    createProject,
    loadProject,
    reloadBoard,
    updateProject,
    setArchived,
    removeProject,
    addMember,
    updateMember,
    removeMember,
    createSection,
    renameSection,
    moveSection,
    deleteSection,
    createTask,
    updateTask,
    moveTask,
    toggleComplete,
    deleteTask,
    openTask,
    closeTask,
    fetchMyTasks,
    createMyTask,
    addComment,
    editComment,
    deleteComment,
    toggleTaskLike,
    toggleCommentLike,
    setFollowing,
    attachFile,
    removeAttachment,
    decide,
    setKind,
    onRealtime,
    myTasksOpen,
    dependencies,
    statusUpdates,
    addDependency,
    removeDependency,
    reschedule,
    fetchStatusUpdates,
    postStatusUpdate,
    fields,
    tags,
    ensureTags,
    createTag,
    setTaskTag,
    addLink,
    removeLink,
    setFieldValue,
    createField,
    updateField,
    deleteField,
    createFromTemplate,
    duplicateProject,
    bulk,
  };
});
