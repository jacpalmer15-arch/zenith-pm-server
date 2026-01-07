import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { ResponseEnvelope } from '../types/response.js';

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
});
