import { describe, it, expect } from 'vitest';
import { successResponse, errorResponse } from '../types/response.js';

describe('Response Envelope', () => {
  it('should create a success response', () => {
    const data = { message: 'Hello' };
    const response = successResponse(data);

    expect(response.ok).toBe(true);
    expect(response.data).toEqual(data);
    expect(response.error).toBeNull();
  });

  it('should create a success response with meta', () => {
    const data = { message: 'Hello' };
    const meta = { page: 1 };
    const response = successResponse(data, meta);

    expect(response.ok).toBe(true);
    expect(response.data).toEqual(data);
    expect(response.error).toBeNull();
    expect(response.meta).toEqual(meta);
  });

  it('should create an error response', () => {
    const code = 'TEST_ERROR';
    const message = 'Test error message';
    const response = errorResponse(code, message);

    expect(response.ok).toBe(false);
    expect(response.data).toBeNull();
    expect(response.error).toEqual({
      code,
      message,
      details: undefined,
    });
  });

  it('should create an error response with details', () => {
    const code = 'TEST_ERROR';
    const message = 'Test error message';
    const details = { field: 'test' };
    const response = errorResponse(code, message, details);

    expect(response.ok).toBe(false);
    expect(response.data).toBeNull();
    expect(response.error).toEqual({
      code,
      message,
      details,
    });
  });
});
