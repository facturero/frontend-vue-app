import { http } from '@/utils/http';
import type { FileListResponse, PresignedUploadRequest, PresignedUploadResponse } from '@/types/files';

export const fileApi = {
  requestPresigned: (body: PresignedUploadRequest) =>
    http.post<PresignedUploadResponse>('/files/presigned', body).then((r) => r.data),

  confirm: (fileId: string, checksum: string) =>
    http.patch<{ id: string; status: string }>(`/files/${fileId}/confirm`, { checksum }).then((r) => r.data),

  listByResource: (resourceType: string, resourceId: string, category?: string) =>
    http
      .get<FileListResponse>('/files', { params: { resourceType, resourceId, category } })
      .then((r) => r.data),

  /**
   * Enlace firmado y temporal al archivo. Exige sesión y que el archivo sea de
   * la organización; el enlace resultante no necesita cabeceras (sirve en <img>).
   * Ver composable/useFileUrl.ts.
   */
  getUrl: (fileId: string) =>
    http
      .get<{ url: string; originalName: string; mimeType: string }>(`/files/${fileId}/url`)
      .then((r) => r.data),

  /** Los bytes del archivo, pasando por el enlace firmado. */
  getDownloadBlob: async (fileId: string): Promise<Blob> => {
    const { url } = await fileApi.getUrl(fileId);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`No se pudo descargar el archivo (${response.status})`);
    return response.blob();
  },
};
