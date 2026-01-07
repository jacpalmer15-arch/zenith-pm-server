import { z } from 'zod';

/**
 * Validation schema for creating a new receipt
 */
export const createReceiptSchema = z.object({
  storage_path: z.string().min(1).max(500),
  total_amount: z.number().positive(),
  qb_source_entity: z.string().max(100).optional(),
  qb_source_id: z.string().max(100).optional(),
  vendor_name: z.string().min(1).max(255).optional(),
  receipt_date: z.string().date().optional(),
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
 * Validation schema for a cost entry line
 */
export const costEntryLineSchema = z.object({
  bucket: z.string().min(1).max(100),
  origin: z.string().min(1).max(100),
  qty: z.number().positive(),
  unit_cost: z.number().min(0),
  total_cost: z.number().min(0),
  occurred_at: z.string().datetime(),
  part_id: z.string().uuid().optional(),
});

/**
 * Validation schema for allocating to work order
 */
export const allocateToWorkOrderSchema = z.object({
  allocated_to_work_order_id: z.string().uuid(),
  lines: z.array(costEntryLineSchema).min(1),
});

/**
 * Validation schema for allocating to overhead
 */
export const allocateToOverheadSchema = z.object({
  allocated_overhead_bucket: z.string().min(1).max(100),
  lines: z.array(costEntryLineSchema).min(1),
});

/**
 * Combined allocation schema - union of work order and overhead
 */
export const allocateReceiptSchema = z.union([
  allocateToWorkOrderSchema,
  allocateToOverheadSchema,
]);

/**
 * TypeScript types inferred from schemas
 */
export type CreateReceiptInput = z.infer<typeof createReceiptSchema>;
export type UpdateReceiptInput = z.infer<typeof updateReceiptSchema>;
export type CostEntryLineInput = z.infer<typeof costEntryLineSchema>;
export type AllocateToWorkOrderInput = z.infer<typeof allocateToWorkOrderSchema>;
export type AllocateToOverheadInput = z.infer<typeof allocateToOverheadSchema>;
export type AllocateReceiptInput = z.infer<typeof allocateReceiptSchema>;
