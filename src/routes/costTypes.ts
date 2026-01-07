import { Router, Request, Response } from 'express';
import { createServerClient, translateDbError } from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { requireRole } from '@/middleware/requireRole.js';
import { createCostTypeSchema, updateCostTypeSchema } from '@/validations/costType.js';
import { CostType, CostCode } from '@/types/database.js';
import { ZodError } from 'zod';

const router = Router();

/**
 * Cost type with nested cost codes
 */
interface CostTypeWithCodes extends CostType {
  cost_codes: CostCode[];
}

/**
 * GET /api/cost-types
 * List cost types with filters
 * TECH role: read-only (allowed)
 * OFFICE: read-only (allowed)
 * ADMIN: full access (allowed)
 */
router.get(
  '/api/cost-types',
  requireAuth,
  requireEmployee,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const supabase = createServerClient();
      
      // Build query
      const query = supabase
        .from('cost_types')
        .select('*')
        .order('sort_order', { ascending: true });
      
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
      console.error('Error listing cost types:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to list cost types')
      );
    }
  }
);

/**
 * POST /api/cost-types
 * Create a new cost type
 * TECH role: not allowed (403)
 * OFFICE: not allowed (403)
 * ADMIN: allowed
 */
router.post(
  '/api/cost-types',
  requireAuth,
  requireEmployee,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body
      const validatedData = createCostTypeSchema.parse(req.body);
      
      const supabase = createServerClient();
      
      // Insert cost type
      const { data, error } = await supabase
        .from('cost_types')
        .insert(validatedData)
        .select()
        .single<CostType>();
      
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
      console.error('Error creating cost type:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create cost type')
      );
    }
  }
);

/**
 * GET /api/cost-types/:id
 * Get a single cost type by ID (includes nested cost codes)
 * TECH role: read-only (allowed)
 * OFFICE: read-only (allowed)
 * ADMIN: full access (allowed)
 */
router.get(
  '/api/cost-types/:id',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();
      
      // Fetch cost type with nested cost codes
      const { data, error } = await supabase
        .from('cost_types')
        .select(`
          *,
          cost_codes (*)
        `)
        .eq('id', id)
        .single<CostTypeWithCodes>();
      
      if (error) {
        if (error.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Cost type not found')
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
      console.error('Error fetching cost type:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch cost type')
      );
    }
  }
);

/**
 * PATCH /api/cost-types/:id
 * Update a cost type
 * TECH role: not allowed (403)
 * OFFICE: not allowed (403)
 * ADMIN: allowed
 */
router.patch(
  '/api/cost-types/:id',
  requireAuth,
  requireEmployee,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      
      // Validate request body
      const validatedData = updateCostTypeSchema.parse(req.body);
      
      // Ensure at least one field is being updated
      if (Object.keys(validatedData).length === 0) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'At least one field must be provided for update')
        );
        return;
      }
      
      const supabase = createServerClient();
      
      // Update cost type
      const { data, error } = await supabase
        .from('cost_types')
        .update(validatedData)
        .eq('id', id)
        .select()
        .single<CostType>();
      
      if (error) {
        if (error.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Cost type not found')
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
      console.error('Error updating cost type:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update cost type')
      );
    }
  }
);

/**
 * DELETE /api/cost-types/:id
 * Delete a cost type (actual delete, not soft delete since table has no is_active)
 * TECH role: not allowed (403)
 * OFFICE: not allowed (403)
 * ADMIN: allowed
 */
router.delete(
  '/api/cost-types/:id',
  requireAuth,
  requireEmployee,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();
      
      // Delete cost type
      const { data, error } = await supabase
        .from('cost_types')
        .delete()
        .eq('id', id)
        .select()
        .single<CostType>();
      
      if (error) {
        if (error.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Cost type not found')
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
      console.error('Error deleting cost type:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to delete cost type')
      );
    }
  }
);

export default router;
