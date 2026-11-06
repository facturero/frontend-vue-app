<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { formatDateTime } from '@/utils/format';
import { useConfirm } from '@/composable/useConfirm';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import DateField from '@/components/ui/DateField.vue';
import { useAuthStore } from '@/stores/auth';
import { useProjectsStore } from '@/stores/projects';
import { FIELD_ICON, displayName } from '@/utils/projects';
import type { ApprovalDecision, RichDoc, Task } from '@/types/projects';
import DueDateChip from './DueDateChip.vue';
import RichTextEditor from './RichTextEditor.vue';
import TaskAttachments from './TaskAttachments.vue';
import TaskConversation from './TaskConversation.vue';
import TaskFieldInput from './TaskFieldInput.vue';
import TaskLinks from './TaskLinks.vue';
import TaskTags from './TaskTags.vue';
import TaskTime from './TaskTime.vue';
import UserAvatar from './UserAvatar.vue';

/**
 * Detalle de una tarea en un panel a la derecha, sin salir de la lista o el tablero (como Asana). Cada campo se guarda al soltarlo
 * (blur, Enter o al elegir), con la versión de la tarea: si otra persona la cambió entretanto, el servidor responde 409 y el store
 * recarga la tarea, así nadie pisa el cambio de otro sin verlo.
 */
const { t } = useI18n();
const confirm = useConfirm();
const { smAndDown } = useDisplay();
const store = useProjectsStore();
const auth = useAuthStore();

const task = computed(() => store.detail);
const open = computed({
  get: () => !!store.detail,
  set: (v: boolean) => {
    if (!v) store.closeTask();
  },
});
const readOnly = computed(() => !task.value?.canEdit);

const title = ref('');
/** Descripción en texto enriquecido. Las del entregable 1 eran texto plano: se muestran como párrafos hasta que alguien las edite. */
const descriptionDoc = ref<RichDoc | null>(null);
const conversation = ref<InstanceType<typeof TaskConversation> | null>(null);
const dueInput = ref<{ focus: () => void } | null>(null);
const me = computed(() => auth.user?.id ?? '');
const following = computed(() => !!task.value?.followers.includes(me.value));

function docFromText(text: string | null): RichDoc | null {
  if (!text) return null;
  return { type: 'doc', content: text.split('\n').map((line) => (line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' })) };
}
const newSubtask = ref('');
const subtaskInput = ref<{ focus: () => void } | null>(null);

watch(
  () => [task.value?.id, task.value?.version],
  () => {
    title.value = task.value?.title ?? '';
    descriptionDoc.value = task.value?.descriptionDoc ?? docFromText(task.value?.description ?? null);
  },
  { immediate: true },
);

const people = computed(() => store.directory.map((u) => ({ value: u.id, title: displayName(u), subtitle: u.email })));

async function save(patch: Parameters<typeof store.updateTask>[2]): Promise<void> {
  const current = task.value;
  if (!current) return;
  try {
    await store.updateTask(current.id, current.version, patch);
  } catch {
    // El aviso ya lo deja el store (y recarga si fue un conflicto de versión).
  }
}

function saveTitle(): void {
  const value = title.value.trim();
  if (!task.value || !value || value === task.value.title) {
    title.value = task.value?.title ?? '';
    return;
  }
  void save({ title: value });
}

function saveDescription(): void {
  if (!task.value || readOnly.value) return;
  const current = task.value.descriptionDoc ?? docFromText(task.value.description);
  if (JSON.stringify(descriptionDoc.value) === JSON.stringify(current)) return;
  const empty = !descriptionDoc.value || JSON.stringify(descriptionDoc.value) === JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });
  void save(empty ? { descriptionDoc: null, description: null } : { descriptionDoc: descriptionDoc.value });
}

async function decide(decision: ApprovalDecision): Promise<void> {
  try {
    await store.decide(decision);
  } catch {
    // El aviso lo deja el store.
  }
}

async function run(work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch {
    // El aviso lo deja el store.
  }
}

/** Tareas del proyecto abierto a las que esta puede esperar (no ella misma ni las que ya espera). */
const dependencyCandidates = computed(() => {
  const d = task.value;
  if (!d) return [];
  const taken = new Set([d.id, ...d.blockedBy.map((x) => x.id)]);
  return Object.values(store.columns)
    .flat()
    .filter((x) => !taken.has(x.id))
    .map((x) => ({ value: x.id, title: x.title }));
});
const openBlockers = computed(() => task.value?.blockedBy.filter((x) => !x.completed).length ?? 0);

const followerCandidates = computed(() =>
  store.directory.filter((u) => !task.value?.followers.includes(u.id)).map((u) => ({ value: u.id, title: displayName(u), subtitle: u.email })),
);

/**
 * Atajos de Asana dentro del detalle (manteniendo Tab y pulsando la letra): Tab+M asignarme, Tab+C completar, Tab+L «me gusta»,
 * Tab+D fecha de entrega, Tab+K ir al comentario. Se ignoran mientras se escribe en un campo de texto.
 */
let tabHeld = false;
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}
function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Tab') {
    tabHeld = true;
    return;
  }
  const d = task.value;
  if (!tabHeld || !d || typing(event.target)) return;
  const key = event.key.toLowerCase();
  const actions: Record<string, () => void> = {
    m: () => !readOnly.value && void save({ assigneeUserId: me.value }),
    c: () => d.canComplete && void toggle(d),
    l: () => d.canComment && void run(() => store.toggleTaskLike(me.value)),
    d: () => dueInput.value?.focus(),
    k: () => conversation.value?.focus(),
  };
  if (actions[key]) {
    event.preventDefault();
    actions[key]!();
  }
}
function onKeyUp(event: KeyboardEvent): void {
  if (event.key === 'Tab') tabHeld = false;
}
onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
});

function saveDate(field: 'dueOn' | 'startOn', value: string): void {
  if (!task.value || (task.value[field] ?? '') === value) return;
  void save({ [field]: value || null });
}

async function toggle(target: Task): Promise<void> {
  try {
    await store.toggleComplete(target);
  } catch {
    // El aviso lo deja el store.
  }
}

async function addSubtask(): Promise<void> {
  const value = newSubtask.value.trim();
  if (!value || !task.value) return;
  newSubtask.value = '';
  try {
    await store.createTask({ title: value, parentTaskId: task.value.id });
    await nextTick();
    subtaskInput.value?.focus();
  } catch {
    newSubtask.value = value;
  }
}

async function remove(): Promise<void> {
  if (!task.value) return;
  const ok = await confirm({ title: t('projects.task.deleteTitle'), text: t('projects.task.deleteText'), confirmText: t('common.delete'), destructive: true });
  if (!ok || !task.value) return;
  try {
    await store.deleteTask(task.value.id);
  } catch {
    // El aviso lo deja el store.
  }
}

const createdLine = computed(() => {
  if (!task.value) return '';
  const who = displayName(store.users.get(task.value.createdBy)) || t('projects.share.unknownUser');
  const when = formatDateTime(task.value.createdAt);
  return t('projects.detail.createdBy', { who, when });
});
</script>

<template>
  <v-navigation-drawer v-model="open" location="right" temporary :width="smAndDown ? 360 : 560">
    <template v-if="task">
      <div class="d-flex align-center flex-wrap ga-2 pa-4 border-b">
        <v-btn
          :color="task.completedAt ? 'success' : undefined"
          :variant="task.completedAt ? 'flat' : 'outlined'"
          prepend-icon="mdi-check"
          size="small"
          :disabled="!task.canComplete"
          @click="toggle(task)"
        >
          {{ task.completedAt ? t('projects.task.completed') : t('projects.task.markComplete') }}
        </v-btn>
        <v-spacer />
        <v-btn
          :prepend-icon="task.likedBy.includes(me) ? 'mdi-thumb-up' : 'mdi-thumb-up-outline'"
          :color="task.likedBy.includes(me) ? 'primary' : undefined"
          variant="text"
          size="small"
          :disabled="!task.canComment"
          :aria-label="t('projects.like')"
          @click="run(() => store.toggleTaskLike(me))"
        >
          {{ task.likedBy.length || '' }}
        </v-btn>
        <v-menu v-if="task.canEdit && !task.parentTaskId">
          <template #activator="{ props: menu }">
            <v-btn v-bind="menu" icon="mdi-dots-horizontal" variant="text" size="small" :aria-label="t('projects.menu')" />
          </template>
          <v-list density="compact">
            <v-list-item
              v-if="task.kind !== 'approval'"
              prepend-icon="mdi-thumbs-up-down-outline"
              :title="t('projects.approval.makeApproval')"
              @click="run(() => store.setKind('approval'))"
            />
            <v-list-item v-if="task.kind !== 'milestone'" prepend-icon="mdi-rhombus-outline" :title="t('projects.milestone.make')" @click="run(() => store.setKind('milestone'))" />
            <v-list-item
              v-if="task.kind !== 'task'"
              prepend-icon="mdi-checkbox-marked-circle-outline"
              :title="t('projects.approval.makeTask')"
              @click="run(() => store.setKind('task'))"
            />
          </v-list>
        </v-menu>
        <v-btn v-if="task.canEdit" icon="mdi-trash-can-outline" variant="text" size="small" :aria-label="t('common.delete')" @click="remove" />
        <v-btn icon="mdi-close" variant="text" size="small" :aria-label="t('common.close')" @click="store.closeTask()" />
      </div>

      <div class="pa-6 d-flex flex-column ga-4">
        <v-btn v-if="task.parent" variant="text" size="small" class="align-self-start px-0" prepend-icon="mdi-arrow-up-left" @click="store.openTask(task.parent.id)">
          {{ task.parent.title }}
        </v-btn>

        <v-text-field
          v-model="title"
          variant="plain"
          class="text-title-large"
          :readonly="readOnly"
          :aria-label="t('projects.task.title')"
          @blur="saveTitle"
          @keyup.enter="($event.target as HTMLInputElement).blur()"
        />

        <v-alert v-if="openBlockers" type="warning" icon="mdi-lock-clock">{{ t('projects.dependencies.waiting', openBlockers) }}</v-alert>
        <v-alert v-if="task.kind === 'milestone'" type="info" icon="mdi-rhombus">{{ t('projects.milestone.notice') }}</v-alert>
        <v-alert v-if="task.kind === 'approval'" :type="task.approvalStatus === 'approved' ? 'success' : task.approvalStatus === 'rejected' ? 'error' : task.approvalStatus === 'changes_requested' ? 'warning' : 'info'" :icon="'mdi-thumbs-up-down-outline'">
          <div>{{ t(`projects.approval.status.${task.approvalStatus ?? 'pending'}`) }}</div>
          <div v-if="task.canDecide && (task.approvalStatus === 'pending' || task.approvalStatus === 'changes_requested')" class="d-flex flex-wrap ga-2 mt-2">
            <v-btn color="success" size="small" prepend-icon="mdi-check" @click="decide('approved')">{{ t('projects.approval.approve') }}</v-btn>
            <v-btn color="warning" size="small" variant="outlined" prepend-icon="mdi-pencil-outline" @click="decide('changes_requested')">
              {{ t('projects.approval.requestChanges') }}
            </v-btn>
            <v-btn color="error" size="small" variant="text" prepend-icon="mdi-close" @click="decide('rejected')">{{ t('projects.approval.reject') }}</v-btn>
          </div>
          <div v-else-if="task.approvalStatus === 'pending' && !task.assigneeUserId" class="text-body-small mt-1">{{ t('projects.approval.needsAssignee') }}</div>
        </v-alert>

        <v-table density="compact">
          <tbody>
            <tr>
              <td class="text-medium-emphasis text-no-wrap">{{ t('projects.task.assignee') }}</td>
              <td>
                <div class="d-flex align-center ga-2">
                  <UserAvatar :user-id="task.assigneeUserId" :tooltip="false" />
                  <v-autocomplete
                    :model-value="task.assigneeUserId"
                    :items="people"
                    :placeholder="t('projects.task.unassigned')"
                    :readonly="readOnly"
                    clearable
                    variant="plain"
                    @update:model-value="(v: string | null) => save({ assigneeUserId: v ?? null })"
                  />
                  <v-btn
                    v-if="!readOnly && task.assigneeUserId !== auth.user?.id"
                    size="small"
                    variant="text"
                    @click="save({ assigneeUserId: auth.user!.id })"
                  >
                    {{ t('projects.task.assignToMe') }}
                  </v-btn>
                </div>
              </td>
            </tr>
            <tr>
              <td class="text-medium-emphasis text-no-wrap">{{ t('projects.task.dueOn') }}</td>
              <td>
                <div class="d-flex align-center ga-2">
                  <DateField
                    ref="dueInput"
                    :model-value="task.dueOn"
                    variant="plain"
                    :readonly="readOnly"
                    @update:model-value="(v) => saveDate('dueOn', v ?? '')"
                  />
                  <DueDateChip :due-on="task.dueOn" :completed="!!task.completedAt" relative-only />
                </div>
              </td>
            </tr>
            <tr>
              <td class="text-medium-emphasis text-no-wrap">{{ t('projects.task.startOn') }}</td>
              <td>
                <DateField
                  :model-value="task.startOn"
                  variant="plain"
                  :readonly="readOnly"
                  @update:model-value="(v) => saveDate('startOn', v ?? '')"
                />
              </td>
            </tr>
            <tr>
              <td class="text-medium-emphasis text-no-wrap">{{ t('projects.task.projects') }}</td>
              <td>
                <div class="d-flex flex-wrap ga-2 py-2">
                  <v-chip
                    v-for="p in task.projects"
                    :key="p.projectId"
                    size="small"
                    :color="p.color"
                    :to="`/projects/${p.projectId}`"
                    prepend-icon="mdi-folder-outline"
                  >
                    {{ p.name }}<template v-if="p.sectionName"> · {{ p.sectionName }}</template>
                  </v-chip>
                  <span v-if="!task.projects.length" class="text-body-medium text-medium-emphasis">
                    {{ task.parent ? t('projects.task.subtaskOf', { title: task.parent.title }) : t('projects.task.personal') }}
                  </span>
                </div>
              </td>
            </tr>
            <tr>
              <td class="text-medium-emphasis text-no-wrap">{{ t('projects.tags.title') }}</td>
              <td><TaskTags :can-edit="task.canEdit" /></td>
            </tr>
            <tr>
              <td class="text-medium-emphasis text-no-wrap">{{ t('projects.links.title') }}</td>
              <td><TaskLinks :can-edit="task.canEdit" /></td>
            </tr>
            <tr v-for="f in task.fields" :key="f.id">
              <td class="text-medium-emphasis text-no-wrap">
                <v-icon :icon="FIELD_ICON[f.type]" size="small" class="mr-1" />{{ f.name }}
              </td>
              <td><TaskFieldInput :task-id="task.id" :field="f" :value="f.value" :readonly="readOnly" /></td>
            </tr>
            <tr v-if="!task.parentTaskId">
              <td class="text-medium-emphasis text-no-wrap">{{ t('projects.dependencies.blockedBy') }}</td>
              <td>
                <div class="d-flex align-center flex-wrap ga-2 py-2">
                  <v-chip
                    v-for="b in task.blockedBy"
                    :key="b.id"
                    size="small"
                    :color="b.completed ? 'success' : 'warning'"
                    :prepend-icon="b.completed ? 'mdi-check' : 'mdi-lock-outline'"
                    :closable="task.canEdit"
                    @click="store.openTask(b.id)"
                    @click:close="run(() => store.removeDependency(task!.id, b.id))"
                  >
                    {{ b.title }}
                  </v-chip>
                  <v-menu v-if="task.canEdit && dependencyCandidates.length" :close-on-content-click="false">
                    <template #activator="{ props: menu }">
                      <v-btn v-bind="menu" icon="mdi-plus" variant="text" size="x-small" :aria-label="t('projects.dependencies.add')" />
                    </template>
                    <v-card min-width="300" class="pa-2">
                      <v-autocomplete
                        :items="dependencyCandidates"
                        :label="t('projects.dependencies.add')"
                        @update:model-value="(v: string | null) => v && run(() => store.addDependency(task!.id, v))"
                      />
                    </v-card>
                  </v-menu>
                  <span v-if="!task.blockedBy.length && !(task.canEdit && dependencyCandidates.length)" class="text-body-medium text-medium-emphasis">—</span>
                </div>
              </td>
            </tr>
            <tr v-if="task.blocking.length">
              <td class="text-medium-emphasis text-no-wrap">{{ t('projects.dependencies.blocking') }}</td>
              <td>
                <div class="d-flex flex-wrap ga-2 py-2">
                  <v-chip v-for="b in task.blocking" :key="b.id" size="small" prepend-icon="mdi-arrow-right" @click="store.openTask(b.id)">{{ b.title }}</v-chip>
                </div>
              </td>
            </tr>
            <tr>
              <td class="text-medium-emphasis text-no-wrap">{{ t('projects.followers.title') }}</td>
              <td>
                <div class="d-flex align-center flex-wrap ga-2 py-2">
                  <UserAvatar v-for="f in task.followers" :key="f" :user-id="f" :size="26" />
                  <v-menu v-if="task.canEdit" :close-on-content-click="false">
                    <template #activator="{ props: menu }">
                      <v-btn v-bind="menu" icon="mdi-account-plus-outline" variant="text" size="x-small" :aria-label="t('projects.followers.add')" />
                    </template>
                    <v-card min-width="280" class="pa-2">
                      <v-autocomplete
                        :items="followerCandidates"
                        :label="t('projects.followers.add')"
                        @update:model-value="(v: string | null) => v && run(() => store.setFollowing(v, true))"
                      />
                    </v-card>
                  </v-menu>
                  <v-spacer />
                  <v-btn
                    v-if="task.canComment"
                    size="small"
                    :variant="following ? 'tonal' : 'outlined'"
                    :prepend-icon="following ? 'mdi-bell-ring-outline' : 'mdi-bell-outline'"
                    @click="run(() => store.setFollowing(me, !following))"
                  >
                    {{ following ? t('projects.followers.following') : t('projects.followers.follow') }}
                  </v-btn>
                </div>
              </td>
            </tr>
          </tbody>
        </v-table>

        <div>
          <div class="text-body-medium text-medium-emphasis mb-1">{{ t('projects.task.description') }}</div>
          <RichTextEditor
            :key="task.id"
            v-model="descriptionDoc"
            :placeholder="t('projects.task.descriptionPlaceholder')"
            :editable="!readOnly"
            :toolbar="!readOnly"
            @blur="saveDescription"
          />
        </div>

        <div v-if="!task.parent">
          <div class="text-body-large font-weight-medium mb-2">{{ t('projects.task.subtasks') }}</div>
          <v-list density="compact" class="pa-0">
            <v-list-item v-for="s in task.subtasks" :key="s.id" class="px-0" @click="store.openTask(s.id)">
              <template #prepend>
                <v-btn
                  :icon="s.completedAt ? 'mdi-check-circle' : 'mdi-check-circle-outline'"
                  :color="s.completedAt ? 'success' : undefined"
                  variant="text"
                  size="small"
                  :aria-label="t('projects.task.markComplete')"
                  @click.stop="toggle(s)"
                />
              </template>
              <v-list-item-title :class="{ 'text-decoration-line-through text-medium-emphasis': s.completedAt }">{{ s.title }}</v-list-item-title>
              <template #append>
                <div class="d-flex align-center ga-2">
                  <DueDateChip :due-on="s.dueOn" :completed="!!s.completedAt" />
                  <UserAvatar v-if="s.assigneeUserId" :user-id="s.assigneeUserId" :size="22" />
                </div>
              </template>
            </v-list-item>
          </v-list>
          <v-text-field
            v-if="!readOnly"
            ref="subtaskInput"
            v-model="newSubtask"
            :placeholder="t('projects.task.addSubtask')"
            prepend-inner-icon="mdi-plus"
            variant="plain"
            @keyup.enter="addSubtask"
          />
        </div>

        <TaskTime />
        <TaskAttachments />
        <v-divider />
        <TaskConversation ref="conversation" />
        <div class="text-body-small text-medium-emphasis">{{ createdLine }}</div>
      </div>
    </template>
  </v-navigation-drawer>

</template>
