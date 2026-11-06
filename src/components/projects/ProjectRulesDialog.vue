<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { projectsApi } from '@/api/projects';
import { useProjectsStore } from '@/stores/projects';
import { extractError } from '@/utils/error';
import { displayName } from '@/utils/projects';
import type { ProjectRule, RuleAction, RuleInput, RuleTrigger } from '@/types/projects';

/**
 * Reglas del proyecto (entregable 7), como las de Asana: «cuando pase X, haz Y». Corren a nombre de quien las guarda por última vez,
 * con su rol en el proyecto, y lo que hace una regla no dispara otras. Si una falla, aquí se ve su último error.
 */
const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();
const { t } = useI18n();
const store = useProjectsStore();

const TRIGGERS: RuleTrigger[] = ['task_added', 'task_moved', 'task_completed'];
const ACTIONS: RuleAction['type'][] = ['assign', 'set_due', 'move_to_section', 'complete', 'add_tag', 'add_follower'];

const rules = ref<ProjectRule[]>([]);
const failure = ref<string | null>(null);
const editing = ref<(RuleInput & { id: string | null }) | null>(null);
const saving = ref(false);

async function load(): Promise<void> {
  if (!store.current) return;
  try {
    rules.value = await projectsApi.rules(store.current.id);
  } catch (err) {
    failure.value = extractError(err);
  }
}
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    editing.value = null;
    void load();
    void store.ensureTags();
  },
);

const sectionItems = computed(() => store.sections.map((s) => ({ value: s.id, title: s.name })));
const people = computed(() => store.directory.map((u) => ({ value: u.id, title: displayName(u) })));
const tagItems = computed(() => store.tags.map((tag) => ({ value: tag.id, title: tag.name })));
const sectionName = (id: string | null) => store.sections.find((s) => s.id === id)?.name ?? '—';
const personName = (id: string | null) => (id ? displayName(store.users.get(id)) || '—' : t('projects.task.unassigned'));
const tagName = (id: string) => store.tags.find((x) => x.id === id)?.name ?? '—';

/** «Cuando una tarea se mueve a Hecho» */
function whenText(r: RuleInput): string {
  if (r.trigger === 'task_completed') return t('projects.rules.when.task_completed');
  return r.triggerSectionId ? t(`projects.rules.when.${r.trigger}In`, { section: sectionName(r.triggerSectionId) }) : t(`projects.rules.when.${r.trigger}`);
}

/** «asignar a Beto», «vence en 3 días»… */
function actionText(a: RuleAction): string {
  switch (a.type) {
    case 'assign':
      return t('projects.rules.do.assign', { who: personName(a.userId) });
    case 'set_due':
      return t('projects.rules.do.set_due', a.days);
    case 'move_to_section':
      return t('projects.rules.do.move_to_section', { section: sectionName(a.sectionId) });
    case 'complete':
      return t('projects.rules.do.complete');
    case 'add_tag':
      return t('projects.rules.do.add_tag', { tag: tagName(a.tagId) });
    case 'add_follower':
      return t('projects.rules.do.add_follower', { who: personName(a.userId) });
  }
}

function blankAction(type: RuleAction['type']): RuleAction {
  switch (type) {
    case 'assign':
      return { type, userId: null };
    case 'set_due':
      return { type, days: 1 };
    case 'move_to_section':
      return { type, sectionId: store.sections.at(-1)?.id ?? '' };
    case 'complete':
      return { type };
    case 'add_tag':
      return { type, tagId: store.tags[0]?.id ?? '' };
    case 'add_follower':
      return { type, userId: store.directory[0]?.id ?? '' };
  }
}

function startNew(): void {
  editing.value = { id: null, name: '', trigger: 'task_moved', triggerSectionId: store.sections.at(-1)?.id ?? null, actions: [{ type: 'complete' }], enabled: true };
}

function startEdit(r: ProjectRule): void {
  editing.value = { id: r.id, name: r.name, trigger: r.trigger, triggerSectionId: r.triggerSectionId, actions: r.actions.map((a) => ({ ...a })), enabled: r.enabled };
}

const valid = computed(() => {
  const e = editing.value;
  if (!e || !e.name.trim() || e.actions.length === 0) return false;
  return e.actions.every((a) => (a.type === 'move_to_section' ? !!a.sectionId : a.type === 'add_tag' ? !!a.tagId : a.type === 'add_follower' ? !!a.userId : true));
});

async function save(): Promise<void> {
  const e = editing.value;
  if (!e || !store.current || !valid.value) return;
  saving.value = true;
  failure.value = null;
  try {
    const body: RuleInput = { name: e.name.trim(), trigger: e.trigger, triggerSectionId: e.trigger === 'task_completed' ? null : e.triggerSectionId, actions: e.actions, enabled: e.enabled };
    if (e.id) await projectsApi.updateRule(e.id, body);
    else await projectsApi.createRule(store.current.id, body);
    editing.value = null;
    await load();
  } catch (err) {
    failure.value = extractError(err);
  } finally {
    saving.value = false;
  }
}

async function toggle(r: ProjectRule, enabled: boolean): Promise<void> {
  try {
    await projectsApi.updateRule(r.id, { name: r.name, trigger: r.trigger, triggerSectionId: r.triggerSectionId, actions: r.actions, enabled });
    await load();
  } catch (err) {
    failure.value = extractError(err);
  }
}

async function remove(r: ProjectRule): Promise<void> {
  try {
    await projectsApi.deleteRule(r.id);
    await load();
  } catch (err) {
    failure.value = extractError(err);
  }
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="880" scrollable @update:model-value="emit('update:modelValue', $event)">
    <v-card>
      <v-card-title>{{ t('projects.rules.title') }}</v-card-title>
      <v-card-text class="d-flex flex-column ga-4">
        <div class="text-body-medium text-medium-emphasis">{{ t('projects.rules.hint') }}</div>
        <v-alert v-if="failure" type="error" closable @click:close="failure = null">{{ failure }}</v-alert>

        <template v-if="!editing">
          <v-card v-for="r in rules" :key="r.id" variant="outlined" class="pa-4">
            <div class="d-flex align-center ga-2">
              <v-icon icon="mdi-lightning-bolt-outline" color="warning" />
              <span class="text-body-large font-weight-medium flex-grow-1">{{ r.name }}</span>
              <v-switch :model-value="r.enabled" :disabled="!store.canEdit" class="flex-grow-0" :aria-label="t('projects.rules.enabled')" @update:model-value="(v) => toggle(r, !!v)" />
              <v-btn v-if="store.canEdit" icon="mdi-pencil-outline" size="small" variant="text" :aria-label="t('common.edit')" @click="startEdit(r)" />
              <v-btn v-if="store.canEdit" icon="mdi-trash-can-outline" size="small" variant="text" :aria-label="t('common.delete')" @click="remove(r)" />
            </div>
            <div class="text-body-medium">{{ whenText(r) }} → {{ r.actions.map(actionText).join(', ') }}</div>
            <div class="text-body-small text-medium-emphasis">{{ t('projects.rules.runs', r.runCount) }}</div>
            <v-alert v-if="r.lastError" type="warning" class="mt-2">{{ t('projects.rules.lastError', { error: r.lastError }) }}</v-alert>
          </v-card>
          <div v-if="!rules.length" class="text-body-medium text-medium-emphasis">{{ t('projects.rules.empty') }}</div>
          <v-btn v-if="store.canEdit" color="primary" prepend-icon="mdi-plus" class="align-self-start" @click="startNew">{{ t('projects.rules.new') }}</v-btn>
        </template>

        <v-card v-else variant="tonal" class="pa-4 d-flex flex-column ga-2">
          <v-text-field v-model="editing.name" :label="t('projects.rules.name')" :counter="120" autofocus />
          <div class="d-flex flex-column flex-sm-row ga-2">
            <v-select v-model="editing.trigger" :items="TRIGGERS.map((v) => ({ value: v, title: t(`projects.rules.trigger.${v}`) }))" :label="t('projects.rules.whenLabel')" />
            <v-select
              v-if="editing.trigger !== 'task_completed'"
              v-model="editing.triggerSectionId"
              :items="sectionItems"
              :label="t('projects.rules.inSection')"
              clearable
              :placeholder="t('projects.rules.anySection')"
              persistent-placeholder
            />
          </div>
          <div class="text-body-medium font-weight-medium">{{ t('projects.rules.thenLabel') }}</div>
          <div v-for="(a, i) in editing.actions" :key="i" class="d-flex flex-column flex-sm-row align-sm-center ga-2">
            <v-select
              :model-value="a.type"
              :items="ACTIONS.map((v) => ({ value: v, title: t(`projects.rules.action.${v}`) }))"
              :label="t('projects.rules.actionLabel')"
              @update:model-value="(v) => (editing!.actions[i] = blankAction(v))"
            />
            <v-autocomplete v-if="a.type === 'assign'" v-model="a.userId" :items="people" :label="t('projects.task.assignee')" clearable :placeholder="t('projects.task.unassigned')" persistent-placeholder />
            <v-text-field v-else-if="a.type === 'set_due'" v-model.number="a.days" type="number" min="0" max="365" :label="t('projects.rules.days')" />
            <v-select v-else-if="a.type === 'move_to_section'" v-model="a.sectionId" :items="sectionItems" :label="t('projects.rules.section')" />
            <v-select v-else-if="a.type === 'add_tag'" v-model="a.tagId" :items="tagItems" :label="t('projects.tags.title')" :no-data-text="t('projects.rules.noTags')" />
            <v-autocomplete v-else-if="a.type === 'add_follower'" v-model="a.userId" :items="people" :label="t('projects.followers.title')" />
            <v-btn icon="mdi-close" size="small" variant="text" :disabled="editing.actions.length === 1" :aria-label="t('common.delete')" @click="editing.actions.splice(i, 1)" />
          </div>
          <v-btn v-if="editing.actions.length < 5" variant="text" size="small" prepend-icon="mdi-plus" class="align-self-start" @click="editing.actions.push({ type: 'complete' })">
            {{ t('projects.rules.addAction') }}
          </v-btn>
          <div class="text-body-medium text-medium-emphasis">{{ whenText(editing) }} → {{ editing.actions.map(actionText).join(', ') }}</div>
          <div class="d-flex ga-2">
            <v-spacer />
            <v-btn variant="text" @click="editing = null">{{ t('common.cancel') }}</v-btn>
            <v-btn color="primary" :disabled="!valid" :loading="saving" @click="save">{{ t('common.save') }}</v-btn>
          </div>
        </v-card>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">{{ t('common.close') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
