import { z } from 'zod';

/**
 * Validation schema for creating a new quote line
 */
export const createQuoteLineSchema = z.object({
  part_id: z.string().uuid().optional(),
  description: z.string().min(1).max(500),
  uom: z.string().min(1).max(20),
  qty: z.number().positive(),
  unit_price: z.number().min(0),
  is_taxable: z.boolean().optional(),
});

/**
 * Validation schema for updating an existing quote line
 * All fields are optional since this is a partial update
 */
export const updateQuoteLineSchema = createQuoteLineSchema.partial();

/**
 * TypeScript types inferred from schemas
 */
export type CreateQuoteLineInput = z.infer<typeof createQuoteLineSchema>;
export type UpdateQuoteLineInput = z.infer<typeof updateQuoteLineSchema>;
