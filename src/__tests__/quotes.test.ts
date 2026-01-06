import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { ResponseEnvelope } from '../types/response.js';

describe('Quote Routes', () => {
  const app = createApp();

  describe('GET /api/quotes', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get('/api/quotes');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .get('/api/quotes')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('POST /api/quotes', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/quotes')
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

  describe('GET /api/quotes/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get(
        '/api/quotes/550e8400-e29b-41d4-a716-446655440000'
      );

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('PATCH /api/quotes/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .patch('/api/quotes/550e8400-e29b-41d4-a716-446655440000')
        .send({ valid_until: '2026-12-31' });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('POST /api/quotes/:id/send', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/quotes/550e8400-e29b-41d4-a716-446655440000/send');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('POST /api/quotes/:id/accept', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/quotes/550e8400-e29b-41d4-a716-446655440000/accept');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('GET /api/quotes/:id/lines', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get(
        '/api/quotes/550e8400-e29b-41d4-a716-446655440000/lines'
      );

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('POST /api/quotes/:id/lines', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/quotes/550e8400-e29b-41d4-a716-446655440000/lines')
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

  describe('PATCH /api/quote-lines/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .patch('/api/quote-lines/550e8400-e29b-41d4-a716-446655440000')
        .send({ qty: 2 });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('DELETE /api/quote-lines/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).delete(
        '/api/quote-lines/550e8400-e29b-41d4-a716-446655440000'
      );

      expect(response.status).toBe(401);
    });
  });
});
