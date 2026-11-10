import { computed, ref } from 'vue';
import { projectsApi } from '@/api/projects';
import { useAuthStore } from '@/stores/auth';
import { usePluginsStore } from '@/stores/plugins';

/**
 * Proyectos para elegir la dimensión «proyecto» en contabilidad (líneas de asiento, filtro de informes). Solo si la organización
 * usa Proyectos y la persona puede verlos; si no, la lista queda vacía y las pantallas esconden el campo. Trae activos y archivados:
 * un proyecto archivado sigue teniendo su historia contable, y un asiento viejo tiene que mostrar su nombre.
 */
export function useProjectOptions() {
  const plugins = usePluginsStore();
  const auth = useAuthStore();
  const projects = ref<Array<{ id: string; name: string; archived: boolean }>>([]);

  const enabled = computed(() => plugins.isActive('projects.tasks_kanban') && auth.can('project:read'));

  async function load(): Promise<void> {
    if (!enabled.value) return;
    try {
      const [active, archived] = await Promise.all([projectsApi.list('active'), projectsApi.list('archived')]);
      projects.value = [
        ...active.map((p) => ({ id: p.id, name: p.name, archived: false })),
        ...archived.map((p) => ({ id: p.id, name: p.name, archived: true })),
      ];
    } catch {
      // Sin proyectos (servicio caído, sin permiso) la contabilidad sigue funcionando: solo no se ofrece la dimensión.
      projects.value = [];
    }
  }

  /** Para elegir en un asiento nuevo: solo los activos. */
  const activeOptions = computed(() => projects.value.filter((p) => !p.archived).map((p) => ({ value: p.id, title: p.name })));
  /** Para filtrar informes: todos, también los archivados. */
  const allOptions = computed(() => projects.value.map((p) => ({ value: p.id, title: p.name })));
  const nameOf = (id: string | null | undefined): string => projects.value.find((p) => p.id === id)?.name ?? '';

  return { load, activeOptions, allOptions, nameOf };
}
