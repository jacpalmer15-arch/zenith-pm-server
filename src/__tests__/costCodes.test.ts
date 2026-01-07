import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { ResponseEnvelope } from '../types/response.js';

describe('Cost Codes Routes', () => {
  const app = createApp();

  describe('GET /api/cost-codes', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get('/api/cost-codes');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .get('/api/cost-codes')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('POST /api/cost-codes', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/cost-codes')
        .send({ 
          cost_type_id: '550e8400-e29b-41d4-a716-446655440000',
          code: 'LAB01',
          name: 'Regular Labor'
        });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .post('/api/cost-codes')
        .set('Authorization', 'Bearer invalid-token')
        .send({ 
          cost_type_id: '550e8400-e29b-41d4-a716-446655440000',
          code: 'LAB01',
          name: 'Regular Labor'
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/cost-codes/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get(
        '/api/cost-codes/550e8400-e29b-41d4-a716-446655440000'
      );

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('PATCH /api/cost-codes/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .patch('/api/cost-codes/550e8400-e29b-41d4-a716-446655440000')
        .send({ name: 'Updated Cost Code' });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('DELETE /api/cost-codes/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).delete(
        '/api/cost-codes/550e8400-e29b-41d4-a716-446655440000'
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
