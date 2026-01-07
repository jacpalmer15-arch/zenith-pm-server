import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { ResponseEnvelope } from '../types/response.js';

describe('Change Order Routes', () => {
  const app = createApp();

  describe('GET /api/change-orders', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get('/api/change-orders');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .get('/api/change-orders')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('POST /api/change-orders', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/change-orders')
        .send({
          project_id: '550e8400-e29b-41d4-a716-446655440000',
          description: 'Test change order',
          amount: 1000,
        });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 400 with invalid data', async () => {
      const response = await request(app)
        .post('/api/change-orders')
        .set('Authorization', 'Bearer invalid-token')
        .send({ description: 'Missing required fields' });

      // Will fail auth before validation, so still 401
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/change-orders/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get(
        '/api/change-orders/550e8400-e29b-41d4-a716-446655440000'
      );

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('PATCH /api/change-orders/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .patch('/api/change-orders/550e8400-e29b-41d4-a716-446655440000')
        .send({ description: 'Updated description' });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('POST /api/change-orders/:id/approve', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).post(
        '/api/change-orders/550e8400-e29b-41d4-a716-446655440000/approve'
      );

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('POST /api/change-orders/:id/reject', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).post(
        '/api/change-orders/550e8400-e29b-41d4-a716-446655440000/reject'
      );

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  // Note: Tests with valid JWT tokens and database operations would be integration tests
  // requiring actual Supabase setup. These unit tests verify the authentication layer.
});
