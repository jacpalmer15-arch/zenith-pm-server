import { Router, Request, Response } from 'express';
import { createServerClient } from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireEmployee } from '@/middleware/requireEmployee.js';
import { requireRole } from '@/middleware/requireRole.js';
import { ZodError } from 'zod';
import {
  qboCallbackQuerySchema,
  qboConnectQuerySchema,
  qboConnectionQuerySchema,
  qboRefreshSchema,
  qboPushCustomersSchema,
  qboPushProjectsSchema,
} from '@/validations/quickbooks.js';
import { buildQboAuthUrl, exchangeCodeForTokens } from '@/services/quickbooks/oauth.js';
import { refreshQboConnection, storeQboConnection } from '@/services/quickbooks/client.js';
import { enqueueJob } from '@/services/jobQueue.js';

const router = Router();

/**
 * GET /api/qbo/connect
 * Returns a QuickBooks OAuth authorization URL
 * ADMIN/OFFICE only
 */
router.get(
  '/api/qbo/connect',
  requireAuth,
  requireEmployee,
  requireRole(['ADMIN', 'OFFICE']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { state } = qboConnectQuerySchema.parse(req.query);
      const { url, state: resolvedState } = buildQboAuthUrl(state);

      res.json(
        successResponse({
          auth_url: url,
          state: resolvedState,
        })
      );
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Invalid query parameters', error.flatten())
        );
        return;
      }

      console.error('Error building QuickBooks auth URL:', error);
      res
        .status(500)
        .json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to build auth URL'));
    }
  }
);

/**
 * GET /api/qbo/callback
 * OAuth callback handler for QuickBooks connection
 * No auth required (QuickBooks redirect)
 */
router.get('/api/qbo/callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, realmId } = qboCallbackQuerySchema.parse(req.query);
    const supabase = createServerClient();

    const tokens = await exchangeCodeForTokens(code);
    const connection = await storeQboConnection(supabase, realmId, tokens);

    res.json(
      successResponse({
        connected: true,
        realm_id: connection.realm_id,
        expires_at: connection.expires_at,
      })
    );
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json(
        errorResponse('VALIDATION_ERROR', 'Invalid query parameters', error.flatten())
      );
      return;
    }

    console.error('QuickBooks callback error:', error);
    res
      .status(500)
      .json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to connect QuickBooks'));
  }
});

/**
 * GET /api/qbo/connection
 * Get current QuickBooks connection status
 * ADMIN/OFFICE only
 */
router.get(
  '/api/qbo/connection',
  requireAuth,
  requireEmployee,
  requireRole(['ADMIN', 'OFFICE']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { realm_id: realmId } = qboConnectionQuerySchema.parse(req.query);
      const supabase = createServerClient();

      let query = supabase.from('qbo_connections').select('*');
      if (realmId) {
        query = query.eq('realm_id', realmId);
      } else {
        query = query.order('updated_at', { ascending: false }).limit(1);
      }

      const { data, error } = await query;

      if (error) {
        res.status(500).json(errorResponse('DATABASE_ERROR', 'Failed to fetch connection'));
        return;
      }

      if (!data || data.length === 0) {
        res.status(404).json(errorResponse('NOT_FOUND', 'No QuickBooks connection found'));
        return;
      }

      const connection = data[0];
      res.json(
        successResponse({
          realm_id: connection.realm_id,
          expires_at: connection.expires_at,
          scope: connection.scope,
          updated_at: connection.updated_at,
        })
      );
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Invalid query parameters', error.flatten())
        );
        return;
      }

      console.error('Error fetching QuickBooks connection:', error);
      res
        .status(500)
        .json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch connection'));
    }
  }
);

/**
 * POST /api/qbo/refresh
 * Refresh QuickBooks access token
 * ADMIN/OFFICE only
 */
router.post(
  '/api/qbo/refresh',
  requireAuth,
  requireEmployee,
  requireRole(['ADMIN', 'OFFICE']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { realm_id: realmId } = qboRefreshSchema.parse(req.body);
      const supabase = createServerClient();

      const { data, error } = await supabase
        .from('qbo_connections')
        .select('*')
        .eq('realm_id', realmId)
        .single();

      if (error || !data) {
        res.status(404).json(errorResponse('NOT_FOUND', 'QuickBooks connection not found'));
        return;
      }

      const refreshed = await refreshQboConnection(supabase, data);

      res.json(
        successResponse({
          realm_id: refreshed.realm_id,
          expires_at: refreshed.expires_at,
          updated_at: refreshed.updated_at,
        })
      );
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Invalid request body', error.flatten())
        );
        return;
      }

      console.error('Error refreshing QuickBooks connection:', error);
      res
        .status(500)
        .json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to refresh connection'));
    }
  }
);

/**
 * POST /api/qbo/push/customers
 * Enqueue sync jobs to push customers into QuickBooks
 * ADMIN/OFFICE only
 */
router.post(
  '/api/qbo/push/customers',
  requireAuth,
  requireEmployee,
  requireRole(['ADMIN', 'OFFICE']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { realm_id: realmId, customer_ids, limit = 50, offset = 0 } =
        qboPushCustomersSchema.parse(req.body);
      const supabase = createServerClient();

      let query = supabase.from('customers').select('id', { count: 'exact' });

      if (customer_ids && customer_ids.length > 0) {
        query = query.in('id', customer_ids);
      } else {
        query = query.is('qbo_customer_ref', null);
      }

      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        res.status(500).json(errorResponse('DATABASE_ERROR', 'Failed to fetch customers'));
        return;
      }

      const customers = data ?? [];
      let enqueued = 0;

      for (const customer of customers) {
        const { error: jobError } = await enqueueJob(supabase, 'qbo_push_customer', {
          realm_id: realmId,
          customer_id: customer.id,
        });

        if (!jobError) {
          enqueued += 1;
        }
      }

      res.json(
        successResponse({
          queued: enqueued,
          total: count ?? customers.length,
        })
      );
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Invalid request body', error.flatten())
        );
        return;
      }

      console.error('Error enqueueing QBO customer push:', error);
      res
        .status(500)
        .json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to enqueue customer push'));
    }
  }
);

/**
 * POST /api/qbo/push/projects
 * Enqueue sync jobs to push projects (jobs) into QuickBooks
 * ADMIN/OFFICE only
 */
router.post(
  '/api/qbo/push/projects',
  requireAuth,
  requireEmployee,
  requireRole(['ADMIN', 'OFFICE']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { realm_id: realmId, project_ids, limit = 50, offset = 0 } =
        qboPushProjectsSchema.parse(req.body);
      const supabase = createServerClient();

      let query = supabase.from('projects').select('id', { count: 'exact' });

      if (project_ids && project_ids.length > 0) {
        query = query.in('id', project_ids);
      } else {
        query = query.is('qbo_job_ref', null);
      }

      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        res.status(500).json(errorResponse('DATABASE_ERROR', 'Failed to fetch projects'));
        return;
      }

      const projects = data ?? [];
      let enqueued = 0;

      for (const project of projects) {
        const { error: jobError } = await enqueueJob(supabase, 'qbo_push_project', {
          realm_id: realmId,
          project_id: project.id,
        });

        if (!jobError) {
          enqueued += 1;
        }
      }

      res.json(
        successResponse({
          queued: enqueued,
          total: count ?? projects.length,
        })
      );
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(
          errorResponse('VALIDATION_ERROR', 'Invalid request body', error.flatten())
        );
        return;
      }

      console.error('Error enqueueing QBO project push:', error);
      res
        .status(500)
        .json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to enqueue project push'));
    }
  }
);

export default router;
