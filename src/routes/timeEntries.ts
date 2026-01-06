import { Router, Request, Response } from 'express';
import {
  createServerClient,
  translateDbError,
} from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import {
  createTimeEntrySchema,
  updateTimeEntrySchema,
} from '@/validations/timeEntry.js';
import { WorkOrder, WorkOrderTimeEntry } from '@/types/database.js';
import { ZodError } from 'zod';
import { enqueueJob } from '@/services/jobQueue.js';

const router = Router();

/**
 * Helper function to compute hours from time entry
 */
function computeHours(entry: WorkOrderTimeEntry): number | null {
  if (!entry.clock_out_at) {
    return null;
  }
  const clockInMs = new Date(entry.clock_in_at).getTime();
  const clockOutMs = new Date(entry.clock_out_at).getTime();
  const totalMinutes = (clockOutMs - clockInMs) / 60000;
  const workedMinutes = totalMinutes - entry.break_minutes;
  return workedMinutes / 60;
}

/**
 * Helper function to check if tech has access to work order
 */
async function techHasAccessToWorkOrder(
  supabase: ReturnType<typeof createServerClient>,
  workOrderId: string,
  techUserId: string
): Promise<boolean> {
  // Check if work order is assigned to tech
  const { data: workOrder } = await supabase
    .from('work_orders')
    .select('assigned_to')
    .eq('id', workOrderId)
    .single<Pick<WorkOrder, 'assigned_to'>>();

  if (workOrder && workOrder.assigned_to === techUserId) {
    return true;
  }

  // Check if tech is scheduled for work order
  const { data: scheduleData } = await supabase
    .from('work_order_schedule')
    .select('id')
    .eq('work_order_id', workOrderId)
    .eq('tech_user_id', techUserId)
    .limit(1);

  return scheduleData !== null && scheduleData.length > 0;
}

/**
 * GET /api/work-orders/:id/time-entries
 * List time entries for a work order
 * TECH role: can only see time entries for work orders they're assigned to or scheduled for
 * OFFICE/ADMIN: can see all time entries
 */
router.get(
  '/api/work-orders/:id/time-entries',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // TECH role: verify they have access to this work order
      if (req.employee!.role === 'TECH') {
        const hasAccess = await techHasAccessToWorkOrder(
          supabase,
          id,
          req.employee!.id
        );

        if (!hasAccess) {
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

      // Fetch time entries
      const { data, error } = await supabase
        .from('work_order_time_entries')
        .select('*')
        .eq('work_order_id', id)
        .order('clock_in_at', { ascending: false });

      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Add computed hours to each entry
      const entriesWithHours = (data ?? []).map((entry) => {
        const typedEntry = entry as WorkOrderTimeEntry;
        return {
          ...typedEntry,
          hours: computeHours(typedEntry),
        };
      });

      res.json(successResponse(entriesWithHours));
    } catch (error) {
      console.error('Error listing time entries:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to list time entries')
        );
    }
  }
);

/**
 * POST /api/work-orders/:id/time-entries
 * Create a new time entry (clock in)
 * TECH role: can only create their own time entries
 * OFFICE/ADMIN: can create time entries for any tech
 */
router.post(
  '/api/work-orders/:id/time-entries',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Validate request body
      const validatedData = createTimeEntrySchema.parse(req.body);

      // TECH role: can only create entries for themselves
      if (req.employee!.role === 'TECH') {
        if (validatedData.tech_user_id !== req.employee!.id) {
          res.status(403).json(
            errorResponse(
              'FORBIDDEN',
              'You can only create time entries for yourself'
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

      // Insert time entry
      const { data, error } = await supabase
        .from('work_order_time_entries')
        .insert({
          work_order_id: id,
          tech_user_id: validatedData.tech_user_id,
          clock_in_at: validatedData.clock_in_at,
          clock_out_at: validatedData.clock_out_at ?? null,
          break_minutes: validatedData.break_minutes ?? 0,
          notes: validatedData.notes ?? null,
        })
        .select()
        .single<WorkOrderTimeEntry>();

      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // If clock_out_at is set, enqueue job for cost posting
      if (data.clock_out_at) {
        const { error: jobError } = await enqueueJob(supabase, 'time_entry_cost_post', {
          time_entry_id: data.id,
        });
        if (jobError) {
          console.error('Failed to enqueue cost posting job:', jobError);
          // Continue - time entry was created successfully, job can be manually triggered
        }
      }

      // Add computed hours
      const responseData = {
        ...data,
        hours: computeHours(data),
      };

      res.status(201).json(successResponse(responseData));
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Invalid request data', error.issues)
        );
        return;
      }
      console.error('Error creating time entry:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create time entry')
        );
    }
  }
);

/**
 * GET /api/time-entries/:id
 * Get a single time entry by ID
 * TECH role: can only see their own time entries
 * OFFICE/ADMIN: can see all time entries
 */
router.get(
  '/api/time-entries/:id',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      const { data, error } = await supabase
        .from('work_order_time_entries')
        .select('*')
        .eq('id', id)
        .single<WorkOrderTimeEntry>();

      if (error) {
        if (error.code === 'PGRST116') {
          res
            .status(404)
            .json(errorResponse('NOT_FOUND', 'Time entry not found'));
          return;
        }
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // TECH role: can only see their own time entries
      if (req.employee!.role === 'TECH') {
        if (data.tech_user_id !== req.employee!.id) {
          res
            .status(403)
            .json(
              errorResponse(
                'FORBIDDEN',
                'You can only view your own time entries'
              )
            );
          return;
        }
      }

      // Add computed hours
      const responseData = {
        ...data,
        hours: computeHours(data),
      };

      res.json(successResponse(responseData));
    } catch (error) {
      console.error('Error fetching time entry:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch time entry')
        );
    }
  }
);

/**
 * PATCH /api/time-entries/:id
 * Update a time entry (clock out, add break, notes)
 * TECH role: can only update their own time entries
 * OFFICE/ADMIN: can update any time entry
 */
router.patch(
  '/api/time-entries/:id',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Validate request body
      const validatedData = updateTimeEntrySchema.parse(req.body);

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

      // First, get the current time entry to check ownership
      const { data: currentEntry, error: fetchError } = await supabase
        .from('work_order_time_entries')
        .select('*')
        .eq('id', id)
        .single<WorkOrderTimeEntry>();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          res
            .status(404)
            .json(errorResponse('NOT_FOUND', 'Time entry not found'));
          return;
        }
        const apiError = translateDbError(fetchError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // TECH role: can only update their own time entries
      if (req.employee!.role === 'TECH') {
        if (currentEntry.tech_user_id !== req.employee!.id) {
          res
            .status(403)
            .json(
              errorResponse(
                'FORBIDDEN',
                'You can only update your own time entries'
              )
            );
          return;
        }
      }

      // Validate clock_out_at if provided
      if (validatedData.clock_out_at) {
        const clockOutDate = new Date(validatedData.clock_out_at);
        const clockInDate = new Date(currentEntry.clock_in_at);
        if (clockOutDate <= clockInDate) {
          res.status(400).json(
            errorResponse(
              'VALIDATION_ERROR',
              'clock_out_at must be after clock_in_at'
            )
          );
          return;
        }
      }

      // Update time entry
      const { data, error } = await supabase
        .from('work_order_time_entries')
        .update(validatedData)
        .eq('id', id)
        .select()
        .single<WorkOrderTimeEntry>();

      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // If clock_out_at was just set (completed entry), enqueue job for cost posting
      if (validatedData.clock_out_at && !currentEntry.clock_out_at) {
        const { error: jobError } = await enqueueJob(supabase, 'time_entry_cost_post', {
          time_entry_id: data.id,
        });
        if (jobError) {
          console.error('Failed to enqueue cost posting job:', jobError);
          // Continue - time entry was updated successfully, job can be manually triggered
        }
      }

      // Add computed hours
      const responseData = {
        ...data,
        hours: computeHours(data),
      };

      res.json(successResponse(responseData));
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Invalid request data', error.issues)
        );
        return;
      }
      console.error('Error updating time entry:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update time entry')
        );
    }
  }
);

export default router;
