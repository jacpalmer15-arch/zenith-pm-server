import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { ResponseEnvelope } from '../types/response.js';

describe('Invoice Line Routes', () => {
  const app = createApp();

  describe('GET /api/invoices/:id/lines', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get(
        '/api/invoices/550e8400-e29b-41d4-a716-446655440000/lines'
      );

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .get('/api/invoices/550e8400-e29b-41d4-a716-446655440000/lines')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('POST /api/invoices/:id/lines', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/invoices/550e8400-e29b-41d4-a716-446655440000/lines')
        .send({
          description: 'Test line',
          uom: 'EA',
          qty: 1,
          unit_price: 100,
        });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('PATCH /api/invoice-lines/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .patch('/api/invoice-lines/550e8400-e29b-41d4-a716-446655440000')
        .send({ qty: 2 });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('DELETE /api/invoice-lines/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).delete(
        '/api/invoice-lines/550e8400-e29b-41d4-a716-446655440000'
      );

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });
});
