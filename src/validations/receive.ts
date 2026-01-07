import { z } from 'zod';

/**
 * Validation schema for a single receive line
 */
export const receiveLineSchema = z.object({
  line_id: z.string().uuid(),
  qty_received: z.number().positive(),
});

/**
 * Validation schema for receiving a purchase order
 */
export const receivePurchaseOrderSchema = z.object({
  lines: z.array(receiveLineSchema).min(1),
});

/**
 * TypeScript types inferred from schemas
 */
export type ReceiveLineInput = z.infer<typeof receiveLineSchema>;
export type ReceivePurchaseOrderInput = z.infer<typeof receivePurchaseOrderSchema>;
