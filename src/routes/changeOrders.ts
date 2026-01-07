import { Router, Request, Response } from 'express';
import { createServerClient, parsePagination, parseSort, translateDbError } from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { requireRole } from '@/middleware/requireRole.js';
import {
  createChangeOrderSchema,
  updateChangeOrderSchema,
  rejectChangeOrderSchema,
} from '@/validations/changeOrder.js';
import { ChangeOrder } from '@/types/database.js';
import { createAuditLog } from '@/services/auditLog.js';
import { ZodError } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';

const router = Router();

/**
 * Helper function to get next change order number from database
 * Wraps the RPC call with proper typing
 */
async function getNextChangeOrderNumber(
  supabase: SupabaseClient
): Promise<{ coNo: string | null; error: unknown }> {
  const result = await supabase.rpc('get_next_number', {
    p_kind: 'change_order',
  });

  return {
    coNo: typeof result.data === 'string' ? result.data : null,
    error: result.error,
  };
}

/**
 * GET /api/change-orders
 * List change orders with pagination, filters (project_id, status), and sort
 * TECH role: read-only (allowed)
 * OFFICE/ADMIN: full access (allowed)
 */
router.get(
  '/api/change-orders',
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
        ['co_no', 'amount', 'status', 'requested_at', 'approved_at', 'created_at', 'updated_at'],
        'created_at',
        'desc'
      );

      // Parse filter params
      const projectId =
        typeof req.query.project_id === 'string' ? req.query.project_id.trim() : '';
      const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';

      // Build query
      let query = supabase.from('change_orders').select('*', { count: 'exact' });

      // Apply project_id filter if provided
      if (projectId) {
        query = query.eq('project_id', projectId);
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
        res
          .status(apiError.statusCode)
          .json(errorResponse(apiError.code, apiError.message, apiError.details));
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
      console.error('Error listing change orders:', error);
      res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to list change orders'));
    }
  }
);

/**
 * POST /api/change-orders
 * Create a new change order
 * TECH role: allowed (can create)
 * OFFICE/ADMIN: allowed
 */
router.post(
  '/api/change-orders',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body
      const validatedData = createChangeOrderSchema.parse(req.body);

      const supabase = createServerClient();

      // Verify project exists
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('id', validatedData.project_id)
        .single();

      if (projectError || !project) {
        res
          .status(400)
          .json(errorResponse('VALIDATION_ERROR', 'Invalid project_id: project does not exist'));
        return;
      }

      // Call DB function to get next change order number
      const { coNo, error: numberError } = await getNextChangeOrderNumber(supabase);

      if (numberError || !coNo) {
        console.error('Error generating change order number:', numberError);
        res
          .status(500)
          .json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to generate change order number'));
        return;
      }

      // Insert change order with generated co_no
      const { data, error } = await supabase
        .from('change_orders')
        .insert({
          ...validatedData,
          co_no: coNo,
          requested_by: req.employee!.id,
          requested_at: new Date().toISOString(),
          status: 'PENDING',
        })
        .select()
        .single<ChangeOrder>();

      if (error) {
        const apiError = translateDbError(error);
        res
          .status(apiError.statusCode)
          .json(errorResponse(apiError.code, apiError.message, apiError.details));
        return;
      }

      res.status(201).json(successResponse(data));
    } catch (error) {
      if (error instanceof ZodError) {
        res
          .status(400)
          .json(errorResponse('VALIDATION_ERROR', 'Invalid request data', error.issues));
        return;
      }
      console.error('Error creating change order:', error);
      res
        .status(500)
        .json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create change order'));
    }
  }
);

/**
 * GET /api/change-orders/:id
 * Get a single change order by ID
 * TECH role: read-only (allowed)
 * OFFICE/ADMIN: full access (allowed)
 */
router.get(
  '/api/change-orders/:id',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      const result = await supabase.from('change_orders').select('*').eq('id', id).single();

      if (result.error) {
        if (result.error.code === 'PGRST116') {
          res.status(404).json(errorResponse('NOT_FOUND', 'Change order not found'));
          return;
        }
        const apiError = translateDbError(result.error);
        res
          .status(apiError.statusCode)
          .json(errorResponse(apiError.code, apiError.message, apiError.details));
        return;
      }

      res.json(successResponse(result.data));
    } catch (error) {
      console.error('Error fetching change order:', error);
      res
        .status(500)
        .json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch change order'));
    }
  }
);

/**
 * PATCH /api/change-orders/:id
 * Update a change order (only if status is PENDING)
 * TECH role: not allowed (403) - TECH can create but not modify
 * OFFICE/ADMIN: allowed
 */
router.patch(
  '/api/change-orders/:id',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Validate request body
      const validatedData = updateChangeOrderSchema.parse(req.body);

      // Ensure at least one field is being updated
      if (Object.keys(validatedData).length === 0) {
        res
          .status(400)
          .json(
            errorResponse('VALIDATION_ERROR', 'At least one field must be provided for update')
          );
        return;
      }

      const supabase = createServerClient();

      // Check if change order exists and get its current status
      const { data: existingCO, error: fetchError } = await supabase
        .from('change_orders')
        .select('status')
        .eq('id', id)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          res.status(404).json(errorResponse('NOT_FOUND', 'Change order not found'));
          return;
        }
        const apiError = translateDbError(fetchError);
        res
          .status(apiError.statusCode)
          .json(errorResponse(apiError.code, apiError.message, apiError.details));
        return;
      }

      // Prevent modifications to APPROVED or REJECTED change orders
      if (existingCO.status !== 'PENDING') {
        res
          .status(400)
          .json(
            errorResponse(
              'VALIDATION_ERROR',
              'Cannot modify change order with status: ' + existingCO.status
            )
          );
        return;
      }

      // Update change order
      const { data, error } = await supabase
        .from('change_orders')
        .update(validatedData)
        .eq('id', id)
        .select()
        .single<ChangeOrder>();

      if (error) {
        const apiError = translateDbError(error);
        res
          .status(apiError.statusCode)
          .json(errorResponse(apiError.code, apiError.message, apiError.details));
        return;
      }

      res.json(successResponse(data));
    } catch (error) {
      if (error instanceof ZodError) {
        res
          .status(400)
          .json(errorResponse('VALIDATION_ERROR', 'Invalid request data', error.issues));
        return;
      }
      console.error('Error updating change order:', error);
      res
        .status(500)
        .json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update change order'));
    }
  }
);

/**
 * POST /api/change-orders/:id/approve
 * Approve a change order
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 *
 * Workflow:
 * 1. Validate status is PENDING
 * 2. Set status = 'APPROVED'
 * 3. Set approved_by = req.employee.id
 * 4. Set approved_at = now()
 * 5. Update projects.change_order_amount += change_order.amount
 * 6. Recalculate projects.contract_amount = base_contract_amount + change_order_amount
 * 7. Create audit_logs entry
 */
router.post(
  '/api/change-orders/:id/approve',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // Fetch the change order with current status
      const { data: changeOrder, error: fetchError } = await supabase
        .from('change_orders')
        .select('*')
        .eq('id', id)
        .single<ChangeOrder>();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          res.status(404).json(errorResponse('NOT_FOUND', 'Change order not found'));
          return;
        }
        const apiError = translateDbError(fetchError);
        res
          .status(apiError.statusCode)
          .json(errorResponse(apiError.code, apiError.message, apiError.details));
        return;
      }

      // Validate status is PENDING
      if (changeOrder.status !== 'PENDING') {
        res
          .status(400)
          .json(
            errorResponse(
              'VALIDATION_ERROR',
              `Cannot approve change order with status: ${changeOrder.status}`
            )
          );
        return;
      }

      const beforeData = { ...changeOrder };
      const approvedAt = new Date().toISOString();

      // Update change order status to APPROVED
      const { data: updatedCO, error: updateError } = await supabase
        .from('change_orders')
        .update({
          status: 'APPROVED',
          approved_by: req.employee!.id,
          approved_at: approvedAt,
        })
        .eq('id', id)
        .select()
        .single<ChangeOrder>();

      if (updateError) {
        const apiError = translateDbError(updateError);
        res
          .status(apiError.statusCode)
          .json(errorResponse(apiError.code, apiError.message, apiError.details));
        return;
      }

      // Fetch current project to get base_contract_amount and change_order_amount
      const { data: project, error: projectFetchError } = await supabase
        .from('projects')
        .select('base_contract_amount, change_order_amount')
        .eq('id', changeOrder.project_id)
        .single<{ base_contract_amount: number; change_order_amount: number }>();

      if (projectFetchError) {
        console.error('Error fetching project:', projectFetchError);
        res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update project'));
        return;
      }

      // Calculate new amounts
      const newChangeOrderAmount: number = project.change_order_amount + changeOrder.amount;
      const newContractAmount: number = project.base_contract_amount + newChangeOrderAmount;

      // Update project's change_order_amount and contract_amount
      const { error: projectUpdateError } = await supabase
        .from('projects')
        .update({
          change_order_amount: newChangeOrderAmount,
          contract_amount: newContractAmount,
        })
        .eq('id', changeOrder.project_id);

      if (projectUpdateError) {
        console.error('Error updating project amounts:', projectUpdateError);
        res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update project'));
        return;
      }

      // Create audit log entry
      const { error: auditError } = await createAuditLog(supabase, {
        entity_type: 'change_order',
        entity_id: id,
        action: 'CHANGE_ORDER_APPROVED',
        actor_user_id: req.employee!.id,
        before_data: beforeData as unknown as Record<string, unknown>,
        after_data: updatedCO as unknown as Record<string, unknown>,
      });

      if (auditError) {
        console.error('Error creating audit log:', auditError);
        // Don't fail the request if audit log fails
      }

      res.json(successResponse(updatedCO));
    } catch (error) {
      console.error('Error approving change order:', error);
      res
        .status(500)
        .json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to approve change order'));
    }
  }
);

/**
 * POST /api/change-orders/:id/reject
 * Reject a change order
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 *
 * Workflow:
 * 1. Validate status is PENDING
 * 2. Set status = 'REJECTED'
 * 3. Set approved_by = req.employee.id (acts as reviewer/rejector)
 * 4. Set approved_at = now() (acts as reviewed_at/rejected_at timestamp)
 * 5. Optional: add rejection notes
 * 6. Create audit_logs entry with action = 'CHANGE_ORDER_REJECTED'
 */
router.post(
  '/api/change-orders/:id/reject',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Validate request body (optional notes)
      const validatedData = rejectChangeOrderSchema.parse(req.body);

      const supabase = createServerClient();

      // Fetch the change order with current status
      const { data: changeOrder, error: fetchError } = await supabase
        .from('change_orders')
        .select('*')
        .eq('id', id)
        .single<ChangeOrder>();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          res.status(404).json(errorResponse('NOT_FOUND', 'Change order not found'));
          return;
        }
        const apiError = translateDbError(fetchError);
        res
          .status(apiError.statusCode)
          .json(errorResponse(apiError.code, apiError.message, apiError.details));
        return;
      }

      // Validate status is PENDING
      if (changeOrder.status !== 'PENDING') {
        res
          .status(400)
          .json(
            errorResponse(
              'VALIDATION_ERROR',
              `Cannot reject change order with status: ${changeOrder.status}`
            )
          );
        return;
      }

      const beforeData = { ...changeOrder };
      const approvedAt = new Date().toISOString();

      // Update change order status to REJECTED
      const updateData: Record<string, unknown> = {
        status: 'REJECTED',
        approved_by: req.employee!.id,
        approved_at: approvedAt,
      };

      // Add notes if provided
      if (validatedData.notes !== undefined) {
        updateData.notes = validatedData.notes;
      }

      const { data: updatedCO, error: updateError } = await supabase
        .from('change_orders')
        .update(updateData)
        .eq('id', id)
        .select()
        .single<ChangeOrder>();

      if (updateError) {
        const apiError = translateDbError(updateError);
        res
          .status(apiError.statusCode)
          .json(errorResponse(apiError.code, apiError.message, apiError.details));
        return;
      }

      // Create audit log entry
      const { error: auditError } = await createAuditLog(supabase, {
        entity_type: 'change_order',
        entity_id: id,
        action: 'CHANGE_ORDER_REJECTED',
        actor_user_id: req.employee!.id,
        before_data: beforeData as unknown as Record<string, unknown>,
        after_data: updatedCO as unknown as Record<string, unknown>,
      });

      if (auditError) {
        console.error('Error creating audit log:', auditError);
        // Don't fail the request if audit log fails
      }

      res.json(successResponse(updatedCO));
    } catch (error) {
      if (error instanceof ZodError) {
        res
          .status(400)
          .json(errorResponse('VALIDATION_ERROR', 'Invalid request data', error.issues));
        return;
      }
      console.error('Error rejecting change order:', error);
      res
        .status(500)
        .json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to reject change order'));
    }
  }
);

export default router;
