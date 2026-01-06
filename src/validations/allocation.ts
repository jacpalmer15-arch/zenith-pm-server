import { z } from 'zod';

/**
 * Validation schema for a single allocation line item
 */
export const allocationLineSchema = z.object({
  cost_type_id: z.string().uuid(),
  cost_code_id: z.string().uuid(),
  qty: z.number().positive(),
  unit_cost: z.number().min(0),
  part_id: z.string().uuid().optional(),
  description: z.string().max(500).optional(),
});

/**
 * Validation schema for allocating a receipt
 * Must have either work order allocation OR overhead allocation, not both
 */
export const allocateReceiptSchema = z.object({
  allocated_to_work_order_id: z.string().uuid().optional(),
  allocated_overhead_bucket: z.string().max(100).optional(),
  lines: z.array(allocationLineSchema).optional(),
}).refine(data => {
  const hasWO = !!data.allocated_to_work_order_id;
  const hasOverhead = !!data.allocated_overhead_bucket;
  return (hasWO && !hasOverhead) || (!hasWO && hasOverhead);
}, { message: 'Exactly one of allocated_to_work_order_id or allocated_overhead_bucket must be provided' });

/**
 * TypeScript types inferred from schemas
 */
export type AllocationLineInput = z.infer<typeof allocationLineSchema>;
export type AllocateReceiptInput = z.infer<typeof allocateReceiptSchema>;
