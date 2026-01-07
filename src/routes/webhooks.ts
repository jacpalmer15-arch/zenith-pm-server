import { Router, Request, Response } from 'express';
import { createServerClient, translateDbError } from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { WebhookEvent } from '@/types/database.js';
import { enqueueJob } from '@/services/jobQueue.js';

const router = Router();

/**
 * POST /api/webhooks/:source/clock-event
 * Receive external clock events from various sources (busybusy, clockify, etc.)
 * No authentication required - validates via source-specific headers
 */
router.post(
  '/api/webhooks/:source/clock-event',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { source } = req.params;
      const payload = req.body as Record<string, unknown>;

      // Validate source parameter
      if (!source || typeof source !== 'string') {
        res
          .status(400)
          .json(errorResponse('VALIDATION_ERROR', 'Invalid source parameter'));
        return;
      }

      // TODO: Add source-specific signature validation here
      // For now, we'll accept any webhook from valid sources
      const validSources = ['busybusy', 'clockify', 'manual'];
      if (!validSources.includes(source.toLowerCase())) {
        res
          .status(400)
          .json(
            errorResponse(
              'VALIDATION_ERROR',
              `Unsupported webhook source: ${source}`
            )
          );
        return;
      }

      // Extract idempotency key from payload
      // Different sources may use different field names
      let idempotencyKey: string | null = null;
      if (typeof payload.id === 'string') {
        idempotencyKey = `${source}:${payload.id}`;
      } else if (typeof payload.event_id === 'string') {
        idempotencyKey = `${source}:${payload.event_id}`;
      } else if (typeof payload.eventId === 'string') {
        idempotencyKey = `${source}:${payload.eventId}`;
      } else {
        // Generate a hash from payload if no ID is available
        idempotencyKey = `${source}:${Date.now()}:${JSON.stringify(payload).substring(0, 50)}`;
      }

      const supabase = createServerClient();

      // Check for existing webhook event with same idempotency key
      if (idempotencyKey) {
        const { data: existingEvent } = await supabase
          .from('webhook_events')
          .select('id')
          .eq('idempotency_key', idempotencyKey)
          .limit(1);

        if (existingEvent && existingEvent.length > 0) {
          // Duplicate event, return success without processing
          res.json(
            successResponse({
              message: 'Webhook event already processed',
              idempotency_key: idempotencyKey,
            })
          );
          return;
        }
      }

      // Insert webhook event
      const { data: webhookEvent, error: webhookError } = await supabase
        .from('webhook_events')
        .insert({
          source: source.toLowerCase(),
          event_type: 'clock_event',
          payload: payload,
          status: 'PENDING',
          idempotency_key: idempotencyKey,
        })
        .select()
        .single<WebhookEvent>();

      if (webhookError) {
        const apiError = translateDbError(webhookError);
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      // Enqueue job for processing
      const { error: jobError } = await enqueueJob(
        supabase,
        'process_webhook_clock_event',
        {
          webhook_event_id: webhookEvent.id,
        }
      );

      if (jobError) {
        console.error('Failed to enqueue webhook processing job:', jobError);
        // Continue - webhook was saved, job can be manually triggered
      }

      res.status(202).json(
        successResponse({
          message: 'Webhook event received and queued for processing',
          webhook_event_id: webhookEvent.id,
          idempotency_key: idempotencyKey,
        })
      );
    } catch (error) {
      console.error('Error processing webhook:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to process webhook')
        );
    }
  }
);

export default router;
