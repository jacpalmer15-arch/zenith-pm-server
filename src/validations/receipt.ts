import { z } from 'zod';

/**
 * Validation schema for creating a new receipt
 */
export const createReceiptSchema = z.object({
  vendor_name: z.string().min(1).max(255),
  receipt_date: z.string().date(),
  total_amount: z.number().positive(),
  storage_path: z.string().min(1),
  notes: z.string().max(1000).optional(),
});

/**
 * Validation schema for updating an existing receipt
 * All fields are optional since this is a partial update
 */
export const updateReceiptSchema = z.object({
  vendor_name: z.string().min(1).max(255).optional(),
  receipt_date: z.string().date().optional(),
  total_amount: z.number().positive().optional(),
  notes: z.string().max(1000).optional(),
});

/**
 * TypeScript types inferred from schemas
 */
export type CreateReceiptInput = z.infer<typeof createReceiptSchema>;
export type UpdateReceiptInput = z.infer<typeof updateReceiptSchema>;
