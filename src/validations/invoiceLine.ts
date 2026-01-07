import { z } from 'zod';

/**
 * Validation schema for creating a new invoice line
 */
export const createInvoiceLineSchema = z.object({
  part_id: z.string().uuid().optional(),
  description: z.string().min(1).max(500),
  uom: z.string().min(1).max(20),
  qty: z.number().positive(),
  unit_price: z.number().min(0),
  is_taxable: z.boolean().optional(),
});

/**
 * Validation schema for updating an existing invoice line
 */
export const updateInvoiceLineSchema = createInvoiceLineSchema.partial();

/**
 * TypeScript types inferred from schemas
 */
export type CreateInvoiceLineInput = z.infer<typeof createInvoiceLineSchema>;
export type UpdateInvoiceLineInput = z.infer<typeof updateInvoiceLineSchema>;
