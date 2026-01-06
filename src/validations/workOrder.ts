import { z } from 'zod';

/**
 * Work order status enum
 */
const workOrderStatusEnum = z.enum([
  'UNSCHEDULED',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CLOSED',
  'CANCELED',
]);

/**
 * Validation schema for creating a new work order
 */
export const createWorkOrderSchema = z.object({
  customer_id: z.string().uuid(),
  location_id: z.string().uuid(),
  summary: z.string().max(500).optional(),
  description: z.string().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  status: workOrderStatusEnum.optional(),
  assigned_to: z.string().uuid().optional(),
  requested_window_start: z.string().datetime().optional(),
  requested_window_end: z.string().datetime().optional(),
});

/**
 * Validation schema for updating an existing work order
 * All fields are optional since this is a partial update
 */
export const updateWorkOrderSchema = z.object({
  summary: z.string().max(500).optional(),
  description: z.string().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  status: workOrderStatusEnum.optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  requested_window_start: z.string().datetime().nullable().optional(),
  requested_window_end: z.string().datetime().nullable().optional(),
  contract_subtotal: z.number().min(0).optional(),
  contract_tax: z.number().min(0).optional(),
  contract_total: z.number().min(0).optional(),
});

/**
 * TypeScript types inferred from schemas
 */
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderSchema>;
export type WorkOrderStatus = z.infer<typeof workOrderStatusEnum>;
