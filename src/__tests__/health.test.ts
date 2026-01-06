import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { ResponseEnvelope } from '../types/response.js';

describe('Health Routes', () => {
  const app = createApp();

  it('GET /health should return 200 with health data', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    const body = response.body as ResponseEnvelope;
    expect(body.ok).toBe(true);
    expect(body.data).toHaveProperty('status', 'up');
    expect(body.data).toHaveProperty('version');
    expect(body.data).toHaveProperty('env');
    expect(body.error).toBeNull();
  });

  it('GET /version should return 200 with version data', async () => {
    const response = await request(app).get('/version');

    expect(response.status).toBe(200);
    const body = response.body as ResponseEnvelope;
    expect(body.ok).toBe(true);
    expect(body.data).toHaveProperty('version');
    expect(body.error).toBeNull();
  });

  it('GET /nonexistent should return 404', async () => {
    const response = await request(app).get('/nonexistent');

    expect(response.status).toBe(404);
    const body = response.body as ResponseEnvelope;
    expect(body.ok).toBe(false);
    expect(body.data).toBeNull();
    expect(body.error).toHaveProperty('code', 'NOT_FOUND');
    expect(body.error?.message).toContain('/nonexistent');
  });

  it('should include request ID headers', async () => {
    const response = await request(app).get('/health');

    expect(response.headers).toHaveProperty('x-request-id');
    expect(response.headers).toHaveProperty('x-correlation-id');
  });
});
