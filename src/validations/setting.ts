import { z } from 'zod';

/**
 * Validation schema for updating settings
 * Settings is a single-row configuration table
 */
export const updateSettingsSchema = z.object({
  company_name: z.string().max(255).optional(),
  company_phone: z.string().max(50).optional(),
  company_email: z.string().email().max(255).optional(),
  company_address: z.string().max(500).optional(),
  default_quote_terms: z.string().max(5000).optional(),
  default_tax_rule_id: z.string().uuid().optional(),
  customer_number_prefix: z.string().max(10).optional(),
  project_number_prefix: z.string().max(10).optional(),
  quote_number_prefix: z.string().max(10).optional(),
  work_order_number_prefix: z.string().max(10).optional(),
  change_order_number_prefix: z.string().max(10).optional(),
  default_labor_rate: z.number().min(0).optional(),
});

/**
 * TypeScript type inferred from schema
 */
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
