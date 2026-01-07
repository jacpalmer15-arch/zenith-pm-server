import { Router, Request, Response } from 'express';
import { createServerClient } from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { jobCostDetailQuerySchema } from '@/validations/reports.js';
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
 * Helper function to check if tech has access to project via any work order
 */
async function techHasAccessToProject(
  supabase: ReturnType<typeof createServerClient>,
  projectId: string,
  techUserId: string
): Promise<boolean> {
  // Get work orders for this project
  const { data: workOrders } = await supabase
    .from('work_orders')
    .select('id')
    .eq('project_id', projectId);

  if (!workOrders || workOrders.length === 0) {
    return false;
  }

  // Check if tech has access to any work order
  for (const wo of workOrders) {
    const hasAccess = await techHasAccessToWorkOrder(
      supabase,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      wo.id,
      techUserId
    );
    if (hasAccess) {
      return true;
    }
  }

  return false;
}

/**
 * GET /api/reports/job-cost-detail
 * Detailed line-item cost report
 * TECH role: can only see work orders assigned to them or scheduled for them
 * OFFICE/ADMIN: can see all data
 */
router.get(
  '/api/reports/job-cost-detail',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate query parameters
      const query = jobCostDetailQuerySchema.parse(req.query);
      const supabase = createServerClient();

      // TECH role: verify access to work order or project
      if (req.employee!.role === 'TECH') {
        if (query.work_order_id) {
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
        } else if (query.project_id) {
          const hasAccess = await techHasAccessToProject(
            supabase,
            query.project_id,
            req.employee!.id
          );

          if (!hasAccess) {
            res
              .status(403)
              .json(
                errorResponse(
                  'FORBIDDEN',
                  'You do not have access to this project'
                )
              );
            return;
          }
        }
      }

      // Pagination parameters
      const page = query.page || 1;
      const perPage = query.per_page || 50;
      const from = (page - 1) * perPage;
      const to = from + perPage - 1;

      // Build the query
      let dbQuery = supabase
        .from('job_cost_entries')
        .select(
          `
          id,
          txn_date,
          cost_type_id,
          cost_types!inner(name),
          cost_code_id,
          cost_codes!inner(name),
          part_id,
          parts(name),
          description,
          qty,
          unit_cost,
          amount,
          source_type,
          source_id
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

      if (query.cost_type_id) {
        dbQuery = dbQuery.eq('cost_type_id', query.cost_type_id);
      }

      if (query.cost_code_id) {
        dbQuery = dbQuery.eq('cost_code_id', query.cost_code_id);
      }

      // Apply pagination and ordering
      dbQuery = dbQuery
        .order('txn_date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to);

      const { data: entries, error, count } = await dbQuery;

      if (error) {
        throw error;
      }

      // Transform the data to match the response structure
      const transformedData = (entries || []).map((entry) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        const costTypeName = (entry.cost_types as any).name;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        const costCodeName = (entry.cost_codes as any).name;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        const partName = (entry.parts as any)?.name || null;
        
        return {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          id: entry.id,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          txn_date: entry.txn_date,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          cost_type_name: costTypeName,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          cost_code_name: costCodeName,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          part_name: partName,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          description: entry.description,
           
          qty: Number(entry.qty),
           
          unit_cost: Number(entry.unit_cost),
           
          amount: Number(entry.amount),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          source_type: entry.source_type,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          source_id: entry.source_id,
        };
      });

      res.status(200).json(
        successResponse({
          data: transformedData,
          total: count || 0,
          page,
          per_page: perPage,
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

      console.error('Error fetching job cost detail report:', error);
      res
        .status(500)
        .json(errorResponse('INTERNAL_ERROR', 'Failed to fetch job cost detail report'));
    }
  }
);

export default router;
