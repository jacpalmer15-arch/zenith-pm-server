import { z } from 'zod';

/**
 * Project status enum matching the database enum
 */
export const projectStatusEnum = z.enum(['Planning', 'Quoted', 'Active', 'Completed', 'Closed']);

/**
 * Validation schema for creating a new project
 */
export const createProjectSchema = z.object({
  customer_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  status: projectStatusEnum.optional(),
  job_street: z.string().max(255).optional(),
  job_city: z.string().max(100).optional(),
  job_state: z.string().max(50).optional(),
  job_zip: z.string().max(20).optional(),
  budget_amount: z.number().min(0).optional(),
});

/**
 * Validation schema for updating an existing project
 * All fields are optional since this is a partial update
 */
export const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  status: projectStatusEnum.optional(),
  job_street: z.string().max(255).optional(),
  job_city: z.string().max(100).optional(),
  job_state: z.string().max(50).optional(),
  job_zip: z.string().max(20).optional(),
  budget_amount: z.number().min(0).optional(),
  // Contract fields are typically updated via quote acceptance, but allow manual override for ADMIN
  base_contract_amount: z.number().min(0).optional(),
  change_order_amount: z.number().min(0).optional(),
  contract_amount: z.number().min(0).optional(),
});

/**
 * TypeScript types inferred from schemas
 */
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ProjectStatus = z.infer<typeof projectStatusEnum>;
