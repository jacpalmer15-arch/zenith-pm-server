import { z } from 'zod';

// Allowed MIME types for file uploads
export const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  // PDFs
  'application/pdf',
  // Documents
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Text
  'text/plain',
  'text/csv',
] as const;

// File entity types (from database enum)
export const FILE_ENTITY_TYPES = ['settings', 'customer', 'project', 'quote'] as const;

// File kinds (from database enum)
export const FILE_KINDS = ['photo', 'pdf', 'logo', 'other'] as const;

export type FileEntityType = (typeof FILE_ENTITY_TYPES)[number];
export type FileKind = (typeof FILE_KINDS)[number];

// Validation schema for file upload metadata
export const fileUploadSchema = z.object({
  entity_type: z.enum(FILE_ENTITY_TYPES),
  entity_id: z.string().uuid(),
  file_kind: z.enum(FILE_KINDS).optional().default('other'),
});

// Validation schema for file filtering
export const fileQuerySchema = z.object({
  entity_type: z.enum(FILE_ENTITY_TYPES).optional(),
  entity_id: z.string().uuid().optional(),
  file_kind: z.enum(FILE_KINDS).optional(),
});

// Helper function to validate MIME type
export function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mimeType as (typeof ALLOWED_MIME_TYPES)[number]);
}

// Helper function to get file kind from MIME type
export function getFileKindFromMimeType(mimeType: string): FileKind {
  if (mimeType.startsWith('image/')) {
    return 'photo';
  }
  if (mimeType === 'application/pdf') {
    return 'pdf';
  }
  return 'other';
}
