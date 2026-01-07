import { Router, Request, Response } from 'express';
import { createServerClient, translateDbError } from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { requireRole } from '@/middleware/requireRole.js';
import { createTaxRuleSchema, updateTaxRuleSchema } from '@/validations/taxRule.js';
import { TaxRule, Settings } from '@/types/database.js';
import { ZodError } from 'zod';

const router = Router();

/**
 * GET /api/tax-rules
 * List tax rules with filters
 * TECH role: read-only (allowed)
 * OFFICE: read-only (allowed)
 * ADMIN: full access (allowed)
 */
router.get(
  '/api/tax-rules',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supabase = createServerClient();
      
      // Parse filter params
      const isActive = req.query.is_active === 'true' ? true : req.query.is_active === 'false' ? false : undefined;
      
      // Build query
      let query = supabase
        .from('tax_rules')
        .select('*')
        .order('name', { ascending: true });
      
      // Apply is_active filter
      if (isActive !== undefined) {
        query = query.eq('is_active', isActive);
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
      console.error('Error listing tax rules:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to list tax rules')
      );
    }
  }
);

/**
 * POST /api/tax-rules
 * Create a new tax rule
 * TECH role: not allowed (403)
 * OFFICE: not allowed (403)
 * ADMIN: allowed
 */
router.post(
  '/api/tax-rules',
  requireAuth,
  requireEmployee,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body
      const validatedData = createTaxRuleSchema.parse(req.body);
      
      const supabase = createServerClient();
      const userId = req.auth?.userId;
      
      // Insert tax rule with creator info
      const { data, error } = await supabase
        .from('tax_rules')
        .insert({
          ...validatedData,
          created_by: userId,
        })
        .select()
        .single<TaxRule>();
      
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
      console.error('Error creating tax rule:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create tax rule')
      );
    }
  }
);

/**
 * GET /api/tax-rules/:id
 * Get a single tax rule by ID
 * TECH role: read-only (allowed)
 * OFFICE: read-only (allowed)
 * ADMIN: full access (allowed)
 */
router.get(
  '/api/tax-rules/:id',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();
      
      const { data, error } = await supabase
        .from('tax_rules')
        .select('*')
        .eq('id', id)
        .single<TaxRule>();
      
      if (error) {
        if (error.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Tax rule not found')
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
      console.error('Error fetching tax rule:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch tax rule')
      );
    }
  }
);

/**
 * PATCH /api/tax-rules/:id
 * Update a tax rule
 * TECH role: not allowed (403)
 * OFFICE: not allowed (403)
 * ADMIN: allowed
 */
router.patch(
  '/api/tax-rules/:id',
  requireAuth,
  requireEmployee,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      
      // Validate request body
      const validatedData = updateTaxRuleSchema.parse(req.body);
      
      // Ensure at least one field is being updated
      if (Object.keys(validatedData).length === 0) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'At least one field must be provided for update')
        );
        return;
      }
      
      const supabase = createServerClient();
      const userId = req.auth?.userId;
      
      // Update tax rule with updater info
      const { data, error } = await supabase
        .from('tax_rules')
        .update({
          ...validatedData,
          updated_by: userId,
        })
        .eq('id', id)
        .select()
        .single<TaxRule>();
      
      if (error) {
        if (error.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Tax rule not found')
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
      console.error('Error updating tax rule:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update tax rule')
      );
    }
  }
);

/**
 * POST /api/tax-rules/:id/set-default
 * Set a tax rule as the default (updates settings.default_tax_rule_id)
 * TECH role: not allowed (403)
 * OFFICE: not allowed (403)
 * ADMIN: allowed
 */
router.post(
  '/api/tax-rules/:id/set-default',
  requireAuth,
  requireEmployee,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();
      
      // First verify the tax rule exists and is active
      const { data: taxRule, error: fetchError } = await supabase
        .from('tax_rules')
        .select('id, is_active')
        .eq('id', id)
        .single<Pick<TaxRule, 'id' | 'is_active'>>();
      
      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Tax rule not found')
          );
          return;
        }
        const apiError = translateDbError(fetchError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }
      
      if (!taxRule.is_active) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Cannot set an inactive tax rule as default')
        );
        return;
      }
      
      // Update settings table to set this as default tax rule
      // Settings is a single-row table, fetch it first to ensure it exists
      const { data: existingSettings, error: settingsFetchError } = await supabase
        .from('settings')
        .select('id')
        .single<Pick<Settings, 'id'>>();
      
      if (settingsFetchError) {
        const apiError = translateDbError(settingsFetchError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }
      
      const { error } = await supabase
        .from('settings')
        .update({ default_tax_rule_id: id })
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
      
      res.json(successResponse({ 
        id: taxRule.id,
        is_default: true,
        message: 'Tax rule set as default' 
      }));
    } catch (error) {
      console.error('Error setting default tax rule:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to set default tax rule')
      );
    }
  }
);

/**
 * DELETE /api/tax-rules/:id
 * Soft delete a tax rule (set is_active = false)
 * TECH role: not allowed (403)
 * OFFICE: not allowed (403)
 * ADMIN: allowed
 */
router.delete(
  '/api/tax-rules/:id',
  requireAuth,
  requireEmployee,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();
      
      // Soft delete by setting is_active = false
      const { data, error } = await supabase
        .from('tax_rules')
        .update({ is_active: false })
        .eq('id', id)
        .select()
        .single<TaxRule>();
      
      if (error) {
        if (error.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Tax rule not found')
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
      console.error('Error deleting tax rule:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to delete tax rule')
      );
    }
  }
);

export default router;
