import { z } from 'zod';

/**
 * Enum for inventory transaction types (matches database enum)
 */
const inventoryTxnTypeEnum = z.enum(['RECEIPT', 'ADJUSTMENT', 'USAGE', 'RETURN']);

/**
 * Validation schema for creating a new inventory ledger entry
 */
export const createInventoryLedgerSchema = z.object({
  txn_date: z.string().datetime().optional(),
  txn_type: inventoryTxnTypeEnum,
  qty_delta: z.number().refine(val => val !== 0, { message: 'qty_delta cannot be zero' }),
  unit_cost: z.number().min(0).optional(),
  reference_type: z.string().max(50).optional(),
  reference_id: z.string().uuid().optional(),
});

/**
 * TypeScript types inferred from schemas
 */
export type CreateInventoryLedgerInput = z.infer<typeof createInventoryLedgerSchema>;
export type InventoryTxnType = z.infer<typeof inventoryTxnTypeEnum>;
