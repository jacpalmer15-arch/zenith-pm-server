import { z } from 'zod';

/**
 * Validation schema for creating a new cost type
 * Note: Schema only has name field, not code/description as in problem statement
 */
export const createCostTypeSchema = z.object({
  name: z.string().min(1).max(255),
  sort_order: z.number().int().min(0).optional(),
});

/**
 * Validation schema for updating an existing cost type
 * All fields are optional since this is a partial update
 */
export const updateCostTypeSchema = createCostTypeSchema.partial();

/**
 * TypeScript types inferred from schemas
 */
export type CreateCostTypeInput = z.infer<typeof createCostTypeSchema>;
export type UpdateCostTypeInput = z.infer<typeof updateCostTypeSchema>;
