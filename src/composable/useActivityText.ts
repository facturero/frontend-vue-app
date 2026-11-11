import { useI18n } from 'vue-i18n';
import { formatMinutes } from '@/utils/duration';
import { formatDate } from '@/utils/format';
import { useProjectsStore } from '@/stores/projects';
import { displayName } from '@/utils/projects';
import type { TaskActivity } from '@/types/projects';

/**
 * Texto de las líneas del historial de una tarea («Ana asignó a Beto», «cambió la fecha de entrega al 12/11/2026»…). Las claves y sus
 * datos los define projects-service (`application/activity.ts`). Lo usa la pestaña «Todo» de la conversación (TaskConversation), que
 * mezcla el historial con los comentarios por fecha y hora.
 */
export function useActivityText() {
  const { t } = useI18n();
  const store = useProjectsStore();

  const name = (id: string | null) => (id ? displayName(store.users.get(id)) || t('projects.share.unknownUser') : t('projects.activity.system'));
  const date = (value: unknown) => (typeof value === 'string' && value ? formatDate(value) : '');


  /** Texto de una línea del historial. Las claves y sus datos los define projects-service (application/activity.ts). */
  function describe(a: TaskActivity): string {
    const d = a.data;
    switch (a.kind) {
      case 'assigned':
        return t('projects.activity.assigned', { to: name(String(d.to ?? '')) });
      case 'due_changed':
        return d.to ? t('projects.activity.dueChanged', { to: date(d.to) }) : t('projects.activity.dueRemoved');
      case 'start_changed':
        return d.to ? t('projects.activity.startChanged', { to: date(d.to) }) : t('projects.activity.startRemoved');
      case 'title_changed':
        return t('projects.activity.titleChanged', { to: String(d.to ?? '') });
      case 'moved':
        return t('projects.activity.moved', { from: String(d.from ?? ''), to: String(d.to ?? '') });
      case 'approval_decided':
        return t(`projects.approval.decided.${String(d.decision)}`);
      case 'kind_changed':
        return t(`projects.activity.kindChanged.${String(d.to)}`);
      case 'dependency_added':
        return t('projects.activity.dependencyAdded', { task: String(d.dependsOn ?? '') });
      case 'dependency_removed':
        return t('projects.activity.dependencyRemoved', { task: String(d.dependsOn ?? '') });
      case 'rule_applied':
        return d.error ? t('projects.activity.ruleFailed', { rule: String(d.rule ?? '') }) : t('projects.activity.ruleApplied', { rule: String(d.rule ?? '') });
      case 'form_submitted':
        return t('projects.activity.formSubmitted', { form: String(d.form ?? '') });
      case 'time_logged':
        return t('projects.activity.timeLogged', { amount: formatMinutes(Number(d.minutes ?? 0)) });
      case 'estimate_changed':
        return d.to ? t('projects.activity.estimateChanged', { amount: formatMinutes(Number(d.to)) }) : t('projects.activity.estimateRemoved');
      case 'link_added':
        return t('projects.activity.linkAdded', { what: t(`projects.links.type.${String(d.entityType)}`), label: String(d.label ?? '') });
      case 'link_removed':
        return t('projects.activity.linkRemoved', { what: t(`projects.links.type.${String(d.entityType)}`), label: String(d.label ?? '') });
      case 'field_set':
        return d.value === null || d.value === undefined
          ? t('projects.activity.fieldCleared', { field: String(d.field ?? '') })
          : t('projects.activity.fieldSet', { field: String(d.field ?? ''), value: String(d.value) });
      case 'attachment_added':
      case 'attachment_removed':
        return t(`projects.activity.${a.kind === 'attachment_added' ? 'attachmentAdded' : 'attachmentRemoved'}`, { file: String(d.fileName ?? '') });
      default:
        return t(`projects.activity.${({ created: 'created', unassigned: 'unassigned', completed: 'completed', reopened: 'reopened', description_changed: 'descriptionChanged' } as Record<string, string>)[a.kind] ?? 'changed'}`);
    }
  }

  return { name, describe };
}
