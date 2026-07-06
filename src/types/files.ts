export interface PresignedUploadRequest {
  resourceType: string;
  resourceId: string;
  category: string;
  originalName: string;
  mimeType: string;
  size: number;
  description?: string;
}

export interface PresignedUploadResponse {
  fileId: string;
  presignedUrl: string;
  fields?: Record<string, string>;
  expiresIn: number;
}

export interface FileResponse {
  id: string;
  resourceType: string;
  resourceId: string;
  category: string;
  originalName: string;
  mimeType: string;
  size: number;
  checksum: string | null;
  status: string;
  description: string | null;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FileListResponse {
  files: FileResponse[];
  total: number;
}
