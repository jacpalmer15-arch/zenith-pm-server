import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { ResponseEnvelope } from '../types/response.js';

describe('Schedule Routes', () => {
  const app = createApp();

  describe('PATCH /api/schedule/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .patch('/api/schedule/550e8400-e29b-41d4-a716-446655440000')
        .send({
          start_at: '2024-01-01T10:00:00Z',
          end_at: '2024-01-01T12:00:00Z',
        });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .patch('/api/schedule/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          start_at: '2024-01-01T10:00:00Z',
          end_at: '2024-01-01T12:00:00Z',
        });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('DELETE /api/schedule/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).delete(
        '/api/schedule/550e8400-e29b-41d4-a716-446655440000'
      );

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .delete('/api/schedule/550e8400-e29b-41d4-a716-446655440000')
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
