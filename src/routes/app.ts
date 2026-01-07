import { Router, Request, Response } from 'express';
import {
  createServerClient,
  translateDbError,
} from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { clockInSchema, clockOutSchema } from '@/validations/app.js';
import { WorkOrder, WorkOrderTimeEntry } from '@/types/database.js';
import { ZodError } from 'zod';
import { enqueueJob } from '@/services/jobQueue.js';

const router = Router();

/**
 * GET /api/app/my-schedule
 * Get current tech's schedule for today or specified date range
 * TECH role only
 */
router.get(
  '/api/app/my-schedule',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supabase = createServerClient();
      const techUserId = req.employee!.id;

      // Parse query params
      const date = typeof req.query.date === 'string' ? req.query.date : undefined;
      const rangeStart = typeof req.query.range_start === 'string' ? req.query.range_start : undefined;
      const rangeEnd = typeof req.query.range_end === 'string' ? req.query.range_end : undefined;

      // Build query
      let query = supabase
        .from('work_order_schedule')
        .select(`
          *,
          work_order:work_orders(id, work_order_no, status, summary, customer_id, location_id)
        `)
        .eq('tech_user_id', techUserId);

      // Apply date filters
      if (rangeStart && rangeEnd) {
        query = query.gte('start_at', rangeStart).lte('end_at', rangeEnd);
      } else if (date) {
        // Single day filter
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.gte('start_at', startOfDay.toISOString()).lte('end_at', endOfDay.toISOString());
      } else {
        // Default to today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        query = query.gte('start_at', today.toISOString()).lte('end_at', endOfToday.toISOString());
      }

      query = query.order('start_at', { ascending: true });

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
      console.error('Error fetching tech schedule:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch schedule')
        );
    }
  }
);

/**
 * GET /api/app/my-work-orders
 * Get current tech's assigned/scheduled work orders
 * TECH role only
 */
router.get(
  '/api/app/my-work-orders',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supabase = createServerClient();
      const techUserId = req.employee!.id;

      // Parse query params
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const date = typeof req.query.date === 'string' ? req.query.date : undefined;

      // Get work order IDs from schedule where tech is assigned
      let scheduleQuery = supabase
        .from('work_order_schedule')
        .select('work_order_id')
        .eq('tech_user_id', techUserId);

      if (date) {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        scheduleQuery = scheduleQuery.gte('start_at', startOfDay.toISOString()).lte('end_at', endOfDay.toISOString());
      }

      const { data: scheduleData } = await scheduleQuery;

      const scheduledWorkOrderIds = scheduleData?.map((s) => s.work_order_id as string) || [];

      // Build work orders query
      let query = supabase
        .from('work_orders')
        .select(`
          *,
          customer:customers(id, name, customer_no),
          location:locations(id, label, street, city, state, zip)
        `);

      // Filter: assigned_to = self OR id in scheduledWorkOrderIds
      if (scheduledWorkOrderIds.length > 0) {
        const safeIds = scheduledWorkOrderIds
          .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
          .join(',');
        
        if (safeIds) {
          query = query.or(`assigned_to.eq.${techUserId},id.in.(${safeIds})`);
        } else {
          query = query.eq('assigned_to', techUserId);
        }
      } else {
        query = query.eq('assigned_to', techUserId);
      }

      // Apply status filter
      if (status) {
        query = query.eq('status', status);
      }

      query = query.order('opened_at', { ascending: false });

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
      console.error('Error fetching tech work orders:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch work orders')
        );
    }
  }
);

/**
 * GET /api/app/work-order/:id
 * Get work order details with customer and location info
 * TECH role: can only see work orders assigned to them or scheduled for them
 */
router.get(
  '/api/app/work-order/:id',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();
      const techUserId = req.employee!.id;

      // Fetch work order with customer and location data
      const { data, error } = await supabase
        .from('work_orders')
        .select(`
          *,
          customer:customers(id, name, customer_no, contact_name, phone, email),
          location:locations(id, label, street, city, state, zip)
        `)
        .eq('id', id)
        .single<WorkOrder & {
          customer: unknown;
          location: unknown;
        }>();

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

      // Check if tech has access to this work order
      const isAssigned = data.assigned_to === techUserId;

      // Check if scheduled for them
      const { data: scheduleData } = await supabase
        .from('work_order_schedule')
        .select('id')
        .eq('work_order_id', id)
        .eq('tech_user_id', techUserId)
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
 * POST /api/app/clock-in
 * Clock in to a work order
 * Creates a time entry with clock_in_at = now()
 */
router.post(
  '/api/app/clock-in',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body
      const validatedData = clockInSchema.parse(req.body);
      const supabase = createServerClient();
      const techUserId = req.employee!.id;

      // Verify work order exists
      const { data: workOrder, error: workOrderError } = await supabase
        .from('work_orders')
        .select('id, assigned_to')
        .eq('id', validatedData.work_order_id)
        .single<Pick<WorkOrder, 'id' | 'assigned_to'>>();

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

      // Verify tech has access to this work order
      const isAssigned = workOrder.assigned_to === techUserId;

      const { data: scheduleData } = await supabase
        .from('work_order_schedule')
        .select('id')
        .eq('work_order_id', validatedData.work_order_id)
        .eq('tech_user_id', techUserId)
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

      // Check for existing open time entry
      const { data: existingEntry } = await supabase
        .from('work_order_time_entries')
        .select('id')
        .eq('work_order_id', validatedData.work_order_id)
        .eq('tech_user_id', techUserId)
        .is('clock_out_at', null)
        .limit(1);

      if (existingEntry && existingEntry.length > 0) {
        res
          .status(400)
          .json(
            errorResponse(
              'VALIDATION_ERROR',
              'You already have an open time entry for this work order'
            )
          );
        return;
      }

      // Create time entry
      const { data, error } = await supabase
        .from('work_order_time_entries')
        .insert({
          work_order_id: validatedData.work_order_id,
          tech_user_id: techUserId,
          clock_in_at: new Date().toISOString(),
          break_minutes: 0,
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

      res.status(201).json(successResponse(data));
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Invalid request data', error.issues)
        );
        return;
      }
      console.error('Error clocking in:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to clock in')
        );
    }
  }
);

/**
 * POST /api/app/clock-out
 * Clock out of a work order
 * Updates time entry with clock_out_at = now() and enqueues cost posting job
 */
router.post(
  '/api/app/clock-out',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body
      const validatedData = clockOutSchema.parse(req.body);
      const supabase = createServerClient();
      const techUserId = req.employee!.id;

      // Fetch time entry
      const { data: timeEntry, error: fetchError } = await supabase
        .from('work_order_time_entries')
        .select('*')
        .eq('id', validatedData.time_entry_id)
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

      // Verify time entry belongs to current tech
      if (timeEntry.tech_user_id !== techUserId) {
        res
          .status(403)
          .json(
            errorResponse(
              'FORBIDDEN',
              'You can only clock out your own time entries'
            )
          );
        return;
      }

      // Check if already clocked out
      if (timeEntry.clock_out_at) {
        res
          .status(400)
          .json(
            errorResponse(
              'VALIDATION_ERROR',
              'This time entry is already clocked out'
            )
          );
        return;
      }

      // Update time entry
      const updateData: Partial<WorkOrderTimeEntry> = {
        clock_out_at: new Date().toISOString(),
      };

      if (validatedData.break_minutes !== undefined) {
        updateData.break_minutes = validatedData.break_minutes;
      }

      if (validatedData.notes !== undefined) {
        updateData.notes = validatedData.notes;
      }

      const { data, error } = await supabase
        .from('work_order_time_entries')
        .update(updateData)
        .eq('id', validatedData.time_entry_id)
        .select()
        .single<WorkOrderTimeEntry>();

      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Enqueue job for cost posting
      const { error: jobError } = await enqueueJob(supabase, 'time_entry_cost_post', {
        time_entry_id: data.id,
      });

      if (jobError) {
        console.error('Failed to enqueue cost posting job:', jobError);
        // Continue - time entry was updated successfully, job can be manually triggered
      }

      res.json(successResponse(data));
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Invalid request data', error.issues)
        );
        return;
      }
      console.error('Error clocking out:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to clock out')
        );
    }
  }
);

/**
 * GET /api/app/my-time-entries
 * Get current tech's time entries for today or specified date range
 * TECH role only
 */
router.get(
  '/api/app/my-time-entries',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supabase = createServerClient();
      const techUserId = req.employee!.id;

      // Parse query params
      const date = typeof req.query.date === 'string' ? req.query.date : undefined;
      const rangeStart = typeof req.query.range_start === 'string' ? req.query.range_start : undefined;
      const rangeEnd = typeof req.query.range_end === 'string' ? req.query.range_end : undefined;

      // Build query
      let query = supabase
        .from('work_order_time_entries')
        .select(`
          *,
          work_order:work_orders(id, work_order_no, status, summary)
        `)
        .eq('tech_user_id', techUserId);

      // Apply date filters
      if (rangeStart && rangeEnd) {
        query = query.gte('clock_in_at', rangeStart).lte('clock_in_at', rangeEnd);
      } else if (date) {
        // Single day filter
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.gte('clock_in_at', startOfDay.toISOString()).lte('clock_in_at', endOfDay.toISOString());
      } else {
        // Default to today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        query = query.gte('clock_in_at', today.toISOString()).lte('clock_in_at', endOfToday.toISOString());
      }

      query = query.order('clock_in_at', { ascending: false });

      const { data, error } = await query;

      if (error) {
        const apiError = translateDbError(error);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Add computed hours to each entry
      const entriesWithHours = (data ?? []).map((entry) => {
        const typedEntry = entry as WorkOrderTimeEntry & { work_order: unknown };
        let hours: number | null = null;
        if (typedEntry.clock_out_at) {
          const clockInMs = new Date(typedEntry.clock_in_at).getTime();
          const clockOutMs = new Date(typedEntry.clock_out_at).getTime();
          const totalMinutes = (clockOutMs - clockInMs) / 60000;
          const workedMinutes = totalMinutes - typedEntry.break_minutes;
          hours = workedMinutes / 60;
        }
        return {
          ...typedEntry,
          hours,
        };
      });

      res.json(successResponse(entriesWithHours));
    } catch (error) {
      console.error('Error fetching tech time entries:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch time entries')
        );
    }
  }
);

export default router;
