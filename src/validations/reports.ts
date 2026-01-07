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
 * Common date range schema with validation
 */
export const dateRangeSchema = z.object({
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
}).refine(data => {
  if (data.date_from && data.date_to) {
    return new Date(data.date_to) >= new Date(data.date_from);
  }
  return true;
}, { message: 'date_to must be after date_from' });

/**
 * Period schema for time-based grouping
 */
export const periodSchema = z.enum(['week', 'month', 'quarter', 'year']);

/**
 * Group by schema for aggregation
 */
export const groupBySchema = z.enum(['day', 'week', 'month']);

/**
 * Dashboard query schema
 */
export const dashboardQuerySchema = dateRangeSchema.extend({
  period: periodSchema.optional(),
});

/**
 * Report query schema with common filters
 */
export const reportQuerySchema = dateRangeSchema.extend({
  customer_id: z.string().uuid().optional(),
  tech_id: z.string().uuid().optional(),
  status: z.string().optional(),
  group_by: groupBySchema.optional(),
});

/**
 * TypeScript types inferred from schemas
 */
export type JobCostingQuery = z.infer<typeof jobCostingQuerySchema>;
export type ProfitLossQuery = z.infer<typeof profitLossQuerySchema>;
export type JobCostDetailQuery = z.infer<typeof jobCostDetailQuerySchema>;
export type DateRangeQuery = z.infer<typeof dateRangeSchema>;
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type ReportQuery = z.infer<typeof reportQuerySchema>;
