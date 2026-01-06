import { Router, Request, Response } from 'express';
import { createServerClient, translateDbError } from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { requireRole } from '@/middleware/requireRole.js';
import { createLocationSchema, updateLocationSchema } from '@/validations/location.js';
import { Location } from '@/types/database.js';
import { ZodError } from 'zod';

const router = Router();

/**
 * GET /api/customers/:customerId/locations
 * List all locations for a specific customer
 * TECH role: read-only (allowed)
 * OFFICE/ADMIN: full access (allowed)
 */
router.get(
  '/api/customers/:customerId/locations',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { customerId } = req.params;
      const supabase = createServerClient();
      
      // First verify customer exists
      const { error: customerError } = await supabase
        .from('customers')
        .select('id')
        .eq('id', customerId)
        .single();
      
      if (customerError) {
        if (customerError.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Customer not found')
          );
          return;
        }
        const apiError = translateDbError(customerError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }
      
      // Get all locations for this customer
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });
      
      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }
      
      res.json(successResponse(data ?? []));
    } catch (error) {
      console.error('Error listing locations:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to list locations')
      );
    }
  }
);

/**
 * POST /api/customers/:customerId/locations
 * Create a new location for a customer
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.post(
  '/api/customers/:customerId/locations',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { customerId } = req.params;
      
      // Validate request body
      const validatedData = createLocationSchema.parse(req.body);
      
      const supabase = createServerClient();
      
      // Verify customer exists
      const { error: customerError } = await supabase
        .from('customers')
        .select('id')
        .eq('id', customerId)
        .single();
      
      if (customerError) {
        if (customerError.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Customer not found')
          );
          return;
        }
        const apiError = translateDbError(customerError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }
      
      // Insert location
      const { data, error } = await supabase
        .from('locations')
        .insert({
          ...validatedData,
          customer_id: customerId,
        })
        .select()
        .single<Location>();
      
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
      console.error('Error creating location:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create location')
      );
    }
  }
);

/**
 * GET /api/locations/:id
 * Get a single location by ID
 * TECH role: read-only (allowed)
 * OFFICE/ADMIN: full access (allowed)
 */
router.get(
  '/api/locations/:id',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();
      
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .eq('id', id)
        .single<Location>();
      
      if (error) {
        if (error.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Location not found')
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
      console.error('Error fetching location:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch location')
      );
    }
  }
);

/**
 * PATCH /api/locations/:id
 * Update a location
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.patch(
  '/api/locations/:id',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      
      // Validate request body
      const validatedData = updateLocationSchema.parse(req.body);
      
      // Ensure at least one field is being updated
      if (Object.keys(validatedData).length === 0) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'At least one field must be provided for update')
        );
        return;
      }
      
      const supabase = createServerClient();
      
      // Update location
      const { data, error } = await supabase
        .from('locations')
        .update(validatedData)
        .eq('id', id)
        .select()
        .single<Location>();
      
      if (error) {
        if (error.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Location not found')
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
      console.error('Error updating location:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update location')
      );
    }
  }
);

export default router;
