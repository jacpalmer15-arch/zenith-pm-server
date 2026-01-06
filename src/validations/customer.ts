import { z } from 'zod';

/**
 * Validation schema for creating a new customer
 */
export const createCustomerSchema = z.object({
  name: z.string().min(1).max(255),
  contact_name: z.string().max(255).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional().or(z.literal('')).transform(val => val === '' ? undefined : val),
  billing_street: z.string().max(255).optional(),
  billing_city: z.string().max(100).optional(),
  billing_state: z.string().max(50).optional(),
  billing_zip: z.string().max(20).optional(),
  service_street: z.string().max(255).optional(),
  service_city: z.string().max(100).optional(),
  service_state: z.string().max(50).optional(),
  service_zip: z.string().max(20).optional(),
  notes: z.string().optional(),
});

/**
 * Validation schema for updating an existing customer
 * All fields are optional since this is a partial update
 */
export const updateCustomerSchema = createCustomerSchema.partial();

/**
 * TypeScript types inferred from schemas
 */
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
