import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { requireRole } from '../middleware/requireRole.js';
import type { Employee } from '../types/auth.js';

describe('requireRole middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: ReturnType<typeof vi.fn>;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    jsonMock = vi.fn();
    statusMock = vi.fn(() => ({ json: jsonMock }));
    
    mockRequest = {};
    mockResponse = {
      status: statusMock,
      json: jsonMock,
    };
    nextFunction = vi.fn();
  });

  it('should return 403 if no employee record in request', () => {
    const middleware = requireRole(['ADMIN']);
    middleware(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(statusMock).toHaveBeenCalledWith(403);
    expect(jsonMock).toHaveBeenCalled();
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should return 403 if employee role not in allowed roles', () => {
    const employee: Employee = {
      id: '123',
      display_name: 'Test User',
      email: 'test@example.com',
      phone: null,
      role: 'TECH',
      is_active: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };
    mockRequest.employee = employee;

    const middleware = requireRole(['ADMIN']);
    middleware(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(statusMock).toHaveBeenCalledWith(403);
    expect(jsonMock).toHaveBeenCalled();
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should call next() if employee role is in allowed roles', () => {
    const employee: Employee = {
      id: '123',
      display_name: 'Admin User',
      email: 'admin@example.com',
      phone: null,
      role: 'ADMIN',
      is_active: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };
    mockRequest.employee = employee;

    const middleware = requireRole(['ADMIN']);
    middleware(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
    expect(statusMock).not.toHaveBeenCalled();
  });

  it('should allow multiple roles', () => {
    const employee: Employee = {
      id: '123',
      display_name: 'Office User',
      email: 'office@example.com',
      phone: null,
      role: 'OFFICE',
      is_active: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };
    mockRequest.employee = employee;

    const middleware = requireRole(['ADMIN', 'OFFICE']);
    middleware(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
    expect(statusMock).not.toHaveBeenCalled();
  });

  it('should block TECH role when only ADMIN and OFFICE allowed', () => {
    const employee: Employee = {
      id: '123',
      display_name: 'Tech User',
      email: 'tech@example.com',
      phone: null,
      role: 'TECH',
      is_active: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };
    mockRequest.employee = employee;

    const middleware = requireRole(['ADMIN', 'OFFICE']);
    middleware(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(statusMock).toHaveBeenCalledWith(403);
    expect(nextFunction).not.toHaveBeenCalled();
  });
});
