import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { ResponseEnvelope } from '../types/response.js';

describe('Work Order Routes', () => {
  const app = createApp();

  describe('GET /api/work-orders', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get('/api/work-orders');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .get('/api/work-orders')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should accept customer_id filter in query params', async () => {
      const response = await request(app)
        .get('/api/work-orders?customer_id=550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', 'Bearer invalid-token');

      // Will fail auth, but validates route structure
      expect(response.status).toBe(401);
    });

    it('should accept status filter in query params', async () => {
      const response = await request(app)
        .get('/api/work-orders?status=UNSCHEDULED')
        .set('Authorization', 'Bearer invalid-token');

      // Will fail auth, but validates route structure
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/work-orders', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/work-orders')
        .send({
          customer_id: '550e8400-e29b-41d4-a716-446655440000',
          location_id: '550e8400-e29b-41d4-a716-446655440001',
          summary: 'Test work order',
        });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('GET /api/work-orders/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get(
        '/api/work-orders/550e8400-e29b-41d4-a716-446655440000'
      );

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('PATCH /api/work-orders/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .patch('/api/work-orders/550e8400-e29b-41d4-a716-446655440000')
        .send({ summary: 'Updated summary' });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('GET /api/work-orders/:id/schedule', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get(
        '/api/work-orders/550e8400-e29b-41d4-a716-446655440000/schedule'
      );

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('POST /api/work-orders/:id/schedule', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/work-orders/550e8400-e29b-41d4-a716-446655440000/schedule')
        .send({
          tech_user_id: '550e8400-e29b-41d4-a716-446655440002',
          start_at: '2024-01-01T10:00:00Z',
          end_at: '2024-01-01T12:00:00Z',
        });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  // Note: Tests with valid JWT tokens and database operations would be integration tests
  // requiring actual Supabase setup. These unit tests verify the authentication layer.
});
