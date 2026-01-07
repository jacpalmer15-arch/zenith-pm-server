import { Router, Request, Response } from 'express';
import { createServerClient, translateDbError } from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { requireRole } from '@/middleware/requireRole.js';
import { createCostCodeSchema, updateCostCodeSchema } from '@/validations/costCode.js';
import { CostCode } from '@/types/database.js';
import { ZodError } from 'zod';

const router = Router();

/**
 * GET /api/cost-codes
 * List cost codes with filters
 * TECH role: read-only (allowed)
 * OFFICE: read-only (allowed)
 * ADMIN: full access (allowed)
 */
router.get(
  '/api/cost-codes',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supabase = createServerClient();
      
      // Parse filter params
      const costTypeId = typeof req.query.cost_type_id === 'string' ? req.query.cost_type_id : undefined;
      
      // Build query
      let query = supabase
        .from('cost_codes')
        .select('*')
        .order('sort_order', { ascending: true });
      
      // Apply cost_type_id filter
      if (costTypeId) {
        query = query.eq('cost_type_id', costTypeId);
      }
      
      const { data, error } = await query;
      
      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }
      
      res.json(successResponse(data ?? []));
    } catch (error) {
      console.error('Error listing cost codes:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to list cost codes')
      );
    }
  }
);

/**
 * POST /api/cost-codes
 * Create a new cost code
 * TECH role: not allowed (403)
 * OFFICE: not allowed (403)
 * ADMIN: allowed
 */
router.post(
  '/api/cost-codes',
  requireAuth,
  requireEmployee,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body
      const validatedData = createCostCodeSchema.parse(req.body);
      
      const supabase = createServerClient();
      
      // Insert cost code
      const { data, error } = await supabase
        .from('cost_codes')
        .insert(validatedData)
        .select()
        .single<CostCode>();
      
      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }
      
      res.status(201).json(successResponse(data));
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Invalid request data', error.issues)
        );
        return;
      }
      console.error('Error creating cost code:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create cost code')
      );
    }
  }
);

/**
 * GET /api/cost-codes/:id
 * Get a single cost code by ID
 * TECH role: read-only (allowed)
 * OFFICE: read-only (allowed)
 * ADMIN: full access (allowed)
 */
router.get(
  '/api/cost-codes/:id',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();
      
      const { data, error } = await supabase
        .from('cost_codes')
        .select('*')
        .eq('id', id)
        .single<CostCode>();
      
      if (error) {
        if (error.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Cost code not found')
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
      console.error('Error fetching cost code:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch cost code')
      );
    }
  }
);

/**
 * PATCH /api/cost-codes/:id
 * Update a cost code
 * TECH role: not allowed (403)
 * OFFICE: not allowed (403)
 * ADMIN: allowed
 */
router.patch(
  '/api/cost-codes/:id',
  requireAuth,
  requireEmployee,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      
      // Validate request body
      const validatedData = updateCostCodeSchema.parse(req.body);
      
      // Ensure at least one field is being updated
      if (Object.keys(validatedData).length === 0) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'At least one field must be provided for update')
        );
        return;
      }
      
      const supabase = createServerClient();
      
      // Update cost code
      const { data, error } = await supabase
        .from('cost_codes')
        .update(validatedData)
        .eq('id', id)
        .select()
        .single<CostCode>();
      
      if (error) {
        if (error.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Cost code not found')
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
      if (error instanceof ZodError) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Invalid request data', error.issues)
        );
        return;
      }
      console.error('Error updating cost code:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update cost code')
      );
    }
  }
);

/**
 * DELETE /api/cost-codes/:id
 * Delete a cost code (actual delete, not soft delete since table has no is_active)
 * TECH role: not allowed (403)
 * OFFICE: not allowed (403)
 * ADMIN: allowed
 */
router.delete(
  '/api/cost-codes/:id',
  requireAuth,
  requireEmployee,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();
      
      // Delete cost code
      const { data, error } = await supabase
        .from('cost_codes')
        .delete()
        .eq('id', id)
        .select()
        .single<CostCode>();
      
      if (error) {
        if (error.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Cost code not found')
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
      console.error('Error deleting cost code:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to delete cost code')
      );
    }
  }
);

export default router;
