import { z } from 'zod';

/**
 * Change order status enum matching the database enum
 */
export const changeOrderStatusEnum = z.enum(['PENDING', 'APPROVED', 'REJECTED']);

/**
 * Validation schema for creating a new change order
 */
export const createChangeOrderSchema = z.object({
  project_id: z.string().uuid(),
  description: z.string().min(1).max(1000),
  amount: z.number().finite(),
  notes: z.string().max(2000).optional(),
});

/**
 * Validation schema for updating an existing change order
 * All fields are optional since this is a partial update
 */
export const updateChangeOrderSchema = z.object({
  description: z.string().min(1).max(1000).optional(),
  amount: z.number().finite().optional(),
  notes: z.string().max(2000).optional(),
});

/**
 * Validation schema for rejecting a change order
 */
export const rejectChangeOrderSchema = z.object({
  notes: z.string().max(2000).optional(),
});

/**
 * TypeScript types inferred from schemas
 */
export type CreateChangeOrderInput = z.infer<typeof createChangeOrderSchema>;
export type UpdateChangeOrderInput = z.infer<typeof updateChangeOrderSchema>;
export type RejectChangeOrderInput = z.infer<typeof rejectChangeOrderSchema>;
export type ChangeOrderStatus = z.infer<typeof changeOrderStatusEnum>;
