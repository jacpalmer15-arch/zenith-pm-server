import { z } from 'zod';

/**
 * Validation schema for creating a new time entry
 */
export const createTimeEntrySchema = z
  .object({
    tech_user_id: z.string().uuid(),
    clock_in_at: z.string().datetime(),
    clock_out_at: z.string().datetime().optional(),
    break_minutes: z.number().int().min(0).max(480).optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine(
    (data) => {
      if (data.clock_out_at) {
        return new Date(data.clock_out_at) > new Date(data.clock_in_at);
      }
      return true;
    },
    { message: 'clock_out_at must be after clock_in_at' }
  );

/**
 * Validation schema for updating an existing time entry
 * All fields are optional since this is a partial update
 */
export const updateTimeEntrySchema = z.object({
  clock_out_at: z.string().datetime().optional(),
  break_minutes: z.number().int().min(0).max(480).optional(),
  notes: z.string().max(1000).optional(),
});

/**
 * TypeScript types inferred from schemas
 */
export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>;
export type UpdateTimeEntryInput = z.infer<typeof updateTimeEntrySchema>;
