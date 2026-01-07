import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { ResponseEnvelope } from '../types/response.js';

describe('App Routes', () => {
  const app = createApp();

  describe('GET /api/app/my-schedule', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get('/api/app/my-schedule');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .get('/api/app/my-schedule')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('GET /api/app/my-work-orders', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get('/api/app/my-work-orders');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .get('/api/app/my-work-orders')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('GET /api/app/work-order/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get(
        '/api/app/work-order/550e8400-e29b-41d4-a716-446655440000'
      );

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .get('/api/app/work-order/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('POST /api/app/clock-in', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/app/clock-in')
        .send({
          work_order_id: '550e8400-e29b-41d4-a716-446655440000',
        });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .post('/api/app/clock-in')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          work_order_id: '550e8400-e29b-41d4-a716-446655440000',
        });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 400 with invalid work_order_id format', async () => {
      const response = await request(app)
        .post('/api/app/clock-in')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          work_order_id: 'not-a-uuid',
        });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
    });

    it('should return 400 with missing work_order_id', async () => {
      const response = await request(app)
        .post('/api/app/clock-in')
        .set('Authorization', 'Bearer invalid-token')
        .send({});

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
    });
  });

  describe('POST /api/app/clock-out', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/app/clock-out')
        .send({
          time_entry_id: '550e8400-e29b-41d4-a716-446655440000',
        });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .post('/api/app/clock-out')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          time_entry_id: '550e8400-e29b-41d4-a716-446655440000',
        });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 400 with invalid time_entry_id format', async () => {
      const response = await request(app)
        .post('/api/app/clock-out')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          time_entry_id: 'not-a-uuid',
        });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
    });

    it('should return 400 with missing time_entry_id', async () => {
      const response = await request(app)
        .post('/api/app/clock-out')
        .set('Authorization', 'Bearer invalid-token')
        .send({});

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
    });
  });

  describe('GET /api/app/my-time-entries', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get('/api/app/my-time-entries');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .get('/api/app/my-time-entries')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });
});
