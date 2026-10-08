import type { CatalogPlugin, OrganizationPlugin } from '@/types/plugins';

/**
 * Qué módulos ACTIVOS de la organización necesitan a `plugin` (los que le impiden desactivarlo). Se sacan del catálogo
 * (`depends_on` de cada módulo) y no de `requiredByPluginId`, que guarda solo el módulo que lo activó la primera vez:
 * si luego otro también lo necesita, ese dato se queda corto. Si el catálogo aún no cargó, se usa ese dato como respaldo.
 * Lo incluido en la plataforma no cuenta: no se puede apagar, así que nunca es lo que impide desactivar. Devuelve códigos de módulo, en el orden en que aparecen en «Mis plugins».
 */
export function dependentCodesOf(
  plugin: OrganizationPlugin,
  myPlugins: OrganizationPlugin[],
  catalog: CatalogPlugin[],
): string[] {
  if (!plugin.pluginCode) return [];
  const dependsOn = new Map(catalog.map((c) => [c.code, c.depends_on.map((d) => d.code)]));
  const found = myPlugins
    .filter((p) => p.status === 'active' && p.activationSource !== 'included' && p.pluginCode && p.pluginCode !== plugin.pluginCode)
    .filter((p) => dependsOn.get(p.pluginCode as string)?.includes(plugin.pluginCode as string))
    .map((p) => p.pluginCode as string);
  if (found.length) return found;

  const requiredBy = myPlugins.find((p) => p.pluginId === plugin.requiredByPluginId && p.status === 'active');
  return requiredBy?.pluginCode ? [requiredBy.pluginCode] : [];
}
