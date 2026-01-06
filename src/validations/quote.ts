import { z } from 'zod';

/**
 * Quote type enum matching the database enum
 */
export const quoteTypeEnum = z.enum(['BASE', 'CHANGE_ORDER']);

/**
 * Quote status enum matching the database enum
 */
export const quoteStatusEnum = z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED']);

/**
 * Validation schema for creating a new quote
 */
export const createQuoteSchema = z.object({
  project_id: z.string().uuid().optional(),
  work_order_id: z.string().uuid().optional(),
  quote_type: quoteTypeEnum.optional(),
  parent_quote_id: z.string().uuid().optional(),
  tax_rule_id: z.string().uuid(),
  quote_date: z.string().date().optional(),
  valid_until: z.string().date().optional(),
}).refine(data => {
  const hasProject = !!data.project_id;
  const hasWorkOrder = !!data.work_order_id;
  return (hasProject && !hasWorkOrder) || (!hasProject && hasWorkOrder);
}, { message: 'Exactly one of project_id or work_order_id must be provided' });

/**
 * Validation schema for updating an existing quote
 * Only allows updating limited fields and only when status is DRAFT
 */
export const updateQuoteSchema = z.object({
  tax_rule_id: z.string().uuid().optional(),
  quote_date: z.string().date().optional(),
  valid_until: z.string().date().optional(),
});

/**
 * TypeScript types inferred from schemas
 */
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;
export type QuoteType = z.infer<typeof quoteTypeEnum>;
export type QuoteStatus = z.infer<typeof quoteStatusEnum>;
