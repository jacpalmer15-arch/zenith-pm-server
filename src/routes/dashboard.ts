import { Router, Request, Response } from 'express';
import { createServerClient } from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { requireRole } from '@/middleware/requireRole.js';
import { dashboardQuerySchema } from '@/validations/reports.js';
import { ZodError } from 'zod';

const router = Router();

/**
 * GET /api/dashboard/summary
 * High-level KPIs for the business
 * OFFICE/ADMIN: full access
 * TECH: denied (403)
 */
router.get(
  '/api/dashboard/summary',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const supabase = createServerClient();

      // Get active projects count
      const { count: activeProjects } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .in('status', ['Planning', 'InProgress']);

      // Get open work orders count
      const { count: openWorkOrders } = await supabase
        .from('work_orders')
        .select('*', { count: 'exact', head: true })
        .in('status', ['UNSCHEDULED', 'SCHEDULED', 'IN_PROGRESS']);

      // Get unscheduled work orders count
      const { count: unscheduledWorkOrders } = await supabase
        .from('work_orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'UNSCHEDULED');

      // Get pending invoices count (DRAFT or SENT status)
      const { count: pendingInvoices } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .in('status', ['DRAFT', 'SENT']);

      // Get total outstanding (sum of SENT invoices)
      const { data: outstandingData } = await supabase
        .from('invoices')
        .select('total_amount')
        .eq('status', 'SENT');

      const totalOutstanding = outstandingData?.reduce(
        (sum, inv) => sum + Number(inv.total_amount || 0),
        0
      ) || 0;

      // Get revenue this month (sum of PAID invoices this month)
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const { data: paidInvoices } = await supabase
        .from('invoices')
        .select('total_amount')
        .eq('status', 'PAID')
        .gte('paid_at', monthStart)
        .lte('paid_at', monthEnd);

      const revenueThisMonth = paidInvoices?.reduce(
        (sum, inv) => sum + Number(inv.total_amount || 0),
        0
      ) || 0;

      // Get quotes pending (SENT quotes awaiting response)
      const { count: quotesPending } = await supabase
        .from('quotes')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'SENT');

      res.json(
        successResponse({
          active_projects: activeProjects || 0,
          open_work_orders: openWorkOrders || 0,
          unscheduled_work_orders: unscheduledWorkOrders || 0,
          pending_invoices: pendingInvoices || 0,
          total_outstanding: totalOutstanding,
          revenue_this_month: revenueThisMonth,
          quotes_pending: quotesPending || 0,
        })
      );
    } catch (error) {
      console.error('Error fetching dashboard summary:', error);
      res.status(500).json(
        errorResponse('INTERNAL_ERROR', 'Failed to fetch dashboard summary')
      );
    }
  }
);

/**
 * GET /api/dashboard/work-orders
 * Work order status breakdown
 * Query params: date_from, date_to (optional)
 * OFFICE/ADMIN: full access
 * TECH: can view (but sees all, not filtered by assignment)
 */
router.get(
  '/api/dashboard/work-orders',
  requireAuth,
  requireEmployee,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supabase = createServerClient();

      // Validate query params
      let queryParams;
      try {
        queryParams = dashboardQuerySchema.parse(req.query);
      } catch (error) {
        if (error instanceof ZodError) {
          res.status(400).json(
            errorResponse('VALIDATION_ERROR', 'Invalid query parameters', error.issues)
          );
          return;
        }
        throw error;
      }

      // Build base query
      let query = supabase.from('work_orders').select('status');

      // Apply date filters if provided
      if (queryParams.date_from) {
        query = query.gte('opened_at', queryParams.date_from);
      }
      if (queryParams.date_to) {
        query = query.lte('opened_at', queryParams.date_to);
      }

      const { data: workOrders, error } = await query;

      if (error) {
        console.error('Error fetching work orders:', error);
        res.status(500).json(
          errorResponse('INTERNAL_ERROR', 'Failed to fetch work orders')
        );
        return;
      }

      // Count by status
      const statusCounts = {
        unscheduled: 0,
        scheduled: 0,
        in_progress: 0,
        completed: 0,
        closed: 0,
        canceled: 0,
      };

      workOrders?.forEach((wo) => {
        const status = typeof wo.status === 'string' ? wo.status.toUpperCase() : '';
        if (status === 'UNSCHEDULED') statusCounts.unscheduled++;
        else if (status === 'SCHEDULED') statusCounts.scheduled++;
        else if (status === 'IN_PROGRESS') statusCounts.in_progress++;
        else if (status === 'COMPLETED') statusCounts.completed++;
        else if (status === 'CLOSED') statusCounts.closed++;
        else if (status === 'CANCELED') statusCounts.canceled++;
      });

      res.json(successResponse(statusCounts));
    } catch (error) {
      console.error('Error fetching work order dashboard:', error);
      res.status(500).json(
        errorResponse('INTERNAL_ERROR', 'Failed to fetch work order dashboard')
      );
    }
  }
);

/**
 * GET /api/dashboard/revenue
 * Revenue metrics by period
 * Query params: period ('week' | 'month' | 'quarter' | 'year')
 * OFFICE/ADMIN: full access
 * TECH: denied (403)
 */
router.get(
  '/api/dashboard/revenue',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supabase = createServerClient();

      // Validate query params
      let queryParams;
      try {
        queryParams = dashboardQuerySchema.parse(req.query);
      } catch (error) {
        if (error instanceof ZodError) {
          res.status(400).json(
            errorResponse('VALIDATION_ERROR', 'Invalid query parameters', error.issues)
          );
          return;
        }
        throw error;
      }

      const period = queryParams.period || 'month';
      const now = new Date();
      let startDate: Date;
      let periodLabel: string;

      // Calculate period start date and label
      switch (period) {
        case 'week':
          startDate = new Date(now);
          startDate.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
          startDate.setHours(0, 0, 0, 0);
          periodLabel = 'This Week';
          break;
        case 'quarter': {
          const quarter = Math.floor(now.getMonth() / 3);
          startDate = new Date(now.getFullYear(), quarter * 3, 1);
          periodLabel = `Q${quarter + 1} ${now.getFullYear()}`;
          break;
        }
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          periodLabel = `${now.getFullYear()}`;
          break;
        case 'month':
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          periodLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
          break;
      }

      // Get all invoices in the period
      const { data: invoices } = await supabase
        .from('invoices')
        .select('status, total_amount, paid_at')
        .gte('invoice_date', startDate.toISOString());

      let invoiced = 0;
      let paid = 0;
      let outstanding = 0;

      invoices?.forEach((inv) => {
        const amount = Number(inv.total_amount || 0);
        if (inv.status === 'SENT' || inv.status === 'PAID') {
          invoiced += amount;
        }
        if (inv.status === 'PAID') {
          paid += amount;
        } else if (inv.status === 'SENT') {
          outstanding += amount;
        }
      });

      res.json(
        successResponse({
          invoiced,
          paid,
          outstanding,
          period_label: periodLabel,
        })
      );
    } catch (error) {
      console.error('Error fetching revenue dashboard:', error);
      res.status(500).json(
        errorResponse('INTERNAL_ERROR', 'Failed to fetch revenue dashboard')
      );
    }
  }
);

/**
 * GET /api/dashboard/tech-workload
 * Technician current assignments
 * OFFICE/ADMIN: full access
 * TECH: denied (403)
 */
router.get(
  '/api/dashboard/tech-workload',
  requireAuth,
  requireEmployee,
  requireRole(['OFFICE', 'ADMIN']),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const supabase = createServerClient();

      // Get all tech employees
      const { data: techs } = await supabase
        .from('employees')
        .select('id, display_name')
        .eq('role', 'TECH')
        .eq('is_active', true);

      if (!techs || techs.length === 0) {
        res.json(successResponse([]));
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString();
      const tomorrowStr = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString();

      const workload = await Promise.all(
        techs.map(async (tech) => {
          // Count assigned work orders (any open status)
          const { count: assignedCount } = await supabase
            .from('work_orders')
            .select('*', { count: 'exact', head: true })
            .eq('assigned_to', tech.id)
            .in('status', ['SCHEDULED', 'IN_PROGRESS']);

          // Count scheduled today
          const { count: scheduledToday } = await supabase
            .from('work_order_schedule')
            .select('*', { count: 'exact', head: true })
            .eq('tech_user_id', tech.id)
            .gte('scheduled_date', todayStr)
            .lt('scheduled_date', tomorrowStr);

          // Calculate hours logged today
          const { data: timeEntries } = await supabase
            .from('work_order_time_entries')
            .select('clock_in_at, clock_out_at, break_minutes')
            .eq('tech_user_id', tech.id)
            .gte('clock_in_at', todayStr)
            .lt('clock_in_at', tomorrowStr);

          let hoursLoggedToday = 0;
          timeEntries?.forEach((entry) => {
            if (entry.clock_in_at && entry.clock_out_at) {
              const clockIn = new Date(String(entry.clock_in_at)).getTime();
              const clockOut = new Date(String(entry.clock_out_at)).getTime();
              const minutes = (clockOut - clockIn) / (1000 * 60) - (entry.break_minutes || 0);
              hoursLoggedToday += minutes / 60;
            }
          });

          return {
            tech_id: String(tech.id),
            tech_name: String(tech.display_name),
            assigned_work_orders: assignedCount || 0,
            scheduled_today: scheduledToday || 0,
            hours_logged_today: Math.round(hoursLoggedToday * 100) / 100,
          };
        })
      );

      res.json(successResponse(workload));
    } catch (error) {
      console.error('Error fetching tech workload:', error);
      res.status(500).json(
        errorResponse('INTERNAL_ERROR', 'Failed to fetch tech workload')
      );
    }
  }
);

export default router;
