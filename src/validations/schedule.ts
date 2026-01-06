import { z } from 'zod';

/**
 * Validation schema for creating a new schedule entry
 */
export const createScheduleSchema = z
  .object({
    tech_user_id: z.string().uuid(),
    start_at: z.string().datetime(),
    end_at: z.string().datetime(),
  })
  .refine((data) => new Date(data.end_at) > new Date(data.start_at), {
    message: 'end_at must be after start_at',
  });

/**
 * Validation schema for updating an existing schedule entry
 * All fields are optional since this is a partial update
 */
export const updateScheduleSchema = z
  .object({
    tech_user_id: z.string().uuid().optional(),
    start_at: z.string().datetime().optional(),
    end_at: z.string().datetime().optional(),
  })
  .refine(
    (data) => {
      // If both start_at and end_at are provided, validate the order
      if (data.start_at && data.end_at) {
        return new Date(data.end_at) > new Date(data.start_at);
      }
      return true;
    },
    {
      message: 'end_at must be after start_at',
    }
  );

/**
 * TypeScript types inferred from schemas
 */
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
