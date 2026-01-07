import { Router, Request, Response } from 'express';
import { createServerClient, translateDbError } from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { requireRole } from '@/middleware/requireRole.js';
import { uploadSingle } from '@/middleware/upload.js';
import { getStorageProvider } from '@/services/storage/index.js';
import { fileUploadSchema, getFileKindFromMimeType } from '@/validations/file.js';
import { File } from '@/types/database.js';
import { ZodError } from 'zod';
import { randomUUID } from 'crypto';

const router = Router();

/**
 * POST /api/files
 * Upload a file with metadata
 * TECH role: limited access based on entity type
 * OFFICE/ADMIN: full access
 */
router.post(
  '/api/files',
  requireAuth,
  requireEmployee,
  uploadSingle,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate that a file was uploaded
      if (!req.file) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'No file uploaded')
        );
        return;
      }

      // Validate request body metadata
      const metadata = fileUploadSchema.parse(req.body);

      // Check role-based permissions
      // TECH can only upload files for projects (read-only) and quotes
      if (req.employee!.role === 'TECH' && metadata.entity_type === 'project') {
        res.status(403).json(
          errorResponse('FORBIDDEN', 'TECH role cannot upload files to projects')
        );
        return;
      }

      const supabase = createServerClient();

      // Verify entity exists based on entity_type
      const entityTable = metadata.entity_type === 'quote' ? 'quotes' :
                          metadata.entity_type === 'project' ? 'projects' :
                          metadata.entity_type === 'customer' ? 'customers' : 'settings';
      
      if (entityTable !== 'settings') {
        const { data: entity, error: entityError } = await supabase
          .from(entityTable)
          .select('id')
          .eq('id', metadata.entity_id)
          .single();

        if (entityError || !entity) {
          res.status(400).json(
            errorResponse('VALIDATION_ERROR', `Invalid entity_id: ${metadata.entity_type} does not exist`)
          );
          return;
        }
      }

      // Generate unique file name
      const fileExt = req.file.originalname.split('.').pop() || '';
      const uniqueFileName = `${randomUUID()}${fileExt ? '.' + fileExt : ''}`;

      // Upload file to storage
      const storage = getStorageProvider();
      const storagePath = await storage.uploadFile(req.file.buffer, uniqueFileName);

      // Determine file_kind from MIME type if not provided
      const fileKind = metadata.file_kind || getFileKindFromMimeType(req.file.mimetype);

      // Create file record in database
      const { data: fileRecord, error: dbError } = await supabase
        .from('files')
        .insert({
          entity_type: metadata.entity_type,
          entity_id: metadata.entity_id,
          file_kind: fileKind,
          storage_path: storagePath,
          mime_type: req.file.mimetype,
          created_by: req.employee!.id,
        })
        .select()
        .single<File>();

      if (dbError) {
        // Clean up uploaded file if database insert fails
        try {
          await storage.deleteFile(storagePath);
        } catch (cleanupError) {
          console.error('Error cleaning up file after failed database insert:', cleanupError);
        }

        const apiError = translateDbError(dbError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      res.status(201).json(
        successResponse({
          ...fileRecord,
          original_name: req.file.originalname,
          size_bytes: req.file.size,
        })
      );
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Invalid request data', error.issues)
        );
        return;
      }
      
      // Handle multer errors
      if (error instanceof Error) {
        if (error.message.includes('Invalid file type')) {
          res.status(400).json(
            errorResponse('VALIDATION_ERROR', error.message)
          );
          return;
        }
        if (error.message.includes('File too large')) {
          res.status(400).json(
            errorResponse('VALIDATION_ERROR', 'File size exceeds maximum allowed size')
          );
          return;
        }
      }

      console.error('Error uploading file:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to upload file')
      );
    }
  }
);

/**
 * GET /api/files/:id
 * Get file metadata by ID
 * TECH role: read-only access
 * OFFICE/ADMIN: full access
 */
router.get(
  '/api/files/:id',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      const { data: fileRecord, error } = await supabase
        .from('files')
        .select('*')
        .eq('id', id)
        .single<File>();

      if (error) {
        if (error.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'File not found')
          );
          return;
        }
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      res.json(successResponse(fileRecord));
    } catch (error) {
      console.error('Error fetching file metadata:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch file metadata')
      );
    }
  }
);

/**
 * GET /api/files/:id/download
 * Download a file or get a presigned URL
 * TECH role: read-only access
 * OFFICE/ADMIN: full access
 */
router.get(
  '/api/files/:id/download',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // Get file metadata
      const { data: fileRecord, error } = await supabase
        .from('files')
        .select('*')
        .eq('id', id)
        .single<File>();

      if (error) {
        if (error.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'File not found')
          );
          return;
        }
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      if (!fileRecord) {
        res.status(404).json(
          errorResponse('NOT_FOUND', 'File not found')
        );
        return;
      }

      // Download file from storage
      const storage = getStorageProvider();
      const fileOrUrl = await storage.downloadFile(fileRecord.storage_path);

      // If it's a string (URL), redirect to it
      if (typeof fileOrUrl === 'string') {
        res.redirect(fileOrUrl);
        return;
      }

      // Otherwise, stream the file
      res.setHeader('Content-Type', fileRecord.mime_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${fileRecord.storage_path}"`);
      
      fileOrUrl.pipe(res);
    } catch (error) {
      console.error('Error downloading file:', error);
      
      if (error instanceof Error && error.message === 'File not found') {
        res.status(404).json(
          errorResponse('NOT_FOUND', 'File not found in storage')
        );
        return;
      }

      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to download file')
      );
    }
  }
);

/**
 * DELETE /api/files/:id
 * Delete a file and its metadata
 * TECH role: limited access based on entity type
 * OFFICE/ADMIN: full access
 */
router.delete(
  '/api/files/:id',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // Get file metadata first
      const { data: fileRecord, error: fetchError } = await supabase
        .from('files')
        .select('*')
        .eq('id', id)
        .single<File>();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'File not found')
          );
          return;
        }
        const apiError = translateDbError(fetchError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      if (!fileRecord) {
        res.status(404).json(
          errorResponse('NOT_FOUND', 'File not found')
        );
        return;
      }

      // Check role-based permissions
      if (req.employee!.role === 'TECH' && fileRecord.entity_type === 'project') {
        res.status(403).json(
          errorResponse('FORBIDDEN', 'TECH role cannot delete project files')
        );
        return;
      }

      // Delete from storage
      const storage = getStorageProvider();
      await storage.deleteFile(fileRecord.storage_path);

      // Delete from database
      const { error: deleteError } = await supabase
        .from('files')
        .delete()
        .eq('id', id);

      if (deleteError) {
        const apiError = translateDbError(deleteError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting file:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to delete file')
      );
    }
  }
);

/**
 * GET /api/projects/:id/files
 * List all files for a project
 * TECH role: read-only access
 * OFFICE/ADMIN: full access
 */
router.get(
  '/api/projects/:id/files',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // Verify project exists
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('id', id)
        .single();

      if (projectError || !project) {
        res.status(404).json(
          errorResponse('NOT_FOUND', 'Project not found')
        );
        return;
      }

      // Get all files for this project
      const { data: files, error } = await supabase
        .from('files')
        .select('*')
        .eq('entity_type', 'project')
        .eq('entity_id', id)
        .order('created_at', { ascending: false });

      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      res.json(successResponse(files ?? []));
    } catch (error) {
      console.error('Error listing project files:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to list project files')
      );
    }
  }
);

/**
 * POST /api/projects/:id/files
 * Upload a file to a project
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.post(
  '/api/projects/:id/files',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  uploadSingle,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Validate that a file was uploaded
      if (!req.file) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'No file uploaded')
        );
        return;
      }

      const supabase = createServerClient();

      // Verify project exists
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('id', id)
        .single();

      if (projectError || !project) {
        res.status(404).json(
          errorResponse('NOT_FOUND', 'Project not found')
        );
        return;
      }

      // Generate unique file name
      const fileExt = req.file.originalname.split('.').pop() || '';
      const uniqueFileName = `${randomUUID()}${fileExt ? '.' + fileExt : ''}`;

      // Upload file to storage
      const storage = getStorageProvider();
      const storagePath = await storage.uploadFile(req.file.buffer, uniqueFileName);

      // Determine file_kind from MIME type
      const fileKind = getFileKindFromMimeType(req.file.mimetype);

      // Create file record in database
      const { data: fileRecord, error: dbError } = await supabase
        .from('files')
        .insert({
          entity_type: 'project',
          entity_id: id,
          file_kind: fileKind,
          storage_path: storagePath,
          mime_type: req.file.mimetype,
          created_by: req.employee!.id,
        })
        .select()
        .single<File>();

      if (dbError) {
        // Clean up uploaded file if database insert fails
        try {
          await storage.deleteFile(storagePath);
        } catch (cleanupError) {
          console.error('Error cleaning up file after failed database insert:', cleanupError);
        }

        const apiError = translateDbError(dbError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      res.status(201).json(
        successResponse({
          ...fileRecord,
          original_name: req.file.originalname,
          size_bytes: req.file.size,
        })
      );
    } catch (error) {
      // Handle multer errors
      if (error instanceof Error) {
        if (error.message.includes('Invalid file type')) {
          res.status(400).json(
            errorResponse('VALIDATION_ERROR', error.message)
          );
          return;
        }
        if (error.message.includes('File too large')) {
          res.status(400).json(
            errorResponse('VALIDATION_ERROR', 'File size exceeds maximum allowed size')
          );
          return;
        }
      }

      console.error('Error uploading file to project:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to upload file to project')
      );
    }
  }
);

/**
 * GET /api/work-orders/:id/files
 * List all files for a work order
 * This is a placeholder - work orders don't have direct file relationships in current schema
 * but the endpoint is included for future use
 */
router.get(
  '/api/work-orders/:id/files',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // Verify work order exists
      const { data: workOrder, error: workOrderError } = await supabase
        .from('work_orders')
        .select('id')
        .eq('id', id)
        .single();

      if (workOrderError || !workOrder) {
        res.status(404).json(
          errorResponse('NOT_FOUND', 'Work order not found')
        );
        return;
      }

      // Work orders don't have direct file entity type in current schema
      // Return empty array for now
      res.json(successResponse([]));
    } catch (error) {
      console.error('Error listing work order files:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to list work order files')
      );
    }
  }
);

/**
 * GET /api/invoices/:id/files
 * List all files for an invoice
 * This is a placeholder - invoices don't have direct file relationships in current schema
 * but the endpoint is included for future use
 */
router.get(
  '/api/invoices/:id/files',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // Verify invoice exists
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('id')
        .eq('id', id)
        .single();

      if (invoiceError || !invoice) {
        res.status(404).json(
          errorResponse('NOT_FOUND', 'Invoice not found')
        );
        return;
      }

      // Invoices don't have direct file entity type in current schema
      // Return empty array for now
      res.json(successResponse([]));
    } catch (error) {
      console.error('Error listing invoice files:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to list invoice files')
      );
    }
  }
);

export default router;
