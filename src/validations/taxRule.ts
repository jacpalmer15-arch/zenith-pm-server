import { z } from 'zod';

/**
 * Validation schema for creating a new tax rule
 * Note: Schema doesn't have is_default or description in actual schema
 */
export const createTaxRuleSchema = z.object({
  name: z.string().min(1).max(255),
  rate: z.number().min(0).max(1), // 0.0825 = 8.25%
  is_active: z.boolean().optional(),
});

/**
 * Validation schema for updating an existing tax rule
 * All fields are optional since this is a partial update
 */
export const updateTaxRuleSchema = createTaxRuleSchema.partial();

/**
 * TypeScript types inferred from schemas
 */
export type CreateTaxRuleInput = z.infer<typeof createTaxRuleSchema>;
export type UpdateTaxRuleInput = z.infer<typeof updateTaxRuleSchema>;
