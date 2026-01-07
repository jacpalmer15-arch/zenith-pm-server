import { z } from 'zod';

/**
 * Validation schema for job costing report query parameters
 */
export const jobCostingQuerySchema = z.object({
  project_id: z.string().uuid().optional(),
  work_order_id: z.string().uuid().optional(),
  start_date: z.string().date().optional(),
  end_date: z.string().date().optional(),
  group_by: z.enum(['cost_type', 'cost_code', 'none']).optional(),
});

/**
 * Validation schema for profit & loss report query parameters
 */
export const profitLossQuerySchema = z.object({
  project_id: z.string().uuid().optional(),
  start_date: z.string().date().optional(),
  end_date: z.string().date().optional(),
});

/**
 * Validation schema for job cost detail report query parameters
 */
export const jobCostDetailQuerySchema = z
  .object({
    project_id: z.string().uuid().optional(),
    work_order_id: z.string().uuid().optional(),
    start_date: z.string().date().optional(),
    end_date: z.string().date().optional(),
    cost_type_id: z.string().uuid().optional(),
    cost_code_id: z.string().uuid().optional(),
    page: z.coerce.number().int().positive().optional(),
    per_page: z.coerce.number().int().positive().max(100).optional(),
  })
  .refine((data) => data.project_id || data.work_order_id, {
    message: 'Either project_id or work_order_id is required',
  });

/**
 * TypeScript types inferred from schemas
 */
export type JobCostingQuery = z.infer<typeof jobCostingQuerySchema>;
export type ProfitLossQuery = z.infer<typeof profitLossQuerySchema>;
export type JobCostDetailQuery = z.infer<typeof jobCostDetailQuerySchema>;
