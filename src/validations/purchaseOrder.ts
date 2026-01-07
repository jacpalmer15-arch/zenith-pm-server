import { z } from 'zod';

/**
 * Validation schema for creating a new purchase order
 */
export const createPurchaseOrderSchema = z.object({
  vendor_name: z.string().min(1).max(255),
  po_date: z.string().date().optional(),
  expected_delivery: z.string().date().optional(),
  notes: z.string().max(1000).optional(),
});

/**
 * Validation schema for updating an existing purchase order
 * All fields are optional since this is a partial update
 */
export const updatePurchaseOrderSchema = z.object({
  vendor_name: z.string().min(1).max(255).optional(),
  po_date: z.string().date().optional(),
  expected_delivery: z.string().date().optional(),
  notes: z.string().max(1000).optional(),
});

/**
 * TypeScript types inferred from schemas
 */
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>;
