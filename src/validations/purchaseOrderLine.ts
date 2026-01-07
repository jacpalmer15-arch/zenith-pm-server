import { z } from 'zod';

/**
 * Validation schema for creating a new purchase order line
 */
export const createPurchaseOrderLineSchema = z.object({
  part_id: z.string().uuid().optional(),
  description: z.string().min(1).max(500),
  uom: z.string().min(1).max(20),
  qty_ordered: z.number().positive(),
  unit_price: z.number().min(0),
});

/**
 * Validation schema for updating an existing purchase order line
 * All fields are optional since this is a partial update
 */
export const updatePurchaseOrderLineSchema = createPurchaseOrderLineSchema.partial();

/**
 * TypeScript types inferred from schemas
 */
export type CreatePurchaseOrderLineInput = z.infer<typeof createPurchaseOrderLineSchema>;
export type UpdatePurchaseOrderLineInput = z.infer<typeof updatePurchaseOrderLineSchema>;
