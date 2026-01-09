import { Router, Request, Response } from 'express';
import { createServerClient, translateDbError } from '@/db/index.js';
import { successResponse, errorResponse } from '@/types/response.js';
import { WebhookEvent } from '@/types/database.js';
import { enqueueJob } from '@/services/jobQueue.js';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { env } from '@/config/env.js';

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
        // Generate a cryptographic hash from payload if no ID is available
        const payloadHash = createHash('sha256')
          .update(JSON.stringify(payload))
          .digest('hex');
        idempotencyKey = `${source}:hash:${payloadHash}`;
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

/**
 * POST /api/webhooks/app-report
 * Receive webhook payloads from app-report provider with HMAC signature verification
 * No authentication required - validates via X-Signature header
 */
router.post(
  '/api/webhooks/app-report',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const signature = req.headers['x-signature'] as string | undefined;
      
      // Require raw body for signature verification
      if (!req.rawBody) {
        res.status(500).json(
          errorResponse(
            'INTERNAL_SERVER_ERROR',
            'Raw body unavailable for signature verification'
          )
        );
        return;
      }
      
      const rawBody = req.rawBody;
      const payload = req.body as Record<string, unknown>;

      // Step 1: Verify HMAC Signature
      if (!signature) {
        res.status(401).json(
          errorResponse(
            'INVALID_SIGNATURE',
            'Invalid webhook signature'
          )
        );
        return;
      }

      // Validate signature format (hexadecimal, 64 characters for SHA256)
      if (!/^[a-f0-9]{64}$/i.test(signature)) {
        res.status(401).json(
          errorResponse(
            'INVALID_SIGNATURE',
            'Invalid webhook signature'
          )
        );
        return;
      }

      // Compute HMAC SHA256 of request body
      const expectedSignature = createHmac('sha256', env.APP_REPORT_WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex');

      // Timing-safe comparison (both are hex strings, convert to buffers)
      const signatureBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');

      if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
        res.status(401).json(
          errorResponse(
            'INVALID_SIGNATURE',
            'Invalid webhook signature'
          )
        );
        return;
      }

      // Step 2: Extract event_id
      let eventId: string;
      if (typeof payload.event_id === 'string' && payload.event_id) {
        eventId = payload.event_id;
      } else {
        // Generate event_id if missing: app-report:<timestamp>:<random>
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        eventId = `app-report:${timestamp}:${random}`;
      }

      const idempotencyKey = `app-report:${eventId}`;
      const supabase = createServerClient();

      // Step 3: Deduplicate
      const { data: existingEvent } = await supabase
        .from('webhook_events')
        .select('id')
        .eq('idempotency_key', idempotencyKey)
        .limit(1);

      if (existingEvent && existingEvent.length > 0) {
        // Duplicate event detected
        res.status(200).json(
          successResponse({
            status: 'duplicate',
            message: 'Event already received',
          })
        );
        return;
      }

      // Step 4: Persist webhook_events
      const { data: webhookEvent, error: webhookError } = await supabase
        .from('webhook_events')
        .insert({
          source: 'app-report',
          event_type: 'app_report_event',
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

      // Step 5: Enqueue sync_events job
      const { error: jobError } = await enqueueJob(
        supabase,
        'process_app_report_webhook',
        {
          webhook_event_id: webhookEvent.id,
          event_id: eventId,
        }
      );

      if (jobError) {
        console.error('Failed to enqueue app-report webhook processing job:', jobError);
        // Continue - webhook was saved, job can be manually triggered
      }

      // Step 6: Return success response
      res.status(200).json(
        successResponse({
          status: 'received',
          message: 'Webhook received and queued for processing',
          webhook_event_id: webhookEvent.id,
          event_id: eventId,
        })
      );
    } catch (error) {
      console.error('Error processing app-report webhook:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to process webhook')
        );
    }
  }
);

/**
 * POST /api/webhooks/qbo
 * Receive QuickBooks webhook payloads with signature verification
 */
router.post(
  '/api/webhooks/qbo',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const signature = req.headers['intuit-signature'] as string | undefined;

      if (!req.rawBody) {
        res.status(500).json(
          errorResponse(
            'INTERNAL_SERVER_ERROR',
            'Raw body unavailable for signature verification'
          )
        );
        return;
      }

      if (!signature) {
        res.status(401).json(
          errorResponse('INVALID_SIGNATURE', 'Missing QuickBooks signature')
        );
        return;
      }

      const expectedSignature = createHmac('sha256', env.QBO_WEBHOOK_VERIFIER)
        .update(req.rawBody)
        .digest('base64');

      const signatureBuffer = Buffer.from(signature, 'base64');
      const expectedBuffer = Buffer.from(expectedSignature, 'base64');

      if (
        signatureBuffer.length !== expectedBuffer.length ||
        !timingSafeEqual(signatureBuffer, expectedBuffer)
      ) {
        res.status(401).json(
          errorResponse('INVALID_SIGNATURE', 'Invalid QuickBooks signature')
        );
        return;
      }

      const payload = req.body as Record<string, unknown>;
      const payloadHash = createHash('sha256')
        .update(req.rawBody)
        .digest('hex');

      const realmId =
        Array.isArray(payload.eventNotifications) &&
        payload.eventNotifications.length > 0 &&
        typeof payload.eventNotifications[0]?.realmId === 'string'
          ? payload.eventNotifications[0]?.realmId
          : 'unknown';

      const idempotencyKey = `qbo:${realmId}:${payloadHash}`;
      const supabase = createServerClient();

      const { data: existingEvent } = await supabase
        .from('qbo_webhook_events')
        .select('id')
        .eq('idempotency_key', idempotencyKey)
        .limit(1);

      if (existingEvent && existingEvent.length > 0) {
        res.status(200).json(
          successResponse({
            status: 'duplicate',
            message: 'Event already received',
          })
        );
        return;
      }

      const { data: webhookEvent, error: webhookError } = await supabase
        .from('qbo_webhook_events')
        .insert({
          realm_id: realmId,
          idempotency_key: idempotencyKey,
          payload: payload,
          status: 'PENDING',
        })
        .select()
        .single();

      if (webhookError || !webhookEvent) {
        const apiError = webhookError
          ? translateDbError(webhookError)
          : {
              statusCode: 500,
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to persist webhook event',
            };
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      const { error: jobError } = await enqueueJob(
        supabase,
        'process_qbo_webhook_event',
        {
          webhook_event_id: webhookEvent.id,
          realm_id: realmId,
        }
      );

      if (jobError) {
        console.error('Failed to enqueue QuickBooks webhook job:', jobError);
      }

      res.status(202).json(
        successResponse({
          status: 'received',
          webhook_event_id: webhookEvent.id,
          realm_id: realmId,
        })
      );
    } catch (error) {
      console.error('Error processing QuickBooks webhook:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to process webhook')
        );
    }
  }
);

/**
 * POST /api/webhooks/pm-app
 * Receive webhook payloads from the project management app with HMAC signature verification
 */
router.post(
  '/api/webhooks/pm-app',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const signature = req.headers['x-signature'] as string | undefined;

      if (!req.rawBody) {
        res.status(500).json(
          errorResponse(
            'INTERNAL_SERVER_ERROR',
            'Raw body unavailable for signature verification'
          )
        );
        return;
      }

      if (!signature) {
        res.status(401).json(
          errorResponse('INVALID_SIGNATURE', 'Missing webhook signature')
        );
        return;
      }

      const expectedSignature = createHmac('sha256', env.PM_APP_WEBHOOK_SECRET)
        .update(req.rawBody)
        .digest('hex');

      const signatureBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');

      if (
        signatureBuffer.length !== expectedBuffer.length ||
        !timingSafeEqual(signatureBuffer, expectedBuffer)
      ) {
        res.status(401).json(
          errorResponse('INVALID_SIGNATURE', 'Invalid webhook signature')
        );
        return;
      }

      const payload = req.body as Record<string, unknown>;
      const eventId =
        typeof payload.event_id === 'string' && payload.event_id
          ? payload.event_id
          : createHash('sha256').update(req.rawBody).digest('hex');

      const idempotencyKey = `pm-app:${eventId}`;
      const supabase = createServerClient();

      const { data: existingEvent } = await supabase
        .from('webhook_events')
        .select('id')
        .eq('idempotency_key', idempotencyKey)
        .limit(1);

      if (existingEvent && existingEvent.length > 0) {
        res.status(200).json(
          successResponse({
            status: 'duplicate',
            message: 'Event already received',
          })
        );
        return;
      }

      const { data: webhookEvent, error: webhookError } = await supabase
        .from('webhook_events')
        .insert({
          source: 'pm-app',
          event_type:
            typeof payload.event_type === 'string' ? payload.event_type : 'pm_app_event',
          payload: payload,
          status: 'PENDING',
          idempotency_key: idempotencyKey,
        })
        .select()
        .single();

      if (webhookError || !webhookEvent) {
        const apiError = webhookError
          ? translateDbError(webhookError)
          : {
              statusCode: 500,
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to persist webhook event',
            };
        res.status(apiError.statusCode).json(
          errorResponse(apiError.code, apiError.message, apiError.details)
        );
        return;
      }

      const { error: jobError } = await enqueueJob(
        supabase,
        'process_pm_app_webhook',
        {
          webhook_event_id: webhookEvent.id,
          event_id: eventId,
        }
      );

      if (jobError) {
        console.error('Failed to enqueue pm-app webhook job:', jobError);
      }

      res.status(202).json(
        successResponse({
          status: 'received',
          webhook_event_id: webhookEvent.id,
          event_id: eventId,
        })
      );
    } catch (error) {
      console.error('Error processing pm-app webhook:', error);
      res
        .status(500)
        .json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Failed to process webhook')
        );
    }
  }
);

export default router;
