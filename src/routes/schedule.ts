import { Router, Request, Response } from 'express';
import {
  createServerClient,
  translateDbError,
} from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { requireRole } from '@/middleware/requireRole.js';
import { updateScheduleSchema } from '@/validations/schedule.js';
import { WorkOrderSchedule } from '@/types/database.js';
import { ZodError } from 'zod';

const router = Router();

/**
 * PATCH /api/schedule/:id
 * Update a schedule slot
 * TECH role: can only update their own schedule entries
 * OFFICE/ADMIN: can update any schedule entry
 */
router.patch(
  '/api/schedule/:id',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Validate request body
      const validatedData = updateScheduleSchema.parse(req.body);

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

      // Fetch the current schedule entry
      const { data: currentSchedule, error: fetchError } = await supabase
        .from('work_order_schedule')
        .select('*')
        .eq('id', id)
        .single<WorkOrderSchedule>();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          res
            .status(404)
            .json(errorResponse('NOT_FOUND', 'Schedule entry not found'));
          return;
        }
        const apiError = translateDbError(fetchError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // TECH role: can only update their own schedule entries
      if (req.employee!.role === 'TECH') {
        if (currentSchedule.tech_user_id !== req.employee!.id) {
          res.status(403).json(
            errorResponse(
              'FORBIDDEN',
              'You can only update your own schedule entries'
            )
          );
          return;
        }

        // TECH cannot change the tech_user_id
        if (
          validatedData.tech_user_id &&
          validatedData.tech_user_id !== req.employee!.id
        ) {
          res.status(403).json(
            errorResponse(
              'FORBIDDEN',
              'You cannot assign schedule entries to other technicians'
            )
          );
          return;
        }
      }

      // Validate end_at > start_at if both are present
      const startAt = validatedData.start_at || currentSchedule.start_at;
      const endAt = validatedData.end_at || currentSchedule.end_at;

      if (new Date(endAt) <= new Date(startAt)) {
        res.status(400).json(
          errorResponse(
            'VALIDATION_ERROR',
            'end_at must be after start_at'
          )
        );
        return;
      }

      // Update schedule entry
      const { data, error } = await supabase
        .from('work_order_schedule')
        .update(validatedData)
        .eq('id', id)
        .select()
        .single<WorkOrderSchedule>();

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
      console.error('Error updating schedule entry:', error);
      res.status(500).json(
        errorResponse(
          'INTERNAL_SERVER_ERROR',
          'Failed to update schedule entry'
        )
      );
    }
  }
);

/**
 * DELETE /api/schedule/:id
 * Delete a schedule slot
 * TECH role: not allowed (403)
 * OFFICE/ADMIN: allowed
 */
router.delete(
  '/api/schedule/:id',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // Delete schedule entry
      const { data, error } = await supabase
        .from('work_order_schedule')
        .delete()
        .eq('id', id)
        .select()
        .single<WorkOrderSchedule>();

      if (error) {
        if (error.code === 'PGRST116') {
          res
            .status(404)
            .json(errorResponse('NOT_FOUND', 'Schedule entry not found'));
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
      console.error('Error deleting schedule entry:', error);
      res.status(500).json(
        errorResponse(
          'INTERNAL_SERVER_ERROR',
          'Failed to delete schedule entry'
        )
      );
    }
  }
);

export default router;
