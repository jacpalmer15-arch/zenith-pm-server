import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { ResponseEnvelope } from '../types/response.js';

describe('Invoice Routes', () => {
  const app = createApp();

  describe('GET /api/invoices', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get('/api/invoices');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .get('/api/invoices')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('POST /api/invoices', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/invoices')
        .send({
          project_id: '550e8400-e29b-41d4-a716-446655440000',
          tax_rule_id: '550e8400-e29b-41d4-a716-446655440001',
        });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('GET /api/invoices/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get(
        '/api/invoices/550e8400-e29b-41d4-a716-446655440000'
      );

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('PATCH /api/invoices/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .patch('/api/invoices/550e8400-e29b-41d4-a716-446655440000')
        .send({ due_date: '2026-12-31' });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('POST /api/invoices/:id/send', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/invoices/550e8400-e29b-41d4-a716-446655440000/send');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('POST /api/invoices/:id/mark-paid', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/invoices/550e8400-e29b-41d4-a716-446655440000/mark-paid')
        .send({
          payment_date: '2026-01-06',
          amount: 100.00,
          payment_method: 'CHECK',
        });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });
});
