import { Router, Request, Response } from 'express';
import {
  createServerClient,
  parsePagination,
  parseSort,
  translateDbError,
} from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { requireRole } from '@/middleware/requireRole.js';
import {
  createWorkOrderSchema,
  updateWorkOrderSchema,
} from '@/validations/workOrder.js';
import { createScheduleSchema } from '@/validations/schedule.js';
import { WorkOrder, WorkOrderSchedule } from '@/types/database.js';
import { ZodError } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';

const router = Router();

/**
 * Helper function to get next work order number from database
 */
async function getNextWorkOrderNumber(
  supabase: SupabaseClient
): Promise<{ workOrderNo: string | null; error: unknown }> {
  const result = await supabase.rpc('get_next_number', {
    p_kind: 'work_order',
  });

  return {
    workOrderNo: typeof result.data === 'string' ? result.data : null,
    error: result.error,
  };
}

/**
 * GET /api/work-orders
 * List work orders with pagination, filters, and sort
 * TECH role: can only see work orders assigned to them or scheduled for them
 * OFFICE/ADMIN: can see all work orders
 */
router.get(
  '/api/work-orders',
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
        [
          'work_order_no',
          'status',
          'priority',
          'opened_at',
          'created_at',
          'updated_at',
        ],
        'created_at',
        'desc'
      );

      // Parse filter params
      const customerId =
        typeof req.query.customer_id === 'string'
          ? req.query.customer_id
          : undefined;
      const locationId =
        typeof req.query.location_id === 'string'
          ? req.query.location_id
          : undefined;
      const status =
        typeof req.query.status === 'string' ? req.query.status : undefined;
      const assignedTo =
        typeof req.query.assigned_to === 'string'
          ? req.query.assigned_to
          : undefined;

      // Build query based on user role
      let query = supabase.from('work_orders').select('*', { count: 'exact' });

      // TECH role: only see work orders assigned to them or scheduled for them
      if (req.employee!.role === 'TECH') {
        // Get work order IDs from schedule where tech is assigned
        const { data: scheduleData } = await supabase
          .from('work_order_schedule')
          .select('work_order_id')
          .eq('tech_user_id', req.employee!.id);

        const scheduledWorkOrderIds =
          scheduleData?.map((s) => s.work_order_id as string) || [];

        // Filter: assigned_to = self OR id in scheduledWorkOrderIds
        if (scheduledWorkOrderIds.length > 0) {
          query = query.or(
            `assigned_to.eq.${req.employee!.id},id.in.(${scheduledWorkOrderIds.join(',')})`
          );
        } else {
          query = query.eq('assigned_to', req.employee!.id);
        }
      }

      // Apply filters
      if (customerId) {
        query = query.eq('customer_id', customerId);
      }
      if (locationId) {
        query = query.eq('location_id', locationId);
      }
      if (status) {
        query = query.eq('status', status);
      }
      if (assignedTo) {
        query = query.eq('assigned_to', assignedTo);
      }

      // Apply sort
      if (sort) {
        query = query.order(sort.field, { ascending: sort.direction === 'asc' });
      }

      // Apply pagination
      query = query.range(
        pagination.offset,
        pagination.offset + pagination.limit - 1
      );

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
      console.error('Error listing work orders:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to list work orders')
        );
    }
  }
);

/**
 * POST /api/work-orders
 * Create a new work order
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.post(
  '/api/work-orders',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body
      const validatedData = createWorkOrderSchema.parse(req.body);

      const supabase = createServerClient();

      // Call DB function to get next work order number
      const { workOrderNo, error: numberError } =
        await getNextWorkOrderNumber(supabase);

      if (numberError || !workOrderNo) {
        console.error('Error generating work order number:', numberError);
        res.status(500).json(
          errorResponse(
            'INTERNAL_SERVER_ERROR',
            'Failed to generate work order number'
          )
        );
        return;
      }

      // Prepare insert data with defaults
      const insertData: Record<string, unknown> = {
        ...validatedData,
        work_order_no: workOrderNo,
        opened_at: new Date().toISOString(),
      };

      // Insert work order
      const { data, error } = await supabase
        .from('work_orders')
        .insert(insertData)
        .select()
        .single<WorkOrder>();

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
      console.error('Error creating work order:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create work order')
        );
    }
  }
);

/**
 * GET /api/work-orders/:id
 * Get a single work order by ID with related customer and location names
 * TECH role: can only see work orders assigned to them or scheduled for them
 * OFFICE/ADMIN: can see all work orders
 */
router.get(
  '/api/work-orders/:id',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // Fetch work order with customer and location data
      const { data, error } = await supabase
        .from('work_orders')
        .select(
          `
          *,
          customer:customers(id, name, customer_no),
          location:locations(id, label, street, city, state, zip)
        `
        )
        .eq('id', id)
        .single<
          WorkOrder & {
            customer: { id: string; name: string; customer_no: string };
            location: {
              id: string;
              label: string | null;
              street: string;
              city: string;
              state: string;
              zip: string;
            };
          }
        >();

      if (error) {
        if (error.code === 'PGRST116') {
          res
            .status(404)
            .json(errorResponse('NOT_FOUND', 'Work order not found'));
          return;
        }
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // TECH role: check if they have access to this work order
      if (req.employee!.role === 'TECH') {
        // Check if assigned to them
        const isAssigned = data.assigned_to === req.employee!.id;

        // Check if scheduled for them
        const { data: scheduleData } = await supabase
          .from('work_order_schedule')
          .select('id')
          .eq('work_order_id', id)
          .eq('tech_user_id', req.employee!.id)
          .limit(1);

        const isScheduled = scheduleData && scheduleData.length > 0;

        if (!isAssigned && !isScheduled) {
          res
            .status(403)
            .json(
              errorResponse(
                'FORBIDDEN',
                'You do not have access to this work order'
              )
            );
          return;
        }
      }

      res.json(successResponse(data));
    } catch (error) {
      console.error('Error fetching work order:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch work order')
        );
    }
  }
);

/**
 * PATCH /api/work-orders/:id
 * Update a work order
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.patch(
  '/api/work-orders/:id',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Validate request body
      const validatedData = updateWorkOrderSchema.parse(req.body);

      // Ensure at least one field is being updated
      if (Object.keys(validatedData).length === 0) {
        res.status(400).json(
          errorResponse(
            'VALIDATION_ERROR',
            'At least one field must be provided for update'
          )
        );
        return;
      }

      const supabase = createServerClient();

      // First, get the current work order to check status changes
      const { data: currentWorkOrder, error: fetchError } = await supabase
        .from('work_orders')
        .select('status, completed_at, closed_at')
        .eq('id', id)
        .single<Pick<WorkOrder, 'status' | 'completed_at' | 'closed_at'>>();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          res
            .status(404)
            .json(errorResponse('NOT_FOUND', 'Work order not found'));
          return;
        }
        const apiError = translateDbError(fetchError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Prepare update data
      const updateData: Record<string, unknown> = { ...validatedData };

      // Handle status change timestamps
      if (validatedData.status && validatedData.status !== currentWorkOrder.status) {
        if (validatedData.status === 'COMPLETED' && !currentWorkOrder.completed_at) {
          updateData.completed_at = new Date().toISOString();
        }
        if (validatedData.status === 'CLOSED' && !currentWorkOrder.closed_at) {
          updateData.closed_at = new Date().toISOString();
        }
      }

      // Update work order
      const { data, error } = await supabase
        .from('work_orders')
        .update(updateData)
        .eq('id', id)
        .select()
        .single<WorkOrder>();

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
      console.error('Error updating work order:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update work order')
        );
    }
  }
);

/**
 * GET /api/work-orders/:id/schedule
 * List schedule entries for a work order
 * TECH role: can see if they have access to the work order
 * OFFICE/ADMIN: can see all
 */
router.get(
  '/api/work-orders/:id/schedule',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // TECH role: verify they have access to this work order
      if (req.employee!.role === 'TECH') {
        const { data: workOrder } = await supabase
          .from('work_orders')
          .select('assigned_to')
          .eq('id', id)
          .single<Pick<WorkOrder, 'assigned_to'>>();

        if (!workOrder) {
          res
            .status(404)
            .json(errorResponse('NOT_FOUND', 'Work order not found'));
          return;
        }

        const isAssigned = workOrder.assigned_to === req.employee!.id;

        const { data: scheduleData } = await supabase
          .from('work_order_schedule')
          .select('id')
          .eq('work_order_id', id)
          .eq('tech_user_id', req.employee!.id)
          .limit(1);

        const isScheduled = scheduleData && scheduleData.length > 0;

        if (!isAssigned && !isScheduled) {
          res
            .status(403)
            .json(
              errorResponse(
                'FORBIDDEN',
                'You do not have access to this work order'
              )
            );
          return;
        }
      }

      // Fetch schedule entries
      const { data, error } = await supabase
        .from('work_order_schedule')
        .select('*')
        .eq('work_order_id', id)
        .order('start_at', { ascending: true });

      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      res.json(successResponse(data ?? []));
    } catch (error) {
      console.error('Error fetching work order schedule:', error);
      res.status(500).json(
        errorResponse(
          'INTERNAL_SERVER_ERROR',
          'Failed to fetch work order schedule'
        )
      );
    }
  }
);

/**
 * POST /api/work-orders/:id/schedule
 * Create a schedule slot for a work order
 * TECH role: can only create for themselves
 * OFFICE/ADMIN: can create for any tech
 */
router.post(
  '/api/work-orders/:id/schedule',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Validate request body
      const validatedData = createScheduleSchema.parse(req.body);

      // TECH role: can only create schedule entries for themselves
      if (req.employee!.role === 'TECH') {
        if (validatedData.tech_user_id !== req.employee!.id) {
          res.status(403).json(
            errorResponse(
              'FORBIDDEN',
              'You can only create schedule entries for yourself'
            )
          );
          return;
        }
      }

      const supabase = createServerClient();

      // Verify work order exists
      const { error: workOrderError } = await supabase
        .from('work_orders')
        .select('id')
        .eq('id', id)
        .single();

      if (workOrderError) {
        if (workOrderError.code === 'PGRST116') {
          res
            .status(404)
            .json(errorResponse('NOT_FOUND', 'Work order not found'));
          return;
        }
        const apiError = translateDbError(workOrderError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Insert schedule entry
      const { data, error } = await supabase
        .from('work_order_schedule')
        .insert({
          work_order_id: id,
          tech_user_id: validatedData.tech_user_id,
          start_at: validatedData.start_at,
          end_at: validatedData.end_at,
        })
        .select()
        .single<WorkOrderSchedule>();

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
      console.error('Error creating schedule entry:', error);
      res.status(500).json(
        errorResponse(
          'INTERNAL_SERVER_ERROR',
          'Failed to create schedule entry'
        )
      );
    }
  }
);

export default router;
