import { z } from 'zod';

/**
 * Validation schema for creating a new part
 */
export const createPartSchema = z.object({
  sku: z.string().max(100).optional(),
  name: z.string().min(1).max(255),
  description_default: z.string().max(1000).default(''),
  category_id: z.string().uuid().optional(),
  uom: z.string().min(1).max(20),
  is_taxable: z.boolean().default(true),
  cost_type_id: z.string().uuid().optional(),
  cost_code_id: z.string().uuid().optional(),
  sell_price: z.number().min(0).default(0),
  avg_cost: z.number().min(0).default(0),
  last_cost: z.number().min(0).default(0),
  is_active: z.boolean().default(true),
});

/**
 * Validation schema for updating an existing part
 * All fields are optional since this is a partial update
 */
export const updatePartSchema = createPartSchema.partial();

/**
 * TypeScript types inferred from schemas
 */
export type CreatePartInput = z.infer<typeof createPartSchema>;
export type UpdatePartInput = z.infer<typeof updatePartSchema>;
