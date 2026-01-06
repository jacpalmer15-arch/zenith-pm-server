import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { ResponseEnvelope } from '../types/response.js';

describe('/api/me Route', () => {
  const app = createApp();

  it('GET /api/me without Authorization header should return 401', async () => {
    const response = await request(app).get('/api/me');

    expect(response.status).toBe(401);
    const body = response.body as ResponseEnvelope;
    expect(body.ok).toBe(false);
    expect(body.data).toBeNull();
    expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
    expect(body.error?.message).toContain('Authorization');
  });

  it('GET /api/me with invalid Bearer token should return 401', async () => {
    const response = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer invalid-token-here');

    expect(response.status).toBe(401);
    const body = response.body as ResponseEnvelope;
    expect(body.ok).toBe(false);
    expect(body.data).toBeNull();
    expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
  });

  it('GET /api/me with malformed Authorization header should return 401', async () => {
    const response = await request(app)
      .get('/api/me')
      .set('Authorization', 'InvalidFormat token');

    expect(response.status).toBe(401);
    const body = response.body as ResponseEnvelope;
    expect(body.ok).toBe(false);
    expect(body.data).toBeNull();
    expect(body.error).toHaveProperty('code', 'UNAUTHORIZED');
  });

  // Note: Tests with valid JWT tokens require actual Supabase authentication
  // and employee records in the database. These would be integration tests.
  // For now, we're testing the error cases which don't require DB setup.
});
