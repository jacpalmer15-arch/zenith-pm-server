import { z } from 'zod';

/**
 * Validation schema for clock-in request
 */
export const clockInSchema = z.object({
  work_order_id: z.string().uuid(),
});

/**
 * Validation schema for clock-out request
 */
export const clockOutSchema = z.object({
  time_entry_id: z.string().uuid(),
  break_minutes: z.number().int().min(0).max(480).optional(),
  notes: z.string().max(1000).optional(),
});

/**
 * TypeScript types inferred from schemas
 */
export type ClockInInput = z.infer<typeof clockInSchema>;
export type ClockOutInput = z.infer<typeof clockOutSchema>;
