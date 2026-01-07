import { Router, Request, Response } from 'express';
import { createServerClient, parsePagination, parseSort, translateDbError } from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { requireRole } from '@/middleware/requireRole.js';
import { createPartSchema, updatePartSchema } from '@/validations/part.js';
import { Part } from '@/types/database.js';
import { ZodError } from 'zod';

const router = Router();

/**
 * GET /api/parts
 * List parts with pagination, search, and filters
 * TECH role: read-only (allowed)
 * OFFICE/ADMIN: full access (allowed)
 */
router.get(
  '/api/parts',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supabase = createServerClient();
      
      // Parse pagination params
      const pagination = parsePagination(req.query);
      
      // Parse sort params
      const sort = parseSort(
        req.query,
        ['name', 'sku', 'sell_price', 'avg_cost', 'created_at', 'updated_at'],
        'created_at',
        'desc'
      );
      
      // Parse search param
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      
      // Parse filter params
      const categoryId = typeof req.query.category_id === 'string' ? req.query.category_id : undefined;
      const isActive = req.query.is_active === 'true' ? true : req.query.is_active === 'false' ? false : undefined;
      
      // Build query
      let query = supabase
        .from('parts')
        .select('*', { count: 'exact' });
      
      // Apply search filter if provided
      if (search) {
        query = query.or(`name.ilike.%${search}%,description_default.ilike.%${search}%,sku.ilike.%${search}%`);
      }
      
      // Apply category filter
      if (categoryId) {
        query = query.eq('category_id', categoryId);
      }
      
      // Apply is_active filter
      if (isActive !== undefined) {
        query = query.eq('is_active', isActive);
      }
      
      // Apply sort
      if (sort) {
        query = query.order(sort.field, { ascending: sort.direction === 'asc' });
      }
      
      // Apply pagination
      query = query.range(pagination.offset, pagination.offset + pagination.limit - 1);
      
      const { data, error, count } = await query;
      
      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }
      
      res.json(
        successResponse(data ?? [], {
          pagination: {
            limit: pagination.limit,
            offset: pagination.offset,
            total: count ?? 0,
          },
        })
      );
    } catch (error) {
      console.error('Error listing parts:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to list parts')
      );
    }
  }
);

/**
 * POST /api/parts
 * Create a new part
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.post(
  '/api/parts',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body
      const validatedData = createPartSchema.parse(req.body);
      
      const supabase = createServerClient();
      
      // Insert part
      const { data, error } = await supabase
        .from('parts')
        .insert({
          ...validatedData,
        })
        .select()
        .single<Part>();
      
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
      console.error('Error creating part:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create part')
      );
    }
  }
);

/**
 * GET /api/parts/:id
 * Get a single part by ID
 * TECH role: read-only (allowed)
 * OFFICE/ADMIN: full access (allowed)
 */
router.get(
  '/api/parts/:id',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();
      
      const { data, error } = await supabase
        .from('parts')
        .select('*')
        .eq('id', id)
        .single<Part>();
      
      if (error) {
        if (error.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Part not found')
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
      console.error('Error fetching part:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch part')
      );
    }
  }
);

/**
 * PATCH /api/parts/:id
 * Update a part
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.patch(
  '/api/parts/:id',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      
      // Validate request body
      const validatedData = updatePartSchema.parse(req.body);
      
      // Ensure at least one field is being updated
      if (Object.keys(validatedData).length === 0) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'At least one field must be provided for update')
        );
        return;
      }
      
      const supabase = createServerClient();
      
      // Update part
      const { data, error } = await supabase
        .from('parts')
        .update({
          ...validatedData,
        })
        .eq('id', id)
        .select()
        .single<Part>();
      
      if (error) {
        if (error.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Part not found')
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
      console.error('Error updating part:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update part')
      );
    }
  }
);

export default router;
