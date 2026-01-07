import { Router, Request, Response } from 'express';
import { createServerClient } from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { profitLossQuerySchema } from '@/validations/reports.js';
import { ZodError } from 'zod';

const router = Router();

/**
 * GET /api/reports/profit-loss
 * Calculate project profitability
 * TECH role: read-only access (should be blocked at route level but included for completeness)
 * OFFICE/ADMIN: full access
 */
router.get(
  '/api/reports/profit-loss',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate query parameters
      const query = profitLossQuerySchema.parse(req.query);
      const supabase = createServerClient();

      // Build query for projects
      let projectQuery = supabase
        .from('projects')
        .select(
          `
          id,
          project_no,
          name,
          base_contract_amount,
          change_order_amount,
          contract_amount,
          invoiced_amount,
          paid_amount,
          status
        `
        )
        .neq('status', 'CANCELLED');

      // Apply project filter if specified
      if (query.project_id) {
        projectQuery = projectQuery.eq('id', query.project_id);
      }

      const { data: projects, error: projectError } = await projectQuery;

      if (projectError) {
        throw projectError;
      }

      if (!projects || projects.length === 0) {
        // If specific project_id was requested and not found, return 404
        if (query.project_id) {
          res.status(404).json(errorResponse('NOT_FOUND', 'Project not found'));
          return;
        }

        // Otherwise return empty array
        res.status(200).json(successResponse([]));
        return;
      }

      // Get job cost entries for all projects or specific project
      let costQuery = supabase
        .from('job_cost_entries')
        .select('project_id, amount, txn_date');

      if (query.project_id) {
        costQuery = costQuery.eq('project_id', query.project_id);
      } else {
        // Get costs for all projects
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        const projectIds = projects.map((p) => p.id);

        costQuery = costQuery.in('project_id', projectIds);
      }

      // Apply date filters if specified
      if (query.start_date) {
        costQuery = costQuery.gte('txn_date', query.start_date);
      }

      if (query.end_date) {
        costQuery = costQuery.lte('txn_date', query.end_date);
      }

      const { data: costEntries, error: costError } = await costQuery;

      if (costError) {
        throw costError;
      }

      // Aggregate costs by project
      const costByProject = new Map<string, number>();
      if (costEntries) {
        for (const entry of costEntries) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const projectId = entry.project_id;
          const currentCost = costByProject.get(projectId as string) || 0;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          costByProject.set(projectId, currentCost + Number(entry.amount));
        }
      }

      // Build response for each project
      const results = projects.map((project) => {
         // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const totalCost = costByProject.get(project.id) || 0;
        const contractAmount = Number(project.contract_amount);
        const invoicedAmount = Number(project.invoiced_amount);
        const paidAmount = Number(project.paid_amount);
        const grossProfit = contractAmount - totalCost;
        const profitMargin =
          contractAmount > 0 ? (grossProfit / contractAmount) * 100 : 0;
        const outstandingAr = invoicedAmount - paidAmount;

        return {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          project_id: project.id,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          project_no: project.project_no,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          project_name: project.name,
           
          contract_amount: contractAmount,
          base_contract_amount: Number(project.base_contract_amount),
          change_order_amount: Number(project.change_order_amount),
           
          total_contract: contractAmount, // Alias for contract_amount (base + change orders)
          total_cost: totalCost,
          invoiced_amount: invoicedAmount,
          paid_amount: paidAmount,
          gross_profit: grossProfit,
          profit_margin: Number(profitMargin.toFixed(2)),
          outstanding_ar: outstandingAr,
        };
      });

      // If single project requested, return object instead of array
      if (query.project_id) {
        res.status(200).json(successResponse(results[0]));
      } else {
        res.status(200).json(successResponse(results));
      }
    } catch (error) {
      if (error instanceof ZodError) {
        res
          .status(400)
          .json(errorResponse('VALIDATION_ERROR', 'Invalid query parameters', 
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
            (error as any).errors));
        return;
      }

      console.error('Error fetching profit & loss report:', error);
      res
        .status(500)
        .json(errorResponse('INTERNAL_ERROR', 'Failed to fetch profit & loss report'));
    }
  }
);

export default router;
