import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

const api = vi.hoisted(() => ({
  image: vi.fn(),
  adminImage: vi.fn(),
  requestPresigned: vi.fn(),
  confirm: vi.fn(),
  getUrl: vi.fn(),
}));
vi.mock('@/api/feedback', () => ({ feedbackApi: { image: api.image, adminImage: api.adminImage } }));
vi.mock('@/api/files', () => ({ fileApi: { requestPresigned: api.requestPresigned, confirm: api.confirm, getUrl: api.getUrl } }));

import { clearFileUrls } from '@/composable/useFileUrl';
import { docHasContent, FeedbackImageError, feedbackImageResolver, uploadFeedbackImage } from './useFeedbackImages';

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await nextTick();
};

beforeEach(() => {
  vi.clearAllMocks();
  clearFileUrls();
  let n = 0;
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => `blob:captura-${++n}`, revokeObjectURL: () => undefined }));
});

describe('capturas del buzón: de dónde sale la imagen', () => {
  it('el dueño las pide por su ruta y se pintan con un enlace blob (la captura es de otra empresa)', async () => {
    api.adminImage.mockResolvedValue(new Blob(['png']));
    const r = feedbackImageResolver('platform', 'item-1');
    expect(r.url('doc-1')).toBeUndefined();
    await flush();
    expect(api.adminImage).toHaveBeenCalledWith('item-1', 'doc-1');
    expect(r.url('doc-1')).toMatch(/^blob:/);
    // Ya en caché: no se vuelve a pedir.
    r.url('doc-1');
    expect(api.adminImage).toHaveBeenCalledTimes(1);
  });

  it('la persona, por la suya; una captura recién pegada (aún sin guardar) usa el enlace de document-service', async () => {
    api.image.mockRejectedValue(new Error('404'));
    api.getUrl.mockResolvedValue({ url: 'https://minio/firmada', originalName: 'a.png', mimeType: 'image/png' });
    const r = feedbackImageResolver('author', 'item-1');
    r.url('doc-2');
    await flush();
    expect(api.image).toHaveBeenCalledWith('item-1', 'doc-2');
    r.url('doc-2');
    await flush();
    expect(r.url('doc-2')).toBe('https://minio/firmada');
  });
});

describe('subir una captura', () => {
  it('sube a document-service como `feedback` del envío y devuelve su id', async () => {
    api.requestPresigned.mockResolvedValue({ fileId: 'f-1', presignedUrl: 'https://minio/put', expiresIn: 600 });
    api.confirm.mockResolvedValue({ id: 'f-1', status: 'confirmed' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const id = await uploadFeedbackImage(new File([new Uint8Array([1, 2, 3])], 'captura.png', { type: 'image/png' }), 'item-1');
    expect(id).toBe('f-1');
    expect(api.requestPresigned).toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'feedback', resourceId: 'item-1', mimeType: 'image/png', size: 3 }));
    expect(api.confirm).toHaveBeenCalledWith('f-1', expect.stringMatching(/^[0-9a-f]{64}$/));
  });

  it('rechaza lo que no es imagen de mapa de bits (SVG, PDF) y lo que pasa de 10 MB, sin subir nada', async () => {
    await expect(uploadFeedbackImage(new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' }), 'i')).rejects.toBeInstanceOf(FeedbackImageError);
    await expect(uploadFeedbackImage(new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }), 'i')).rejects.toMatchObject({ reason: 'type' });
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
    await expect(uploadFeedbackImage(big, 'i')).rejects.toMatchObject({ reason: 'size' });
    expect(api.requestPresigned).not.toHaveBeenCalled();
  });
});

describe('¿hay algo que mandar?', () => {
  const p = (text?: string) => ({ type: 'paragraph', content: text === undefined ? undefined : [{ type: 'text', text }] });
  it('texto con algo más que espacios, o una captura sola; vacío o solo espacios, no', () => {
    expect(docHasContent({ type: 'doc', content: [p('hola')] })).toBe(true);
    expect(docHasContent({ type: 'doc', content: [p(), { type: 'image', attrs: { documentId: 'x' } }] })).toBe(true);
    expect(docHasContent({ type: 'doc', content: [p('   '), p()] })).toBe(false);
    expect(docHasContent(null)).toBe(false);
  });
});
