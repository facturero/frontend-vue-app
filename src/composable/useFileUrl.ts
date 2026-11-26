import { reactive, type InjectionKey } from 'vue';
import { fileApi } from '@/api/files';

/**
 * Enlaces a archivos de document-service para <img src> y descargas.
 *
 * Antes la interfaz ponía `${API}/files/:id/download` directamente en el src:
 * funcionaba porque esa ruta era pública, y por eso cualquiera con el id bajaba
 * cualquier archivo, también de otra empresa (FACTURACION-BRECHAS.md, N13). Ahora
 * la descarga exige sesión y organización, y un <img> no puede mandar el token.
 * Se pide el enlace firmado del almacenamiento con el token
 * (`GET /files/:id/url`) y ese enlace, que no necesita cabeceras, va al src.
 *
 * `fileUrl(id)` devuelve `undefined` la primera vez y dispara la petición; como
 * la caché es reactiva, la plantilla se vuelve a pintar sola cuando llega.
 */

/** El enlace firmado dura 1 h (document-service); se renueva antes. */
const TTL_MS = 50 * 60_000;
/** Si falla (sin permiso, borrado), no se reintenta en cada render. */
const FAILURE_BACKOFF_MS = 60_000;

interface Entry {
  url: string | null;
  at: number;
}

const cache = reactive(new Map<string, Entry>());
const inFlight = new Map<string, Promise<string | null>>();

function fresh(entry: Entry | undefined): boolean {
  if (!entry) return false;
  const age = Date.now() - entry.at;
  return entry.url ? age < TTL_MS : age < FAILURE_BACKOFF_MS;
}

/** El enlace, esperando si hace falta. Para descargas y para quien necesite el valor ya. */
export function resolveFileUrl(fileId: string): Promise<string | null> {
  const cached = cache.get(fileId);
  if (fresh(cached)) return Promise.resolve(cached!.url);

  let request = inFlight.get(fileId);
  if (!request) {
    request = fileApi
      .getUrl(fileId)
      .then((r) => r.url)
      .catch(() => null)
      .then((url) => {
        cache.set(fileId, { url, at: Date.now() });
        inFlight.delete(fileId);
        return url;
      });
    inFlight.set(fileId, request);
  }
  return request;
}

/** Para plantillas: el enlace si ya se tiene; si no, lo pide y devuelve undefined mientras tanto. */
export function fileUrl(fileId: string | null | undefined): string | undefined {
  if (!fileId) return undefined;
  const cached = cache.get(fileId);
  if (fresh(cached)) return cached!.url ?? undefined;
  void resolveFileUrl(fileId);
  return cached?.url ?? undefined;
}

const clearHooks = new Set<() => void>();

/** Otras cachés de archivos (las capturas del buzón) se vacían junto con esta al cerrar sesión. */
export function onFileUrlsCleared(hook: () => void): void {
  clearHooks.add(hook);
}

/** Al cerrar sesión: los enlaces eran de esa sesión y esa organización. */
export function clearFileUrls(): void {
  cache.clear();
  inFlight.clear();
  clearHooks.forEach((hook) => hook());
}

/** Abre un archivo en otra pestaña. La ventana se abre antes de pedir el enlace para que el navegador no la bloquee. */
export async function openFile(fileId: string): Promise<void> {
  const tab = window.open('', '_blank');
  const url = await resolveFileUrl(fileId);
  if (!tab) return;
  if (url) tab.location.href = url;
  else tab.close();
}

/**
 * De dónde saca `RichImage` el enlace de una imagen. Por defecto, de document-service (arriba): sirve cuando quien mira es de la
 * empresa del archivo. Quien muestre imágenes de OTRA empresa (el buzón de comentarios: el dueño de la plataforma ve las capturas de
 * cualquier empresa) provee otro con `provide(FILE_URL_RESOLVER, …)` y las sirve por su servicio.
 */
export interface FileUrlResolver {
  url(fileId: string): string | undefined;
  open(fileId: string): Promise<void>;
}

export const FILE_URL_RESOLVER: InjectionKey<FileUrlResolver> = Symbol('FileUrlResolver');
export const defaultFileUrlResolver: FileUrlResolver = { url: fileUrl, open: openFile };
