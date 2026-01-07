import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { ResponseEnvelope } from '../types/response.js';

describe('Tax Rules Routes', () => {
  const app = createApp();

  describe('GET /api/tax-rules', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get('/api/tax-rules');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .get('/api/tax-rules')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('POST /api/tax-rules', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/tax-rules')
        .send({ name: 'Sales Tax', rate: 0.0825 });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .post('/api/tax-rules')
        .set('Authorization', 'Bearer invalid-token')
        .send({ name: 'Sales Tax', rate: 0.0825 });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/tax-rules/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get(
        '/api/tax-rules/550e8400-e29b-41d4-a716-446655440000'
      );

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('PATCH /api/tax-rules/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .patch('/api/tax-rules/550e8400-e29b-41d4-a716-446655440000')
        .send({ name: 'Updated Tax Rule' });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('POST /api/tax-rules/:id/set-default', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).post(
        '/api/tax-rules/550e8400-e29b-41d4-a716-446655440000/set-default'
      );

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .post('/api/tax-rules/550e8400-e29b-41d4-a716-446655440000/set-default')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/tax-rules/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).delete(
        '/api/tax-rules/550e8400-e29b-41d4-a716-446655440000'
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
