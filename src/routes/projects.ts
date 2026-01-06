import { Router, Request, Response } from 'express';
import { createServerClient, parsePagination, parseSort, translateDbError } from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { requireRole } from '@/middleware/requireRole.js';
import { createProjectSchema, updateProjectSchema } from '@/validations/project.js';
import { Project } from '@/types/database.js';
import { ZodError } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';

const router = Router();

/**
 * Helper function to get next project number from database
 * Wraps the RPC call with proper typing
 */
async function getNextProjectNumber(
  supabase: SupabaseClient
): Promise<{ projectNo: string | null; error: unknown }> {
  const result = await supabase.rpc('get_next_number', {
    p_kind: 'project',
  });

  return {
    projectNo: typeof result.data === 'string' ? result.data : null,
    error: result.error,
  };
}

/**
 * GET /api/projects
 * List projects with pagination, filters (customer_id, status), and sort
 * TECH role: read-only (allowed)
 * OFFICE/ADMIN: full access (allowed)
 */
router.get(
  '/api/projects',
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
        ['name', 'project_no', 'status', 'created_at', 'updated_at'],
        'created_at',
        'desc'
      );
      
      // Parse filter params
      const customerId = typeof req.query.customer_id === 'string' ? req.query.customer_id.trim() : '';
      const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
      
      // Build query
      let query = supabase
        .from('projects')
        .select('*, customers!inner(name)', { count: 'exact' });
      
      // Apply customer_id filter if provided
      if (customerId) {
        query = query.eq('customer_id', customerId);
      }
      
      // Apply status filter if provided
      if (status) {
        query = query.eq('status', status);
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
      console.error('Error listing projects:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to list projects')
      );
    }
  }
);

/**
 * POST /api/projects
 * Create a new project
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.post(
  '/api/projects',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body
      const validatedData = createProjectSchema.parse(req.body);
      
      const supabase = createServerClient();
      
      // Verify customer exists
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id')
        .eq('id', validatedData.customer_id)
        .single();
      
      if (customerError || !customer) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Invalid customer_id: customer does not exist')
        );
        return;
      }
      
      // Call DB function to get next project number
      const { projectNo, error: numberError } = await getNextProjectNumber(supabase);
      
      if (numberError || !projectNo) {
        console.error('Error generating project number:', numberError);
        res.status(500).json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to generate project number')
        );
        return;
      }
      
      // Insert project with generated project_no
      const { data, error } = await supabase
        .from('projects')
        .insert({
          ...validatedData,
          project_no: projectNo,
          created_by: req.employee!.id,
          updated_by: req.employee!.id,
        })
        .select()
        .single<Project>();
      
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
      console.error('Error creating project:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create project')
      );
    }
  }
);

/**
 * GET /api/projects/:id
 * Get a single project by ID (includes customer name)
 * TECH role: read-only (allowed)
 * OFFICE/ADMIN: full access (allowed)
 */
router.get(
  '/api/projects/:id',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();
      
      const result = await supabase
        .from('projects')
        .select('*, customers!inner(name)')
        .eq('id', id)
        .single();
      
      if (result.error) {
        if (result.error.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Project not found')
          );
          return;
        }
        const apiError = translateDbError(result.error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }
      
      res.json(successResponse(result.data));
    } catch (error) {
      console.error('Error fetching project:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch project')
      );
    }
  }
);

/**
 * PATCH /api/projects/:id
 * Update a project
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.patch(
  '/api/projects/:id',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      
      // Validate request body
      const validatedData = updateProjectSchema.parse(req.body);
      
      // Ensure at least one field is being updated
      if (Object.keys(validatedData).length === 0) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'At least one field must be provided for update')
        );
        return;
      }
      
      const supabase = createServerClient();
      
      // Update project
      const { data, error } = await supabase
        .from('projects')
        .update({
          ...validatedData,
          updated_by: req.employee!.id,
        })
        .eq('id', id)
        .select()
        .single<Project>();
      
      if (error) {
        if (error.code === 'PGRST116') {
          res.status(404).json(
            errorResponse('NOT_FOUND', 'Project not found')
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
      console.error('Error updating project:', error);
      res.status(500).json(
        errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update project')
      );
    }
  }
);

export default router;
