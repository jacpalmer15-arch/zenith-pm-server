import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { ResponseEnvelope } from '../types/response.js';

describe('Inventory Ledger Routes', () => {
  const app = createApp();

  describe('GET /api/parts/:id/inventory-ledger', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get(
        '/api/parts/550e8400-e29b-41d4-a716-446655440000/inventory-ledger'
      );

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .get('/api/parts/550e8400-e29b-41d4-a716-446655440000/inventory-ledger')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('POST /api/parts/:id/inventory-ledger', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/parts/550e8400-e29b-41d4-a716-446655440000/inventory-ledger')
        .send({ txn_type: 'ADJUSTMENT', qty_delta: 10 });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .post('/api/parts/550e8400-e29b-41d4-a716-446655440000/inventory-ledger')
        .set('Authorization', 'Bearer invalid-token')
        .send({ txn_type: 'ADJUSTMENT', qty_delta: 10 });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/inventory-ledger', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get('/api/inventory-ledger');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .get('/api/inventory-ledger')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  // Note: Tests with valid JWT tokens and database operations would be integration tests
  // requiring actual Supabase setup. These unit tests verify the authentication layer.
});
