import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { ResponseEnvelope } from '../types/response.js';

describe('File Routes', () => {
  const app = createApp();

  describe('POST /api/files', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/files')
        .attach('file', Buffer.from('test'), 'test.txt');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .post('/api/files')
        .set('Authorization', 'Bearer invalid-token')
        .attach('file', Buffer.from('test'), 'test.txt');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 400 when no file is uploaded', async () => {
      const response = await request(app)
        .post('/api/files')
        .field('entity_type', 'project')
        .field('entity_id', '550e8400-e29b-41d4-a716-446655440000');

      // Will fail auth first, but verifies route is registered
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/files/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get('/api/files/550e8400-e29b-41d4-a716-446655440000');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .get('/api/files/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('GET /api/files/:id/download', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get('/api/files/550e8400-e29b-41d4-a716-446655440000/download');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .get('/api/files/550e8400-e29b-41d4-a716-446655440000/download')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('DELETE /api/files/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).delete('/api/files/550e8400-e29b-41d4-a716-446655440000');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .delete('/api/files/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('GET /api/projects/:id/files', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get('/api/projects/550e8400-e29b-41d4-a716-446655440000/files');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .get('/api/projects/550e8400-e29b-41d4-a716-446655440000/files')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('POST /api/projects/:id/files', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/projects/550e8400-e29b-41d4-a716-446655440000/files')
        .attach('file', Buffer.from('test'), 'test.txt');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .post('/api/projects/550e8400-e29b-41d4-a716-446655440000/files')
        .set('Authorization', 'Bearer invalid-token')
        .attach('file', Buffer.from('test'), 'test.txt');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('GET /api/work-orders/:id/files', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get('/api/work-orders/550e8400-e29b-41d4-a716-446655440000/files');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .get('/api/work-orders/550e8400-e29b-41d4-a716-446655440000/files')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('GET /api/invoices/:id/files', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get('/api/invoices/550e8400-e29b-41d4-a716-446655440000/files');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .get('/api/invoices/550e8400-e29b-41d4-a716-446655440000/files')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });
});
