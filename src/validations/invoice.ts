import { z } from 'zod';

/**
 * Invoice type enum matching the database enum
 */
export const invoiceTypeEnum = z.enum(['STANDARD', 'PROGRESS', 'FINAL', 'CHANGE_ORDER']);

/**
 * Invoice status enum matching the database enum
 */
export const invoiceStatusEnum = z.enum(['DRAFT', 'SENT', 'PAID', 'PARTIAL', 'VOID']);

/**
 * Validation schema for creating a new invoice
 */
export const createInvoiceSchema = z.object({
  project_id: z.string().uuid().optional(),
  work_order_id: z.string().uuid().optional(),
  invoice_type: invoiceTypeEnum.optional(),
  invoice_date: z.string().date().optional(),
  due_date: z.string().date().optional(),
  tax_rule_id: z.string().uuid(),
}).refine(data => {
  const hasProject = !!data.project_id;
  const hasWorkOrder = !!data.work_order_id;
  return (hasProject && !hasWorkOrder) || (!hasProject && hasWorkOrder);
}, { message: 'Exactly one of project_id or work_order_id must be provided' });

/**
 * Validation schema for updating an existing invoice
 * Only allows updating limited fields and only when status is DRAFT
 */
export const updateInvoiceSchema = z.object({
  invoice_date: z.string().date().optional(),
  due_date: z.string().date().optional(),
  tax_rule_id: z.string().uuid().optional(),
});

/**
 * TypeScript types inferred from schemas
 */
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type InvoiceType = z.infer<typeof invoiceTypeEnum>;
export type InvoiceStatus = z.infer<typeof invoiceStatusEnum>;
