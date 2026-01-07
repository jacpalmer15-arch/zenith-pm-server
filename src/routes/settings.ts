import { Router, Request, Response } from 'express';
import { createServerClient, translateDbError } from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { requireRole } from '@/middleware/requireRole.js';
import { updateSettingsSchema } from '@/validations/setting.js';
import { Settings } from '@/types/database.js';
import { ZodError } from 'zod';

const router = Router();

/**
 * GET /api/settings
 * Get all settings (single-row configuration table)
 * TECH role: not allowed (403)
 * OFFICE: read-only (allowed)
 * ADMIN: full access (allowed)
 */
router.get(
  '/api/settings',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const supabase = createServerClient();
      
      // Settings is a single-row table
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .single<Settings>();
      
      if (error) {
        if (error.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Settings not found')
          );
          return;
        }
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }
      
      res.json(successResponse(data));
    } catch (error) {
      console.error('Error fetching settings:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch settings')
      );
    }
  }
);

/**
 * PATCH /api/settings
 * Update settings (single-row configuration table)
 * TECH role: not allowed (403)
 * OFFICE: not allowed (403)
 * ADMIN: allowed
 */
router.patch(
  '/api/settings',
  requireAuth,
  requireEmployee,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body
      const validatedData = updateSettingsSchema.parse(req.body);
      
      // Ensure at least one field is being updated
      if (Object.keys(validatedData).length === 0) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'At least one field must be provided for update')
        );
        return;
      }
      
      const supabase = createServerClient();
      const userId = req.auth?.userId;
      
      // Update settings with updater info
      // Since this is a single-row table, we update without a WHERE clause
      // or we can use the first row
      const { data: existingSettings, error: fetchError } = await supabase
        .from('settings')
        .select('id')
        .single<Pick<Settings, 'id'>>();
      
      if (fetchError) {
        const apiError = translateDbError(fetchError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }
      
      const { data, error } = await supabase
        .from('settings')
        .update({
          ...validatedData,
          updated_by: userId,
        })
        .eq('id', existingSettings.id)
        .select()
        .single<Settings>();
      
      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }
      
      res.json(successResponse(data));
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Invalid request data', error.issues)
        );
        return;
      }
      console.error('Error updating settings:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update settings')
      );
    }
  }
);

export default router;
