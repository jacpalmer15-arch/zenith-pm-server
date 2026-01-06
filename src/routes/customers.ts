import { Router, Request, Response } from 'express';
import { createServerClient, parsePagination, parseSort, translateDbError } from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { requireRole } from '@/middleware/requireRole.js';
import { createCustomerSchema, updateCustomerSchema } from '@/validations/customer.js';
import { Customer } from '@/types/database.js';
import { ZodError } from 'zod';

const router = Router();

/**
 * GET /api/customers
 * List customers with pagination, search, and sort
 * TECH role: read-only (allowed)
 * OFFICE/ADMIN: full access (allowed)
 */
router.get(
  '/api/customers',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supabase = createServerClient();
      
      // Parse pagination params
      const pagination = parsePagination(req.query);
      
      // Parse sort params (allow sorting by common fields)
      const sort = parseSort(
        req.query,
        ['name', 'customer_no', 'created_at', 'updated_at'],
        'created_at',
        'desc'
      );
      
      // Parse search param
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      
      // Build query
      let query = supabase
        .from('customers')
        .select('*', { count: 'exact' });
      
      // Apply search filter if provided
      if (search) {
        query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
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
      console.error('Error listing customers:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to list customers')
      );
    }
  }
);

/**
 * POST /api/customers
 * Create a new customer
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.post(
  '/api/customers',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body
      const validatedData = createCustomerSchema.parse(req.body);
      
      const supabase = createServerClient();
      
      // Call DB function to get next customer number
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { data: customerNo, error: numberError } = await supabase
        .rpc('get_next_number', { p_kind: 'customer' });
      
      if (numberError || !customerNo) {
        console.error('Error generating customer number:', numberError);
        res.status(500).json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to generate customer number')
        );
        return;
      }
      
      // Insert customer with generated customer_no
      const { data, error } = await supabase
        .from('customers')
        .insert({
          ...validatedData,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          customer_no: customerNo,
          created_by: req.employee!.id,
          updated_by: req.employee!.id,
        })
        .select()
        .single<Customer>();
      
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
      console.error('Error creating customer:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create customer')
      );
    }
  }
);

/**
 * GET /api/customers/:id
 * Get a single customer by ID
 * TECH role: read-only (allowed)
 * OFFICE/ADMIN: full access (allowed)
 */
router.get(
  '/api/customers/:id',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();
      
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .single<Customer>();
      
      if (error) {
        if (error.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Customer not found')
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
      console.error('Error fetching customer:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch customer')
      );
    }
  }
);

/**
 * PATCH /api/customers/:id
 * Update a customer
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.patch(
  '/api/customers/:id',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      
      // Validate request body
      const validatedData = updateCustomerSchema.parse(req.body);
      
      // Ensure at least one field is being updated
      if (Object.keys(validatedData).length === 0) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'At least one field must be provided for update')
        );
        return;
      }
      
      const supabase = createServerClient();
      
      // Update customer
      const { data, error } = await supabase
        .from('customers')
        .update({
          ...validatedData,
          updated_by: req.employee!.id,
        })
        .eq('id', id)
        .select()
        .single<Customer>();
      
      if (error) {
        if (error.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Customer not found')
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
      console.error('Error updating customer:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update customer')
      );
    }
  }
);

export default router;
