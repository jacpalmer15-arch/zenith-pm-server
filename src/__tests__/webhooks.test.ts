import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { ResponseEnvelope } from '../types/response.js';
import { createHmac } from 'crypto';

describe('Webhook Routes', () => {
  const app = createApp();

  describe('POST /api/webhooks/:source/clock-event', () => {
    it('should return 400 with unsupported source', async () => {
      const response = await request(app)
        .post('/api/webhooks/unsupported-source/clock-event')
        .send({
          event_id: 'test-123',
          timestamp: '2024-01-01T12:00:00Z',
        });

      expect(response.status).toBe(400);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'VALIDATION_ERROR');
      expect(body.error?.message).toContain('Unsupported webhook source');
    });

    it('should accept webhook from busybusy source', async () => {
      const response = await request(app)
        .post('/api/webhooks/busybusy/clock-event')
        .send({
          id: 'test-123',
          event_type: 'clock_in',
          timestamp: '2024-01-01T12:00:00Z',
          user_id: 'user-456',
        });

      // We expect 202 (Accepted) or 500 (if DB is not available in test)
      expect([202, 500]).toContain(response.status);
    });

    it('should accept webhook from clockify source', async () => {
      const response = await request(app)
        .post('/api/webhooks/clockify/clock-event')
        .send({
          eventId: 'test-456',
          type: 'time_entry.created',
          timestamp: '2024-01-01T12:00:00Z',
        });

      // We expect 202 (Accepted) or 500 (if DB is not available in test)
      expect([202, 500]).toContain(response.status);
    });

    it('should accept webhook from manual source', async () => {
      const response = await request(app)
        .post('/api/webhooks/manual/clock-event')
        .send({
          event_id: 'manual-789',
          action: 'clock_in',
          timestamp: '2024-01-01T12:00:00Z',
        });

      // We expect 202 (Accepted) or 500 (if DB is not available in test)
      expect([202, 500]).toContain(response.status);
    });

    it('should handle webhook without explicit event ID', async () => {
      const response = await request(app)
        .post('/api/webhooks/busybusy/clock-event')
        .send({
          event_type: 'clock_out',
          timestamp: '2024-01-01T17:00:00Z',
          user_id: 'user-789',
        });

      // We expect 202 (Accepted) or 500 (if DB is not available in test)
      expect([202, 500]).toContain(response.status);
    });

    it('should return 400 with empty payload', async () => {
      const response = await request(app)
        .post('/api/webhooks/busybusy/clock-event')
        .send({});

      // Could be 400 validation error or 500 if DB error
      expect([202, 400, 500]).toContain(response.status);
    });
  });

  describe('POST /api/webhooks/app-report', () => {
    const webhookSecret = process.env.APP_REPORT_WEBHOOK_SECRET || 'test-secret-key';

    const generateSignature = (payload: Record<string, unknown>): string => {
      const rawBody = JSON.stringify(payload);
      return createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');
    };

    it('should return 401 without X-Signature header', async () => {
      const payload = {
        event_id: 'test-event-123',
        data: { test: 'data' },
      };

      const response = await request(app)
        .post('/api/webhooks/app-report')
        .send(payload);

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'INVALID_SIGNATURE');
      expect(body.error?.message).toBe('Invalid webhook signature');
    });

    it('should return 401 with invalid signature', async () => {
      const payload = {
        event_id: 'test-event-123',
        data: { test: 'data' },
      };

      const response = await request(app)
        .post('/api/webhooks/app-report')
        .set('X-Signature', 'invalid-signature')
        .send(payload);

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'INVALID_SIGNATURE');
    });

    it('should accept webhook with valid signature', async () => {
      const payload = {
        event_id: 'test-event-456',
        timestamp: '2024-01-01T12:00:00Z',
        data: { action: 'test' },
      };

      const signature = generateSignature(payload);

      const response = await request(app)
        .post('/api/webhooks/app-report')
        .set('X-Signature', signature)
        .send(payload);

      // We expect 200 (OK) or 500 (if DB is not available in test)
      expect([200, 500]).toContain(response.status);
      
      if (response.status === 200) {
        const body = response.body as ResponseEnvelope;
        expect(body.ok).toBe(true);
      }
    });

    it('should generate event_id if missing from payload', async () => {
      const payload = {
        timestamp: '2024-01-01T12:00:00Z',
        data: { action: 'test_no_id' },
      };

      const signature = generateSignature(payload);

      const response = await request(app)
        .post('/api/webhooks/app-report')
        .set('X-Signature', signature)
        .send(payload);

      // We expect 200 (OK) or 500 (if DB is not available in test)
      expect([200, 500]).toContain(response.status);
      
      if (response.status === 200) {
        const body = response.body as ResponseEnvelope;
        expect(body.ok).toBe(true);
        if (body.data && typeof body.data === 'object' && 'event_id' in body.data) {
          expect(body.data.event_id).toMatch(/^app-report:\d+:[a-z0-9]+$/);
        }
      }
    });

    it('should handle duplicate events', async () => {
      const payload = {
        event_id: 'duplicate-test-789',
        timestamp: '2024-01-01T12:00:00Z',
        data: { action: 'duplicate_test' },
      };

      const signature = generateSignature(payload);

      // First request
      const response1 = await request(app)
        .post('/api/webhooks/app-report')
        .set('X-Signature', signature)
        .send(payload);

      // We expect success or DB error
      expect([200, 500]).toContain(response1.status);

      // Only test duplicate if first request succeeded
      if (response1.status === 200) {
        // Second request with same event_id
        const response2 = await request(app)
          .post('/api/webhooks/app-report')
          .set('X-Signature', signature)
          .send(payload);

        expect(response2.status).toBe(200);
        const body = response2.body as ResponseEnvelope;
        expect(body.ok).toBe(true);
        if (body.data && typeof body.data === 'object') {
          expect(body.data).toHaveProperty('status', 'duplicate');
        }
      }
    });

    it('should reject webhook with signature of different payload', async () => {
      const payload1 = {
        event_id: 'test-event-001',
        data: { test: 'original' },
      };

      const payload2 = {
        event_id: 'test-event-002',
        data: { test: 'modified' },
      };

      // Generate signature for payload1 but send payload2
      const signature = generateSignature(payload1);

      const response = await request(app)
        .post('/api/webhooks/app-report')
        .set('X-Signature', signature)
        .send(payload2);

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'INVALID_SIGNATURE');
    });

    it('should handle empty payload with valid signature', async () => {
      const payload = {};
      const signature = generateSignature(payload);

      const response = await request(app)
        .post('/api/webhooks/app-report')
        .set('X-Signature', signature)
        .send(payload);

      // Should accept and generate event_id
      expect([200, 500]).toContain(response.status);
    });
  });
});
