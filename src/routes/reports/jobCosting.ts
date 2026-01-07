import { Router, Request, Response } from 'express';
import { createServerClient } from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { jobCostingQuerySchema } from '@/validations/reports.js';
import { ZodError } from 'zod';

const router = Router();

/**
 * Helper function to check if tech has access to work order
 */
async function techHasAccessToWorkOrder(
  supabase: ReturnType<typeof createServerClient>,
  workOrderId: string,
  techUserId: string
): Promise<boolean> {
  // Check if work order is assigned to tech
  const { data: workOrder } = await supabase
    .from('work_orders')
    .select('assigned_to')
    .eq('id', workOrderId)
    .single();

  if (workOrder && workOrder.assigned_to === techUserId) {
    return true;
  }

  // Check if tech is scheduled for work order
  const { data: scheduleData } = await supabase
    .from('work_order_schedule')
    .select('id')
    .eq('work_order_id', workOrderId)
    .eq('tech_user_id', techUserId)
    .limit(1);

  return scheduleData !== null && scheduleData.length > 0;
}

/**
 * GET /api/reports/job-costing
 * Aggregate costs by project/work order
 * TECH role: can only see work orders assigned to them or scheduled for them
 * OFFICE/ADMIN: can see all data
 */
router.get(
  '/api/reports/job-costing',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate query parameters
      const query = jobCostingQuerySchema.parse(req.query);
      const supabase = createServerClient();

      // TECH role: if work_order_id specified, verify access
      if (
        req.employee!.role === 'TECH' &&
        query.work_order_id
      ) {
        const hasAccess = await techHasAccessToWorkOrder(
          supabase,
          query.work_order_id,
          req.employee!.id
        );

        if (!hasAccess) {
          res
            .status(403)
            .json(
              errorResponse(
                'FORBIDDEN',
                'You do not have access to this work order'
              )
            );
          return;
        }
      }

      // Build the query based on group_by parameter
      const groupBy = query.group_by || 'cost_type';

      // Start with base query
      let dbQuery = supabase
        .from('job_cost_entries')
        .select(
          `
          project_id,
          work_order_id,
          cost_type_id,
          cost_types!inner(id, name),
          cost_code_id,
          cost_codes!inner(id, name),
          qty,
          amount
        `,
          { count: 'exact' }
        );

      // Apply filters
      if (query.project_id) {
        dbQuery = dbQuery.eq('project_id', query.project_id);
      }

      if (query.work_order_id) {
        dbQuery = dbQuery.eq('work_order_id', query.work_order_id);
      }

      if (query.start_date) {
        dbQuery = dbQuery.gte('txn_date', query.start_date);
      }

      if (query.end_date) {
        dbQuery = dbQuery.lte('txn_date', query.end_date);
      }

      // For TECH role without specific work_order_id, filter to their work orders
      if (req.employee!.role === 'TECH' && !query.work_order_id) {
        // Get work orders assigned to or scheduled for this tech
        const { data: assignedWorkOrders } = await supabase
          .from('work_orders')
          .select('id')
          .eq('assigned_to', req.employee!.id);

        const { data: scheduledWorkOrders } = await supabase
          .from('work_order_schedule')
          .select('work_order_id')
          .eq('tech_user_id', req.employee!.id);

        const workOrderIds = new Set<string>();
        
        if (assignedWorkOrders) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          assignedWorkOrders.forEach((wo) => workOrderIds.add(wo.id));
        }
        
        if (scheduledWorkOrders) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          scheduledWorkOrders.forEach((wo) => workOrderIds.add(wo.work_order_id));
        }

        if (workOrderIds.size > 0) {
          dbQuery = dbQuery.in('work_order_id', Array.from(workOrderIds));
        } else {
          // No accessible work orders, return empty result
          res.status(200).json(
            successResponse({
              project_id: query.project_id,
              work_order_id: query.work_order_id,
              total_cost: 0,
              breakdown: [],
            })
          );
          return;
        }
      }

      const { data: entries, error } = await dbQuery;

      if (error) {
        throw error;
      }

      if (!entries || entries.length === 0) {
        res.status(200).json(
          successResponse({
            project_id: query.project_id,
            work_order_id: query.work_order_id,
            total_cost: 0,
            breakdown: [],
          })
        );
        return;
      }

      // Aggregate data based on group_by parameter
      const aggregationMap = new Map<
        string,
        {
          cost_type_id: string;
          cost_type_name: string;
          cost_code_id?: string;
          cost_code_name?: string;
          total: number;
          qty: number;
        }
      >();

      let totalCost = 0;

      for (const entry of entries) {
        totalCost += Number(entry.amount);

        let key: string;
        let groupData: {
          cost_type_id: string;
          cost_type_name: string;
          cost_code_id?: string;
          cost_code_name?: string;
          total: number;
          qty: number;
        };

        if (groupBy === 'cost_code') {
          key = `${entry.cost_type_id}-${entry.cost_code_id}`;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
          const costTypeName = (entry.cost_types as any).name;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
          const costCodeName = (entry.cost_codes as any).name;
          groupData = {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            cost_type_id: entry.cost_type_id,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            cost_type_name: costTypeName,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            cost_code_id: entry.cost_code_id,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            cost_code_name: costCodeName,
            total: 0,
            qty: 0,
          };
        } else if (groupBy === 'cost_type') {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          key = entry.cost_type_id;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
          const costTypeName = (entry.cost_types as any).name;
          groupData = {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            cost_type_id: entry.cost_type_id,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            cost_type_name: costTypeName,
            total: 0,
            qty: 0,
          };
        } else {
          // group_by === 'none'
          key = 'all';
          groupData = {
            cost_type_id: '',
            cost_type_name: 'All Costs',
            total: 0,
            qty: 0,
          };
        }

        if (aggregationMap.has(key)) {
          const existing = aggregationMap.get(key)!;
          existing.total += Number(entry.amount);
          existing.qty += Number(entry.qty);
        } else {
          groupData.total = Number(entry.amount);
          groupData.qty = Number(entry.qty);
          aggregationMap.set(key, groupData);
        }
      }

      const breakdown = Array.from(aggregationMap.values());

      res.status(200).json(
        successResponse({
          project_id: query.project_id,
          work_order_id: query.work_order_id,
          total_cost: totalCost,
          breakdown,
        })
      );
    } catch (error) {
      if (error instanceof ZodError) {
        res
          .status(400)
          .json(errorResponse('VALIDATION_ERROR', 'Invalid query parameters', 
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
            (error as any).errors));
        return;
      }

      console.error('Error fetching job costing report:', error);
      res
        .status(500)
        .json(errorResponse('INTERNAL_ERROR', 'Failed to fetch job costing report'));
    }
  }
);

export default router;
