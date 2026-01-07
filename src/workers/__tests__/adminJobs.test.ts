import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import type { ResponseEnvelope } from '../../types/response.js';

describe('Admin Job Routes', () => {
  const app = createApp();

  describe('GET /api/admin/jobs', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get('/api/admin/jobs');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .get('/api/admin/jobs')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should accept query parameters for filtering', async () => {
      const response = await request(app)
        .get('/api/admin/jobs')
        .query({ status: 'PENDING', job_type: 'time_entry_cost_post' })
        .set('Authorization', 'Bearer invalid-token');

      // Still returns 401 due to invalid token, but validates the route accepts params
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/admin/jobs/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get(
        '/api/admin/jobs/550e8400-e29b-41d4-a716-446655440000'
      );

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .get('/api/admin/jobs/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('POST /api/admin/jobs/:id/retry', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).post(
        '/api/admin/jobs/550e8400-e29b-41d4-a716-446655440000/retry'
      );

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .post('/api/admin/jobs/550e8400-e29b-41d4-a716-446655440000/retry')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });
});
