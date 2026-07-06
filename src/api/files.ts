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

  getDownloadBlob: async (fileId: string): Promise<Blob> => {
    const r = await http.get(`/files/${fileId}/download`, { responseType: 'blob' });
    return r.data as Blob;
  },
};
