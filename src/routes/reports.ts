import { Router, Request, Response } from 'express';
import { createServerClient } from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { requireRole } from '@/middleware/requireRole.js';
import { reportQuerySchema, dateRangeSchema } from '@/validations/reports.js';
import { ZodError } from 'zod';

const router = Router();

/**
 * GET /api/reports/projects
 * Project list with financial summary
 * OFFICE/ADMIN: full access
 * TECH: denied (403)
 */
router.get(
  '/api/reports/projects',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supabase = createServerClient();

      // Validate query params
      let queryParams;
      try {
        queryParams = reportQuerySchema.parse(req.query);
      } catch (error) {
        if (error instanceof ZodError) {
          res.status(400).json(
            errorResponse('VALIDATION_ERROR', 'Invalid query parameters', error.issues)
          );
          return;
        }
        throw error;
      }

      // Build query
      let query = supabase
        .from('projects')
        .select('id, project_no, name, status, customer_id, contract_amount, invoiced_amount, paid_amount, total_cost');

      // Apply filters
      if (queryParams.customer_id) {
        query = query.eq('customer_id', queryParams.customer_id);
      }
      if (queryParams.status) {
        query = query.eq('status', queryParams.status);
      }

      const { data: projects, error } = await query.order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching projects:', error);
        res.status(500).json(
          errorResponse('INTERNAL_ERROR', 'Failed to fetch projects')
        );
        return;
      }

      // Calculate margin for each project
      const projectsWithMargin = projects?.map((project) => {
        const contractAmount = Number(project.contract_amount || 0);
        const totalCost = Number(project.total_cost || 0);
        const margin = contractAmount - totalCost;
        const marginPercent = contractAmount > 0 ? (margin / contractAmount) * 100 : 0;

        return {
          ...project,
          margin,
          margin_percent: Math.round(marginPercent * 100) / 100,
        };
      });

      res.json(successResponse(projectsWithMargin || []));
    } catch (error) {
      console.error('Error fetching projects report:', error);
      res.status(500).json(
        errorResponse('INTERNAL_ERROR', 'Failed to fetch projects report')
      );
    }
  }
);

/**
 * GET /api/reports/projects/:id/summary
 * Single project financial summary
 * OFFICE/ADMIN: full access
 * TECH: denied (403)
 */
router.get(
  '/api/reports/projects/:id/summary',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supabase = createServerClient();
      const { id } = req.params;

      // Get project details
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id, project_no, name, status, contract_amount, base_contract_amount, change_order_amount')
        .eq('id', id)
        .single();

      if (projectError || !project) {
        res.status(404).json(
          errorResponse('NOT_FOUND', 'Project not found')
        );
        return;
      }

      // Get invoice summary
      const { data: invoices } = await supabase
        .from('invoices')
        .select('status, total_amount')
        .eq('project_id', id);

      let invoicedAmount = 0;
      let paidAmount = 0;
      let outstandingAmount = 0;

      invoices?.forEach((inv) => {
        const amount = Number(inv.total_amount || 0);
        if (inv.status === 'SENT' || inv.status === 'PAID') {
          invoicedAmount += amount;
        }
        if (inv.status === 'PAID') {
          paidAmount += amount;
        } else if (inv.status === 'SENT') {
          outstandingAmount += amount;
        }
      });

      // Get job cost summary
      const { data: jobCosts } = await supabase
        .from('job_cost_entries')
        .select('amount')
        .eq('project_id', id);

      const totalCost = jobCosts?.reduce((sum, entry) => sum + Number(entry.amount || 0), 0) || 0;

      const contractAmount = Number(project.contract_amount || 0);
      const margin = contractAmount - totalCost;
      const marginPercent = contractAmount > 0 ? (margin / contractAmount) * 100 : 0;

      res.json(
        successResponse({
          project_id: String(project.id),
          project_no: String(project.project_no),
          project_name: String(project.name),
          status: String(project.status),
          contract_amount: contractAmount,
          base_contract_amount: Number(project.base_contract_amount || 0),
          change_order_amount: Number(project.change_order_amount || 0),
          invoiced_amount: invoicedAmount,
          paid_amount: paidAmount,
          outstanding_amount: outstandingAmount,
          total_cost: totalCost,
          margin,
          margin_percent: Math.round(marginPercent * 100) / 100,
        })
      );
    } catch (error) {
      console.error('Error fetching project summary:', error);
      res.status(500).json(
        errorResponse('INTERNAL_ERROR', 'Failed to fetch project summary')
      );
    }
  }
);

/**
 * GET /api/reports/projects/:id/job-cost
 * Detailed job cost breakdown by cost type and code
 * OFFICE/ADMIN: full access
 * TECH: denied (403)
 */
router.get(
  '/api/reports/projects/:id/job-cost',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supabase = createServerClient();
      const { id } = req.params;

      // Get project details
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id, project_no, name, contract_amount')
        .eq('id', id)
        .single();

      if (projectError || !project) {
        res.status(404).json(
          errorResponse('NOT_FOUND', 'Project not found')
        );
        return;
      }

      // Get job cost entries with cost type and code info
      const { data: entries, error: entriesError } = await supabase
        .from('job_cost_entries')
        .select(`
          id,
          txn_date,
          qty,
          unit_cost,
          amount,
          description,
          cost_type_id,
          cost_code_id,
          cost_types:cost_type_id (id, code, name),
          cost_codes:cost_code_id (id, code, name)
        `)
        .eq('project_id', id)
        .order('txn_date', { ascending: false });

      if (entriesError) {
        console.error('Error fetching job cost entries:', entriesError);
        res.status(500).json(
          errorResponse('INTERNAL_ERROR', 'Failed to fetch job cost entries')
        );
        return;
      }

      // Group by cost type and cost code
      const costTypeMap = new Map<string, {
        cost_type: string;
        cost_type_name: string;
        codes: Map<string, {
          cost_code: string;
          cost_code_name: string;
          total_qty: number;
          total_amount: number;
          entries: Array<{
            id: string;
            txn_date: string;
            qty: number;
            unit_cost: number;
            amount: number;
            description: string | null;
          }>;
        }>;
        subtotal: number;
      }>();

      interface CostTypeData { id: string; code: string; name: string }
      interface CostCodeData { id: string; code: string; name: string }

      entries?.forEach((entry) => {
        // Supabase returns arrays for foreign key selects, take first element
        const costTypeArray = entry.cost_types as unknown as CostTypeData[] | null;
        const costCodeArray = entry.cost_codes as unknown as CostCodeData[] | null;
        const costType = costTypeArray && costTypeArray.length > 0 ? costTypeArray[0] : null;
        const costCode = costCodeArray && costCodeArray.length > 0 ? costCodeArray[0] : null;
        
        const costTypeKey = costType?.id || 'unknown';
        const costCodeKey = costCode?.id || 'unknown';

        if (!costTypeMap.has(costTypeKey)) {
          costTypeMap.set(costTypeKey, {
            cost_type: costType?.code || 'Unknown',
            cost_type_name: costType?.name || 'Unknown',
            codes: new Map(),
            subtotal: 0,
          });
        }

        const costTypeData = costTypeMap.get(costTypeKey)!;

        if (!costTypeData.codes.has(costCodeKey)) {
          costTypeData.codes.set(costCodeKey, {
            cost_code: costCode?.code || 'Unknown',
            cost_code_name: costCode?.name || 'Unknown',
            total_qty: 0,
            total_amount: 0,
            entries: [],
          });
        }

        const costCodeData = costTypeData.codes.get(costCodeKey)!;
        const amount = Number(entry.amount || 0);
        const qty = Number(entry.qty || 0);

        costCodeData.total_qty += qty;
        costCodeData.total_amount += amount;
        costCodeData.entries.push({
          id: String(entry.id),
          txn_date: String(entry.txn_date),
          qty: Number(entry.qty),
          unit_cost: Number(entry.unit_cost),
          amount: Number(entry.amount),
          description: entry.description ? String(entry.description) : null,
        });

        costTypeData.subtotal += amount;
      });

      // Convert to array format
      const costBreakdown = Array.from(costTypeMap.values()).map((typeData) => ({
        cost_type: typeData.cost_type,
        cost_type_name: typeData.cost_type_name,
        codes: Array.from(typeData.codes.values()),
        subtotal: typeData.subtotal,
      }));

      const totalCost = costBreakdown.reduce((sum, type) => sum + type.subtotal, 0);
      const contractAmount = Number(project.contract_amount || 0);
      const margin = contractAmount - totalCost;
      const marginPercent = contractAmount > 0 ? (margin / contractAmount) * 100 : 0;

      res.json(
        successResponse({
          project_id: String(project.id),
          project_name: String(project.name),
          contract_amount: contractAmount,
          total_cost: totalCost,
          margin,
          margin_percent: Math.round(marginPercent * 100) / 100,
          cost_breakdown: costBreakdown,
        })
      );
    } catch (error) {
      console.error('Error fetching job cost breakdown:', error);
      res.status(500).json(
        errorResponse('INTERNAL_ERROR', 'Failed to fetch job cost breakdown')
      );
    }
  }
);

/**
 * GET /api/reports/work-orders
 * Work order list with metrics
 * OFFICE/ADMIN: full access
 * TECH: can only see their assigned work orders
 */
router.get(
  '/api/reports/work-orders',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supabase = createServerClient();

      // Validate query params
      let queryParams;
      try {
        queryParams = reportQuerySchema.parse(req.query);
      } catch (error) {
        if (error instanceof ZodError) {
          res.status(400).json(
            errorResponse('VALIDATION_ERROR', 'Invalid query parameters', error.issues)
          );
          return;
        }
        throw error;
      }

      // Build query
      let query = supabase
        .from('work_orders')
        .select('id, work_order_no, customer_id, status, priority, assigned_to, opened_at, completed_at, closed_at, contract_total');

      // Apply role-based filtering
      if (req.employee?.role === 'TECH') {
        // TECH can only see their assigned work orders
        query = query.eq('assigned_to', req.employee.id);
      }

      // Apply filters
      if (queryParams.customer_id) {
        query = query.eq('customer_id', queryParams.customer_id);
      }
      if (queryParams.status) {
        query = query.eq('status', queryParams.status);
      }
      if (queryParams.tech_id && req.employee?.role !== 'TECH') {
        query = query.eq('assigned_to', queryParams.tech_id);
      }
      if (queryParams.date_from) {
        query = query.gte('opened_at', queryParams.date_from);
      }
      if (queryParams.date_to) {
        query = query.lte('opened_at', queryParams.date_to);
      }

      const { data: workOrders, error } = await query.order('opened_at', { ascending: false });

      if (error) {
        console.error('Error fetching work orders:', error);
        res.status(500).json(
          errorResponse('INTERNAL_ERROR', 'Failed to fetch work orders')
        );
        return;
      }

      // Calculate metrics for each work order
      const workOrdersWithMetrics = await Promise.all(
        (workOrders || []).map(async (wo) => {
          // Calculate total hours
          const { data: timeEntries } = await supabase
            .from('work_order_time_entries')
            .select('clock_in_at, clock_out_at, break_minutes')
            .eq('work_order_id', wo.id);

          let totalHours = 0;
          timeEntries?.forEach((entry) => {
            if (entry.clock_in_at && entry.clock_out_at) {
              const clockIn = new Date(String(entry.clock_in_at)).getTime();
              const clockOut = new Date(String(entry.clock_out_at)).getTime();
              const minutes = (clockOut - clockIn) / (1000 * 60) - (entry.break_minutes || 0);
              totalHours += minutes / 60;
            }
          });

          // Calculate total cost
          const { data: costs } = await supabase
            .from('job_cost_entries')
            .select('amount')
            .eq('work_order_id', wo.id);

          const totalCost = costs?.reduce((sum, c) => sum + Number(c.amount || 0), 0) || 0;

          return {
            ...wo,
            total_hours: Math.round(totalHours * 100) / 100,
            total_cost: totalCost,
          };
        })
      );

      res.json(successResponse(workOrdersWithMetrics));
    } catch (error) {
      console.error('Error fetching work orders report:', error);
      res.status(500).json(
        errorResponse('INTERNAL_ERROR', 'Failed to fetch work orders report')
      );
    }
  }
);

/**
 * GET /api/reports/work-orders/:id/cost-summary
 * Work order cost summary
 * OFFICE/ADMIN: full access
 * TECH: can only view their assigned work orders
 */
router.get(
  '/api/reports/work-orders/:id/cost-summary',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supabase = createServerClient();
      const { id } = req.params;

      // Get work order details
      const { data: workOrder, error: woError } = await supabase
        .from('work_orders')
        .select('id, work_order_no, status, assigned_to, contract_total')
        .eq('id', id)
        .single();

      if (woError || !workOrder) {
        res.status(404).json(
          errorResponse('NOT_FOUND', 'Work order not found')
        );
        return;
      }

      // Check access for TECH role
      if (req.employee?.role === 'TECH' && workOrder.assigned_to !== req.employee.id) {
        res.status(403).json(
          errorResponse('FORBIDDEN', 'Access denied')
        );
        return;
      }

      // Get job cost entries
      const { data: costs } = await supabase
        .from('job_cost_entries')
        .select('amount, cost_type_id, cost_types:cost_type_id (code, name)')
        .eq('work_order_id', id);

      // Group by cost type
      interface CostTypeInfo { code: string; name: string }
      const costByType = new Map<string, { type_name: string; total: number }>();
      costs?.forEach((cost) => {
        // Supabase returns arrays for foreign key selects, take first element
        const costTypeArray = cost.cost_types as unknown as CostTypeInfo[] | null;
        const costType = costTypeArray && costTypeArray.length > 0 ? costTypeArray[0] : null;
        const typeKey = costType?.code || 'Unknown';
        const typeName = costType?.name || 'Unknown';
        const amount = Number(cost.amount || 0);

        if (!costByType.has(typeKey)) {
          costByType.set(typeKey, { type_name: typeName, total: 0 });
        }
        costByType.get(typeKey)!.total += amount;
      });

      const totalCost = Array.from(costByType.values()).reduce((sum, ct) => sum + ct.total, 0);

      // Get time entries
      const { data: timeEntries } = await supabase
        .from('work_order_time_entries')
        .select('clock_in_at, clock_out_at, break_minutes')
        .eq('work_order_id', id);

      let totalHours = 0;
      timeEntries?.forEach((entry) => {
        if (entry.clock_in_at && entry.clock_out_at) {
          const clockIn = new Date(String(entry.clock_in_at)).getTime();
          const clockOut = new Date(String(entry.clock_out_at)).getTime();
          const minutes = (clockOut - clockIn) / (1000 * 60) - (entry.break_minutes || 0);
          totalHours += minutes / 60;
        }
      });

      res.json(
        successResponse({
          work_order_id: String(workOrder.id),
          work_order_no: String(workOrder.work_order_no),
          status: String(workOrder.status),
          contract_total: Number(workOrder.contract_total || 0),
          total_cost: totalCost,
          total_hours: Math.round(totalHours * 100) / 100,
          cost_by_type: Array.from(costByType.entries()).map(([type, data]) => ({
            cost_type: type,
            type_name: data.type_name,
            total: data.total,
          })),
        })
      );
    } catch (error) {
      console.error('Error fetching work order cost summary:', error);
      res.status(500).json(
        errorResponse('INTERNAL_ERROR', 'Failed to fetch work order cost summary')
      );
    }
  }
);

/**
 * GET /api/reports/tech-productivity
 * Tech hours worked, jobs completed
 * Query params: date_from, date_to (required or defaults to current month)
 * OFFICE/ADMIN: full access
 * TECH: can only view their own productivity
 */
router.get(
  '/api/reports/tech-productivity',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supabase = createServerClient();

      // Validate query params
      let queryParams;
      try {
        queryParams = dateRangeSchema.parse(req.query);
      } catch (error) {
        if (error instanceof ZodError) {
          res.status(400).json(
            errorResponse('VALIDATION_ERROR', 'Invalid query parameters', error.issues)
          );
          return;
        }
        throw error;
      }

      // Default to current month if no dates provided
      const now = new Date();
      const dateFrom = queryParams.date_from || new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const dateTo = queryParams.date_to || new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

      // Get techs based on role
      let techQuery = supabase
        .from('employees')
        .select('id, display_name')
        .eq('role', 'TECH')
        .eq('is_active', true);

      // If TECH role, only show their own data
      if (req.employee?.role === 'TECH') {
        techQuery = techQuery.eq('id', req.employee.id);
      }

      const { data: techs } = await techQuery;

      if (!techs || techs.length === 0) {
        res.json(successResponse([]));
        return;
      }

      // Calculate productivity for each tech
      const productivity = await Promise.all(
        techs.map(async (tech) => {
          // Get time entries
          const { data: timeEntries } = await supabase
            .from('work_order_time_entries')
            .select('clock_in_at, clock_out_at, break_minutes, work_order_id')
            .eq('tech_user_id', tech.id)
            .gte('clock_in_at', dateFrom)
            .lte('clock_in_at', dateTo);

          let totalHours = 0;
          let billableHours = 0;
          const workOrderIds = new Set<string>();

          timeEntries?.forEach((entry) => {
            if (entry.clock_in_at && entry.clock_out_at) {
              const clockIn = new Date(String(entry.clock_in_at)).getTime();
              const clockOut = new Date(String(entry.clock_out_at)).getTime();
              const minutes = (clockOut - clockIn) / (1000 * 60) - (entry.break_minutes || 0);
              const hours = minutes / 60;
              totalHours += hours;
              billableHours += hours; // Assuming all hours are billable; adjust as needed
              if (entry.work_order_id) {
                workOrderIds.add(String(entry.work_order_id));
              }
            }
          });

          // Get completed work orders
          const { count: completedCount } = await supabase
            .from('work_orders')
            .select('*', { count: 'exact', head: true })
            .eq('assigned_to', tech.id)
            .eq('status', 'COMPLETED')
            .gte('completed_at', dateFrom)
            .lte('completed_at', dateTo);

          // Calculate average completion time
          const { data: completedWOs } = await supabase
            .from('work_orders')
            .select('opened_at, completed_at')
            .eq('assigned_to', tech.id)
            .eq('status', 'COMPLETED')
            .gte('completed_at', dateFrom)
            .lte('completed_at', dateTo)
            .not('completed_at', 'is', null);

          let avgCompletionTime = 0;
          if (completedWOs && completedWOs.length > 0) {
            const totalCompletionHours = completedWOs.reduce((sum, wo) => {
              if (wo.opened_at && wo.completed_at) {
                const opened = new Date(String(wo.opened_at)).getTime();
                const completed = new Date(String(wo.completed_at)).getTime();
                return sum + (completed - opened) / (1000 * 60 * 60);
              }
              return sum;
            }, 0);
            avgCompletionTime = totalCompletionHours / completedWOs.length;
          }

          return {
            tech_id: String(tech.id),
            tech_name: String(tech.display_name),
            total_hours: Math.round(totalHours * 100) / 100,
            billable_hours: Math.round(billableHours * 100) / 100,
            work_orders_completed: completedCount || 0,
            avg_completion_time: Math.round(avgCompletionTime * 100) / 100,
          };
        })
      );

      res.json(successResponse(productivity));
    } catch (error) {
      console.error('Error fetching tech productivity:', error);
      res.status(500).json(
        errorResponse('INTERNAL_ERROR', 'Failed to fetch tech productivity')
      );
    }
  }
);

/**
 * GET /api/reports/tech-productivity/:id
 * Individual tech productivity report
 * OFFICE/ADMIN: full access
 * TECH: can only view their own
 */
router.get(
  '/api/reports/tech-productivity/:id',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supabase = createServerClient();
      const { id } = req.params;

      // Check access for TECH role
      if (req.employee?.role === 'TECH' && req.employee.id !== id) {
        res.status(403).json(
          errorResponse('FORBIDDEN', 'Access denied')
        );
        return;
      }

      // Validate query params
      let queryParams;
      try {
        queryParams = dateRangeSchema.parse(req.query);
      } catch (error) {
        if (error instanceof ZodError) {
          res.status(400).json(
            errorResponse('VALIDATION_ERROR', 'Invalid query parameters', error.issues)
          );
          return;
        }
        throw error;
      }

      // Default to current month if no dates provided
      const now = new Date();
      const dateFrom = queryParams.date_from || new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const dateTo = queryParams.date_to || new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

      // Get tech info
      const { data: tech, error: techError } = await supabase
        .from('employees')
        .select('id, display_name, role')
        .eq('id', id)
        .single();

      if (techError || !tech || tech.role !== 'TECH') {
        res.status(404).json(
          errorResponse('NOT_FOUND', 'Technician not found')
        );
        return;
      }

      // Get time entries
      const { data: timeEntries } = await supabase
        .from('work_order_time_entries')
        .select('clock_in_at, clock_out_at, break_minutes, work_order_id')
        .eq('tech_user_id', id)
        .gte('clock_in_at', dateFrom)
        .lte('clock_in_at', dateTo);

      let totalHours = 0;
      let billableHours = 0;

      timeEntries?.forEach((entry) => {
        if (entry.clock_in_at && entry.clock_out_at) {
          const clockIn = new Date(String(entry.clock_in_at)).getTime();
          const clockOut = new Date(String(entry.clock_out_at)).getTime();
          const minutes = (clockOut - clockIn) / (1000 * 60) - (entry.break_minutes || 0);
          const hours = minutes / 60;
          totalHours += hours;
          billableHours += hours;
        }
      });

      // Get completed work orders
      const { count: completedCount } = await supabase
        .from('work_orders')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to', id)
        .eq('status', 'COMPLETED')
        .gte('completed_at', dateFrom)
        .lte('completed_at', dateTo);

      // Calculate average completion time
      const { data: completedWOs } = await supabase
        .from('work_orders')
        .select('opened_at, completed_at')
        .eq('assigned_to', id)
        .eq('status', 'COMPLETED')
        .gte('completed_at', dateFrom)
        .lte('completed_at', dateTo)
        .not('completed_at', 'is', null);

      let avgCompletionTime = 0;
      if (completedWOs && completedWOs.length > 0) {
        const totalCompletionHours = completedWOs.reduce((sum, wo) => {
          if (wo.opened_at && wo.completed_at) {
            const opened = new Date(String(wo.opened_at)).getTime();
            const completed = new Date(String(wo.completed_at)).getTime();
            return sum + (completed - opened) / (1000 * 60 * 60);
          }
          return sum;
        }, 0);
        avgCompletionTime = totalCompletionHours / completedWOs.length;
      }

      res.json(
        successResponse({
          tech_id: String(tech.id),
          tech_name: String(tech.display_name),
          total_hours: Math.round(totalHours * 100) / 100,
          billable_hours: Math.round(billableHours * 100) / 100,
          work_orders_completed: completedCount || 0,
          avg_completion_time: Math.round(avgCompletionTime * 100) / 100,
        })
      );
    } catch (error) {
      console.error('Error fetching tech productivity:', error);
      res.status(500).json(
        errorResponse('INTERNAL_ERROR', 'Failed to fetch tech productivity')
      );
    }
  }
);

/**
 * GET /api/reports/revenue-by-period
 * Revenue grouped by month/week/day
 * Query params: date_from, date_to, group_by
 * OFFICE/ADMIN: full access
 * TECH: denied (403)
 */
router.get(
  '/api/reports/revenue-by-period',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supabase = createServerClient();

      // Validate query params
      let queryParams;
      try {
        queryParams = reportQuerySchema.parse(req.query);
      } catch (error) {
        if (error instanceof ZodError) {
          res.status(400).json(
            errorResponse('VALIDATION_ERROR', 'Invalid query parameters', error.issues)
          );
          return;
        }
        throw error;
      }

      const groupBy = queryParams.group_by || 'month';

      // Default to last 12 months if no dates provided
      const now = new Date();
      const dateFrom = queryParams.date_from || new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString();
      const dateTo = queryParams.date_to || now.toISOString();

      // Get all invoices in the period
      const { data: invoices } = await supabase
        .from('invoices')
        .select('invoice_date, paid_at, status, total_amount')
        .gte('invoice_date', dateFrom)
        .lte('invoice_date', dateTo)
        .in('status', ['SENT', 'PAID']);

      // Group by period
      const revenueByPeriod = new Map<string, { invoiced: number; paid: number; outstanding: number }>();

      const getGroupKey = (date: Date): string => {
        switch (groupBy) {
          case 'day':
            return date.toISOString().split('T')[0];
          case 'week': {
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            return weekStart.toISOString().split('T')[0];
          }
          case 'month':
          default:
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }
      };

      invoices?.forEach((inv) => {
        const invoiceDate = new Date(String(inv.invoice_date));
        const key = getGroupKey(invoiceDate);
        const amount = Number(inv.total_amount || 0);

        if (!revenueByPeriod.has(key)) {
          revenueByPeriod.set(key, { invoiced: 0, paid: 0, outstanding: 0 });
        }

        const periodData = revenueByPeriod.get(key)!;
        periodData.invoiced += amount;

        if (inv.status === 'PAID') {
          periodData.paid += amount;
        } else if (inv.status === 'SENT') {
          periodData.outstanding += amount;
        }
      });

      // Convert to array and sort
      const result = Array.from(revenueByPeriod.entries())
        .map(([period, data]) => ({
          period,
          ...data,
        }))
        .sort((a, b) => a.period.localeCompare(b.period));

      res.json(successResponse(result));
    } catch (error) {
      console.error('Error fetching revenue by period:', error);
      res.status(500).json(
        errorResponse('INTERNAL_ERROR', 'Failed to fetch revenue by period')
      );
    }
  }
);

/**
 * GET /api/reports/aging
 * Invoice aging report (current, 30, 60, 90+ days)
 * OFFICE/ADMIN: full access
 * TECH: denied (403)
 */
router.get(
  '/api/reports/aging',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const supabase = createServerClient();

      // Get all SENT invoices (unpaid)
      const { data: invoices } = await supabase
        .from('invoices')
        .select('due_date, total_amount')
        .eq('status', 'SENT');

      const now = new Date();
      const aging = {
        current: { count: 0, amount: 0 },
        days_30: { count: 0, amount: 0 },
        days_60: { count: 0, amount: 0 },
        days_90_plus: { count: 0, amount: 0 },
        total_outstanding: 0,
      };

      invoices?.forEach((inv) => {
        const amount = Number(inv.total_amount || 0);
        aging.total_outstanding += amount;

        if (!inv.due_date) {
          // No due date = current
          aging.current.count++;
          aging.current.amount += amount;
          return;
        }

        const dueDate = new Date(String(inv.due_date));
        const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysOverdue < 0) {
          // Not yet due
          aging.current.count++;
          aging.current.amount += amount;
        } else if (daysOverdue < 30) {
          aging.days_30.count++;
          aging.days_30.amount += amount;
        } else if (daysOverdue < 60) {
          aging.days_60.count++;
          aging.days_60.amount += amount;
        } else {
          aging.days_90_plus.count++;
          aging.days_90_plus.amount += amount;
        }
      });

      res.json(successResponse(aging));
    } catch (error) {
      console.error('Error fetching aging report:', error);
      res.status(500).json(
        errorResponse('INTERNAL_ERROR', 'Failed to fetch aging report')
      );
    }
  }
);

export default router;
