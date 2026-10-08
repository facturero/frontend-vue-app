import type { OrganizationPlugin } from '@/types/plugins';

export interface BlockingPlugin {
  /** Código del módulo que impide desactivar (lo que manda el servidor). */
  code: string;
  /** Nombre legible; si no se encuentra el módulo, el propio código. */
  name: string;
  /** El módulo activo de la organización, para abrir su diálogo de desactivación; null si ya no está activo. */
  plugin: OrganizationPlugin | null;
}

/**
 * Cuando desactivar un módulo falla porque otros activos dependen de él, el servidor devuelve solo los CÓDIGOS
 * (por ejemplo `finance.electronic_invoicing`). Esto los convierte en nombres y deja a mano el módulo, para que la pantalla
 * muestre un enlace que abra directamente la desactivación del que bloquea.
 */
export function resolveBlockingPlugins(codes: string[], myPlugins: OrganizationPlugin[]): BlockingPlugin[] {
  return codes.map((code) => {
    const plugin = myPlugins.find((p) => p.pluginCode === code && p.status === 'active') ?? null;
    const known = myPlugins.find((p) => p.pluginCode === code);
    return { code, name: known?.pluginName || code, plugin };
  });
}
