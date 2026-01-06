import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { ResponseEnvelope } from '../types/response.js';

describe('Receipt Routes', () => {
  const app = createApp();

  describe('GET /api/receipts', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get('/api/receipts');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .get('/api/receipts')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('POST /api/receipts', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/receipts')
        .send({
          vendor_name: 'Test Vendor',
          receipt_date: '2024-01-01',
          total_amount: 100.00,
          storage_path: '/path/to/receipt',
        });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .post('/api/receipts')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          vendor_name: 'Test Vendor',
          receipt_date: '2024-01-01',
          total_amount: 100.00,
          storage_path: '/path/to/receipt',
        });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('GET /api/receipts/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get(
        '/api/receipts/550e8400-e29b-41d4-a716-446655440000'
      );

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('PATCH /api/receipts/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .patch('/api/receipts/550e8400-e29b-41d4-a716-446655440000')
        .send({ vendor_name: 'Updated Vendor' });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('POST /api/receipts/:id/allocate', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/receipts/550e8400-e29b-41d4-a716-446655440000/allocate')
        .send({
          allocated_to_work_order_id: '550e8400-e29b-41d4-a716-446655440001',
        });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });
});
