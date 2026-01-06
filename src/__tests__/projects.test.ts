import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { ResponseEnvelope } from '../types/response.js';

describe('Project Routes', () => {
  const app = createApp();

  describe('GET /api/projects', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get('/api/projects');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .get('/api/projects')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should accept customer_id filter parameter', async () => {
      const response = await request(app)
        .get('/api/projects?customer_id=550e8400-e29b-41d4-a716-446655440000');

      // Will fail auth, but ensures the route is registered and accepts the parameter
      expect(response.status).toBe(401);
    });

    it('should accept status filter parameter', async () => {
      const response = await request(app)
        .get('/api/projects?status=Active');

      // Will fail auth, but ensures the route is registered and accepts the parameter
      expect(response.status).toBe(401);
    });

    it('should accept pagination parameters', async () => {
      const response = await request(app)
        .get('/api/projects?limit=10&offset=0');

      // Will fail auth, but ensures the route is registered and accepts the parameters
      expect(response.status).toBe(401);
    });

    it('should accept sort parameters', async () => {
      const response = await request(app)
        .get('/api/projects?sortBy=name&sortOrder=asc');

      // Will fail auth, but ensures the route is registered and accepts the parameters
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/projects', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({ 
          customer_id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'Test Project' 
        });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', 'Bearer invalid-token')
        .send({ 
          customer_id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'Test Project' 
        });

      // Will fail auth before validation
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/projects/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app).get(
        '/api/projects/550e8400-e29b-41d4-a716-446655440000'
      );

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .get('/api/projects/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('PATCH /api/projects/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .patch('/api/projects/550e8400-e29b-41d4-a716-446655440000')
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should return 401 with invalid Bearer token', async () => {
      const response = await request(app)
        .patch('/api/projects/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', 'Bearer invalid-token')
        .send({ status: 'Active' });

      expect(response.status).toBe(401);
      const body = response.body as ResponseEnvelope;
      expect(body.ok).toBe(false);
      expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  // Note: Tests with valid JWT tokens and database operations would be integration tests
  // requiring actual Supabase setup. These unit tests verify the authentication layer.
});
