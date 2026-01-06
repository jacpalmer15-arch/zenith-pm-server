import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { ResponseEnvelope } from '../types/response.js';

describe('Time Entry Routes', () => {
  const app = createApp();

  describe('GET /api/work-orders/:id/time-entries', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get(
        '/api/work-orders/550e8400-e29b-41d4-a716-446655440000/time-entries'
      );

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .get('/api/work-orders/550e8400-e29b-41d4-a716-446655440000/time-entries')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('POST /api/work-orders/:id/time-entries', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/work-orders/550e8400-e29b-41d4-a716-446655440000/time-entries')
        .send({
          tech_user_id: '550e8400-e29b-41d4-a716-446655440001',
          clock_in_at: '2024-01-01T09:00:00Z',
        });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .post('/api/work-orders/550e8400-e29b-41d4-a716-446655440000/time-entries')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          tech_user_id: '550e8400-e29b-41d4-a716-446655440001',
          clock_in_at: '2024-01-01T09:00:00Z',
        });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('GET /api/time-entries/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get(
        '/api/time-entries/550e8400-e29b-41d4-a716-446655440000'
      );

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .get('/api/time-entries/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('PATCH /api/time-entries/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .patch('/api/time-entries/550e8400-e29b-41d4-a716-446655440000')
        .send({
          clock_out_at: '2024-01-01T17:00:00Z',
        });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .patch('/api/time-entries/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          clock_out_at: '2024-01-01T17:00:00Z',
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
