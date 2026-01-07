import { Router, Request, Response } from 'express';
import { createServerClient } from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { requireAuth } from '@/middleware/requireAuth.js';
import { requireRole } from '@/middleware/requireRole.js';

const router = Router();

/**
 * GET /api/admin/jobs
 * List jobs with optional filters
 * ADMIN only
 */
router.get(
  '/api/admin/jobs',
  requireAuth,
  requireRole(['ADMIN', 'OFFICE']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { status, job_type, page = '1', limit = '50' } = req.query;

      const supabase = createServerClient();
      let query = supabase.from('job_queue').select('*', { count: 'exact' });

      // Apply filters
      if (status && typeof status === 'string') {
        query = query.eq('status', status);
      }

      if (job_type && typeof job_type === 'string') {
        query = query.eq('job_type', job_type);
      }

      // Pagination
      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const offset = (pageNum - 1) * limitNum;

      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + limitNum - 1);

      const { data, error, count } = await query;

      if (error) {
        res
          .status(500)
          .json(errorResponse('DATABASE_ERROR', 'Failed to fetch jobs'));
        return;
      }

      res.json(
        successResponse({
          jobs: data,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: count ?? 0,
          },
        })
      );
    } catch (error) {
      console.error('Error listing jobs:', error);
      res
        .status(500)
        .json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to list jobs'));
    }
  }
);

/**
 * GET /api/admin/jobs/:id
 * Get a single job by ID
 * ADMIN only
 */
router.get(
  '/api/admin/jobs/:id',
  requireAuth,
  requireRole(['ADMIN', 'OFFICE']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { data, error } = await supabase
        .from('job_queue')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          res.status(404).json(errorResponse('NOT_FOUND', 'Job not found'));
          return;
        }
        res
          .status(500)
          .json(errorResponse('DATABASE_ERROR', 'Failed to fetch job'));
        return;
      }

      res.json(successResponse(data));
    } catch (error) {
      console.error('Error fetching job:', error);
      res
        .status(500)
        .json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch job'));
    }
  }
);

/**
 * POST /api/admin/jobs/:id/retry
 * Retry a failed job
 * ADMIN only
 */
router.post(
  '/api/admin/jobs/:id/retry',
  requireAuth,
  requireRole(['ADMIN', 'OFFICE']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = createServerClient();

      // Fetch the job
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { data: job, error: fetchError } = await supabase
        .from('job_queue')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          res.status(404).json(errorResponse('NOT_FOUND', 'Job not found'));
          return;
        }
        res
          .status(500)
          .json(errorResponse('DATABASE_ERROR', 'Failed to fetch job'));
        return;
      }

      // Only allow retry for FAILED jobs
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (job.status !== 'FAILED') {
        res
          .status(400)
          .json(
            errorResponse(
              'INVALID_STATUS',
              'Only failed jobs can be retried'
            )
          );
        return;
      }

      // Reset the job to PENDING
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { data, error: updateError } = await supabase
        .from('job_queue')
        .update({
          status: 'PENDING',
          attempts: 0,
          locked_at: null,
          locked_by: null,
          last_error: null,
          run_after: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        res
          .status(500)
          .json(errorResponse('DATABASE_ERROR', 'Failed to retry job'));
        return;
      }

      res.json(successResponse(data));
    } catch (error) {
      console.error('Error retrying job:', error);
      res
        .status(500)
        .json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to retry job'));
    }
  }
);

export default router;
