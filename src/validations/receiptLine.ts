import { z } from 'zod';

/**
 * Validation schema for creating a new receipt line item
 */
export const createReceiptLineSchema = z.object({
  part_id: z.string().uuid().optional(),
  description: z.string().max(500).optional(),
  uom: z.string().max(20).optional(),
  qty: z.number().positive(),
  unit_cost: z.number().min(0),
});

/**
 * Validation schema for updating an existing receipt line item
 * All fields are optional since this is a partial update
 */
export const updateReceiptLineSchema = z.object({
  part_id: z.string().uuid().nullable().optional(),
  description: z.string().max(500).optional(),
  uom: z.string().max(20).nullable().optional(),
  qty: z.number().positive().optional(),
  unit_cost: z.number().min(0).optional(),
});

/**
 * TypeScript types inferred from schemas
 */
export type CreateReceiptLineInput = z.infer<typeof createReceiptLineSchema>;
export type UpdateReceiptLineInput = z.infer<typeof updateReceiptLineSchema>;
