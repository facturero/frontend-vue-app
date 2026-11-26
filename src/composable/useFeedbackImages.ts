import { reactive } from 'vue';
import { feedbackApi } from '@/api/feedback';
import { fileApi } from '@/api/files';
import { fileUrl, onFileUrlsCleared, resolveFileUrl, type FileUrlResolver } from '@/composable/useFileUrl';
import type { RichDoc } from '@/types/projects';

/**
 * Capturas del buzón de comentarios (feedback-service) en el visor de imágenes de Proyectos (`RichImage`).
 *
 * Por qué no el enlace de document-service: el archivo vive en la empresa de quien lo subió, y la otra punta de la conversación es de
 * otra empresa (el dueño de la plataforma mira las de todas; la persona ve las que le manda el dueño). document-service no se lo daría.
 * feedback-service comprueba que la captura es de esa conversación y entrega los bytes; aquí se piden con la sesión y se pintan con un
 * enlace `blob:` (un <img> no puede mandar el token).
 *
 * Una captura recién pegada en el editor todavía no está guardada en la conversación (feedback-service respondería 404): esa es
 * siempre de quien la pegó, de su empresa, así que se usa el enlace de document-service como hasta ahora (`markLocal` al subirla; si
 * no se marcó, el 404 lleva al mismo sitio).
 */
type Entry = { url: string | null; fallback: boolean };

const cache = reactive(new Map<string, Entry>());
const inFlight = new Set<string>();

onFileUrlsCleared(() => {
  for (const e of cache.values()) if (e.url) URL.revokeObjectURL(e.url);
  cache.clear();
  inFlight.clear();
});

function load(key: string, fetchBlob: () => Promise<Blob>): void {
  if (inFlight.has(key)) return;
  inFlight.add(key);
  fetchBlob()
    .then((blob) => cache.set(key, { url: URL.createObjectURL(blob), fallback: false }))
    .catch(() => cache.set(key, { url: null, fallback: true }))
    .finally(() => inFlight.delete(key));
}

/** El origen de las imágenes de UNA conversación, visto desde un lado (`author`, la persona; `platform`, el dueño). */
export function feedbackImageResolver(mode: 'author' | 'platform', itemId: string): FileUrlResolver & { markLocal(id: string): void } {
  const keyOf = (id: string) => `${mode}:${itemId}:${id}`;
  const fetchBlob = (id: string) => (mode === 'platform' ? feedbackApi.adminImage(itemId, id) : feedbackApi.image(itemId, id));

  function url(id: string): string | undefined {
    const key = keyOf(id);
    const entry = cache.get(key);
    if (!entry) {
      load(key, () => fetchBlob(id));
      return undefined;
    }
    return entry.fallback ? fileUrl(id) : entry.url ?? undefined;
  }

  async function open(id: string): Promise<void> {
    // La ventana se abre antes de esperar nada: si no, el navegador la bloquea por no venir directo del clic.
    const tab = window.open('', '_blank');
    let href = url(id) ?? null;
    if (!href) {
      href = await fetchBlob(id)
        .then((blob) => URL.createObjectURL(blob))
        .catch(() => resolveFileUrl(id));
    }
    if (!tab) return;
    if (href) tab.location.href = href;
    else tab.close();
  }

  /** Una captura que acaba de subir quien mira: se ve desde document-service, sin pedirla antes a feedback-service. */
  function markLocal(id: string): void {
    cache.set(keyOf(id), { url: null, fallback: true });
  }

  return { url, open, markLocal };
}

/** ¿Hay algo que mandar? Texto que no sea solo espacios, o una captura (una respuesta puede ser solo la imagen). */
export function docHasContent(node: RichDoc | null | undefined): boolean {
  if (!node) return false;
  if (node.type === 'image') return true;
  if (node.type === 'text') return !!node.text?.trim();
  return (node.content ?? []).some(docHasContent);
}

/** Tipos que acepta el buzón (feedback-service los vuelve a comprobar). Sin SVG: puede llevar código y lo abre otra empresa. */
export const FEEDBACK_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const FEEDBACK_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export class FeedbackImageError extends Error {
  constructor(readonly reason: 'type' | 'size') {
    super(reason);
  }
}

/**
 * Sube una captura a document-service (URL firmada, igual que los adjuntos de Proyectos) y devuelve su id, que va en el documento del
 * editor. `resourceType: 'feedback'` es lo que feedback-service exige al guardar; `resourceId`, el envío (o la persona, si aún no hay).
 */
export async function uploadFeedbackImage(file: File, resourceId: string): Promise<string> {
  if (!FEEDBACK_IMAGE_TYPES.includes(file.type)) throw new FeedbackImageError('type');
  if (file.size > FEEDBACK_IMAGE_MAX_BYTES) throw new FeedbackImageError('size');
  const presigned = await fileApi.requestPresigned({
    resourceType: 'feedback',
    resourceId,
    category: 'screenshot',
    originalName: file.name || 'captura.png',
    mimeType: file.type,
    size: file.size,
  });
  const upload = await fetch(presigned.presignedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
  if (!upload.ok) throw new Error(`HTTP ${upload.status}`);
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  await fileApi.confirm(presigned.fileId, Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join(''));
  return presigned.fileId;
}
