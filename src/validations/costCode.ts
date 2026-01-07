import { z } from 'zod';

/**
 * Validation schema for creating a new cost code
 */
export const createCostCodeSchema = z.object({
  cost_type_id: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  sort_order: z.number().int().min(0).optional(),
});

/**
 * Validation schema for updating an existing cost code
 * All fields except cost_type_id are optional
 */
export const updateCostCodeSchema = createCostCodeSchema.partial().omit({ cost_type_id: true });

/**
 * TypeScript types inferred from schemas
 */
export type CreateCostCodeInput = z.infer<typeof createCostCodeSchema>;
export type UpdateCostCodeInput = z.infer<typeof updateCostCodeSchema>;
